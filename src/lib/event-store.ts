import { randomUUID } from "node:crypto";
import type {
	EventId,
	EventStore,
	StreamId,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { RedisClientType, RedisModules } from "redis";
import type { ServerConfig } from "./config.js";
import { Logger } from "./logger.js";

type NoRedisExtensions = Record<never, never>;
type RedisResp2Client = RedisClientType<
	RedisModules,
	NoRedisExtensions,
	NoRedisExtensions,
	2
>;

interface ManagedEventStore {
	mode: "off" | "memory" | "redis";
	eventStore?: EventStore;
	acquireReplayLease?: (eventId: EventId) => Promise<ReplayLeaseResult>;
	close: () => Promise<void>;
}

type ReplayLeaseResult =
	| { status: "acquired"; release: () => Promise<void> }
	| { status: "conflict" | "missing" };

interface MemoryEventRecord {
	streamId: StreamId;
	message: JSONRPCMessage;
	expiresAt: number;
}

const EVENT_STORE_CLEANUP_INTERVAL_MS = 30_000;

// Stream and event identifiers are embedded directly in Redis keys. Constrain
// them to a safe character set so a malformed Last-Event-ID header (client-
// controlled) cannot inject key separators or control characters.
const SAFE_EVENT_ID_PATTERN = /^[\w-]{1,128}$/;

function assertSafeRedisId(id: string, kind: "streamId" | "eventId"): string {
	if (!SAFE_EVENT_ID_PATTERN.test(id)) {
		throw new Error(
			`Invalid ${kind} for event store key: ${JSON.stringify(id)}`,
		);
	}
	return id;
}

class InMemoryEventStore implements EventStore {
	private readonly ttlMs: number;
	private readonly events = new Map<EventId, MemoryEventRecord>();
	private readonly streamEvents = new Map<StreamId, EventId[]>();
	private readonly activeReplayStreams = new Set<StreamId>();
	private lastCleanupAt = 0;

	constructor(ttlSeconds: number) {
		this.ttlMs = ttlSeconds * 1000;
	}

	private removeEvent(
		eventId: EventId,
		event: MemoryEventRecord | undefined = this.events.get(eventId),
	): void {
		if (!event) {
			return;
		}

		this.events.delete(eventId);

		const eventIds = this.streamEvents.get(event.streamId);
		if (!eventIds) {
			return;
		}

		const filtered = eventIds.filter((candidate) => candidate !== eventId);
		if (filtered.length === 0) {
			this.streamEvents.delete(event.streamId);
		} else if (filtered.length !== eventIds.length) {
			this.streamEvents.set(event.streamId, filtered);
		}
	}

	private getEventIfUnexpired(
		eventId: EventId,
		now = Date.now(),
	): MemoryEventRecord | undefined {
		const event = this.events.get(eventId);
		if (!event) {
			return undefined;
		}
		if (event.expiresAt > now) {
			return event;
		}

		this.removeEvent(eventId, event);
		return undefined;
	}

	private cleanupExpired(now = Date.now()): void {
		for (const [eventId, event] of this.events.entries()) {
			if (event.expiresAt <= now) {
				this.events.delete(eventId);
			}
		}

		for (const [streamId, eventIds] of this.streamEvents.entries()) {
			const filtered = eventIds.filter((eventId) => this.events.has(eventId));
			if (filtered.length === 0) {
				this.streamEvents.delete(streamId);
			} else if (filtered.length !== eventIds.length) {
				this.streamEvents.set(streamId, filtered);
			}
		}
	}

	private maybeCleanupExpired(now = Date.now()): void {
		if (now - this.lastCleanupAt < EVENT_STORE_CLEANUP_INTERVAL_MS) {
			return;
		}

		this.cleanupExpired(now);
		this.lastCleanupAt = now;
	}

	async storeEvent(
		streamId: StreamId,
		message: JSONRPCMessage,
	): Promise<EventId> {
		this.maybeCleanupExpired();

		const eventId = randomUUID();
		this.events.set(eventId, {
			streamId,
			message,
			expiresAt: Date.now() + this.ttlMs,
		});

		const streamIds = this.streamEvents.get(streamId) || [];
		streamIds.push(eventId);
		this.streamEvents.set(streamId, streamIds);

		return eventId;
	}

	async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
		const now = Date.now();
		this.maybeCleanupExpired(now);
		return this.getEventIfUnexpired(eventId, now)?.streamId;
	}

	async acquireReplayLease(eventId: EventId): Promise<ReplayLeaseResult> {
		const streamId = await this.getStreamIdForEventId(eventId);
		if (!streamId) {
			return { status: "missing" };
		}
		if (this.activeReplayStreams.has(streamId)) {
			return { status: "conflict" };
		}

		this.activeReplayStreams.add(streamId);
		let released = false;
		return {
			status: "acquired",
			release: async () => {
				if (!released) {
					released = true;
					this.activeReplayStreams.delete(streamId);
				}
			},
		};
	}

	async replayEventsAfter(
		lastEventId: EventId,
		{
			send,
		}: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
	): Promise<StreamId> {
		const now = Date.now();
		this.maybeCleanupExpired(now);

		const lastEvent = this.getEventIfUnexpired(lastEventId, now);
		if (!lastEvent) {
			throw new Error(`Event not found for replay: ${lastEventId}`);
		}

		const eventIds = this.streamEvents.get(lastEvent.streamId) || [];
		const index = eventIds.indexOf(lastEventId);
		if (index < 0) {
			throw new Error(
				`Stream mapping not found for replay event: ${lastEventId}`,
			);
		}

		for (const eventId of eventIds.slice(index + 1)) {
			const event = this.getEventIfUnexpired(eventId, now);
			if (!event) {
				continue;
			}
			await send(eventId, event.message);
		}

		return lastEvent.streamId;
	}
}

class RedisEventStore implements EventStore {
	client: RedisResp2Client | undefined;
	private readonly redisUrl: string;
	private readonly ttlSeconds: number;
	private readonly keyPrefix: string;
	private connectPromise: Promise<unknown> | undefined;

	constructor(redisUrl: string, keyPrefix: string, ttlSeconds: number) {
		this.redisUrl = redisUrl;
		this.ttlSeconds = ttlSeconds;
		this.keyPrefix = keyPrefix;
	}

	private counterKey(): string {
		return `${this.keyPrefix}:counter`;
	}

	private eventKey(eventId: EventId): string {
		return `${this.keyPrefix}:event:${assertSafeRedisId(eventId, "eventId")}`;
	}

	private streamEventsKey(streamId: StreamId): string {
		return `${this.keyPrefix}:stream:${assertSafeRedisId(streamId, "streamId")}:events`;
	}

	private replayLeaseKey(streamId: StreamId): string {
		return `${this.keyPrefix}:stream:${assertSafeRedisId(streamId, "streamId")}:replay-lease`;
	}

	private async ensureConnected(): Promise<void> {
		if (!this.client) {
			const { createClient } = await import("redis");
			this.client = createClient({
				url: this.redisUrl,
				// node-redis v6 defaults to RESP3, a 5-second command timeout, and a
				// 30-second keepalive delay. Keep the event store's v5 behavior stable
				// while taking the v6 fixes and supported runtime baseline.
				RESP: 2,
				socket: { keepAliveInitialDelay: 5_000 },
				commandOptions: { timeout: undefined },
			});
			this.client.on("error", (error) => {
				Logger.error("Redis event store error", {
					metadata: {
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
		}

		if (this.client.isOpen) {
			return;
		}

		if (!this.connectPromise) {
			this.connectPromise = this.client.connect().catch((error) => {
				this.connectPromise = undefined;
				throw error;
			});
		}

		await this.connectPromise;
	}

	private getConnectedClient(): RedisResp2Client {
		if (!this.client) {
			throw new Error("Redis client not initialized");
		}
		return this.client;
	}

	async storeEvent(
		streamId: StreamId,
		message: JSONRPCMessage,
	): Promise<EventId> {
		await this.ensureConnected();
		const client = this.getConnectedClient();

		const sequence = await client.incr(this.counterKey());
		const eventId = randomUUID();
		const eventKey = this.eventKey(eventId);
		const streamKey = this.streamEventsKey(streamId);

		const tx = client.multi();
		tx.hSet(eventKey, {
			streamId,
			sequence: String(sequence),
			message: JSON.stringify(message),
		});
		tx.expire(eventKey, this.ttlSeconds);
		tx.zAdd(streamKey, {
			score: sequence,
			value: eventId,
		});
		tx.expire(streamKey, this.ttlSeconds);
		await tx.exec();

		return eventId;
	}

	async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
		if (!SAFE_EVENT_ID_PATTERN.test(eventId)) {
			return undefined;
		}
		await this.ensureConnected();
		const streamId = await this.getConnectedClient().hGet(
			this.eventKey(eventId),
			"streamId",
		);
		return streamId || undefined;
	}

	async acquireReplayLease(eventId: EventId): Promise<ReplayLeaseResult> {
		const streamId = await this.getStreamIdForEventId(eventId);
		if (!streamId) {
			return { status: "missing" };
		}

		const client = this.getConnectedClient();
		const leaseKey = this.replayLeaseKey(streamId);
		const ownerToken = randomUUID();
		const acquired = await client.set(leaseKey, ownerToken, {
			NX: true,
			PX: 60_000,
		});
		if (acquired !== "OK") {
			return { status: "conflict" };
		}

		let released = false;
		return {
			status: "acquired",
			release: async () => {
				if (released) {
					return;
				}
				released = true;
				await client.eval(
					"if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
					{ keys: [leaseKey], arguments: [ownerToken] },
				);
			},
		};
	}

	async replayEventsAfter(
		lastEventId: EventId,
		{
			send,
		}: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
	): Promise<StreamId> {
		await this.ensureConnected();
		const client = this.getConnectedClient();

		const baseEvent = await client.hGetAll(this.eventKey(lastEventId));
		const streamId = baseEvent.streamId;
		if (!streamId) {
			throw new Error(`Event not found for replay: ${lastEventId}`);
		}

		const baseScore = Number(baseEvent.sequence);
		if (!Number.isFinite(baseScore)) {
			throw new Error(`Invalid replay sequence for event: ${lastEventId}`);
		}

		const eventIds = await client.zRangeByScore(
			this.streamEventsKey(streamId),
			`(${baseScore}`,
			"+inf",
		);

		if (eventIds.length === 0) {
			return streamId;
		}

		const tx = client.multi();
		for (const eventId of eventIds) {
			tx.hGet(this.eventKey(eventId), "message");
		}
		const encodedMessages = await tx.exec();

		for (const [index, eventId] of eventIds.entries()) {
			const encoded = encodedMessages[index];
			if (typeof encoded !== "string") {
				continue;
			}
			let message: JSONRPCMessage;
			try {
				message = JSON.parse(encoded) as JSONRPCMessage;
			} catch {
				continue;
			}
			await send(eventId, message);
		}

		return streamId;
	}

	async close(): Promise<void> {
		if (!this.client) {
			return;
		}
		if (!this.client.isOpen && this.connectPromise) {
			try {
				await this.connectPromise;
			} catch {
				// Ignore connect failures during shutdown.
			}
		}
		if (this.client.isOpen) {
			await this.client.close();
		}
	}
}

export function createManagedEventStore(
	config: ServerConfig,
): ManagedEventStore {
	if (config.eventStore.mode === "off") {
		return {
			mode: "off",
			close: async () => {},
		};
	}

	if (config.eventStore.mode === "memory") {
		const memoryStore = new InMemoryEventStore(config.eventStore.ttlSeconds);
		return {
			mode: "memory",
			eventStore: memoryStore,
			acquireReplayLease: (eventId) => memoryStore.acquireReplayLease(eventId),
			close: async () => {},
		};
	}

	const redisStore = new RedisEventStore(
		config.eventStore.redisUrl as string,
		config.eventStore.redisKeyPrefix,
		config.eventStore.ttlSeconds,
	);

	return {
		mode: "redis",
		eventStore: redisStore,
		acquireReplayLease: (eventId) => redisStore.acquireReplayLease(eventId),
		close: async () => {
			await redisStore.close();
		},
	};
}
