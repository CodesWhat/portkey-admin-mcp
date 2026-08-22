import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	randomUUID,
} from "node:crypto";
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

export interface ManagedEventStore {
	mode: "off" | "memory" | "redis";
	eventStoreForOwner: (ownerKey: string) => EventStore | undefined;
	acquireReplayLease?: (
		eventId: EventId,
		ownerKey: string,
	) => Promise<ReplayLeaseResult>;
	close: () => Promise<void>;
}

type ReplayLeaseResult =
	| { status: "acquired"; release: () => Promise<void> }
	| { status: "conflict" | "missing" };

interface MemoryEventRecord {
	streamId: StreamId;
	ownerKey: string;
	message: JSONRPCMessage;
	expiresAt: number;
}

interface MemoryEventStoreState {
	events: Map<EventId, MemoryEventRecord>;
	streamEvents: Map<StreamId, EventId[]>;
	activeReplayStreams: Set<StreamId>;
	lastCleanupAt: number;
}

const EVENT_STORE_CLEANUP_INTERVAL_MS = 30_000;
const EVENT_PAYLOAD_ENCRYPTION_VERSION = "v1";
const EVENT_PAYLOAD_AAD = Buffer.from(
	"portkey-admin-mcp:event-payload:v1",
	"utf8",
);

function assertEncryptionKey(key: Buffer): void {
	if (key.length !== 32) {
		throw new Error("Event payload encryption requires a 32-byte key");
	}
}

export function encryptEventPayload(
	message: JSONRPCMessage,
	key: Buffer,
): string {
	assertEncryptionKey(key);
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv, {
		authTagLength: 16,
	});
	cipher.setAAD(EVENT_PAYLOAD_AAD);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(message), "utf8"),
		cipher.final(),
	]);
	const authenticationTag = cipher.getAuthTag();
	return [
		EVENT_PAYLOAD_ENCRYPTION_VERSION,
		iv.toString("base64url"),
		authenticationTag.toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}

export function decryptEventPayload(
	encoded: string,
	key: Buffer,
): JSONRPCMessage {
	assertEncryptionKey(key);
	const [version, encodedIv, encodedTag, encodedCiphertext, ...rest] =
		encoded.split(".");
	if (
		version !== EVENT_PAYLOAD_ENCRYPTION_VERSION ||
		!encodedIv ||
		!encodedTag ||
		!encodedCiphertext ||
		rest.length > 0
	) {
		throw new Error("Invalid encrypted event payload envelope");
	}

	const iv = Buffer.from(encodedIv, "base64url");
	const authenticationTag = Buffer.from(encodedTag, "base64url");
	if (iv.length !== 12) {
		throw new Error("Encrypted event payload must use a 12-byte nonce");
	}
	if (authenticationTag.length !== 16) {
		throw new Error(
			"Encrypted event payload must use a 16-byte authentication tag",
		);
	}
	const decipher = createDecipheriv("aes-256-gcm", key, iv, {
		authTagLength: 16,
	});
	decipher.setAAD(EVENT_PAYLOAD_AAD);
	decipher.setAuthTag(authenticationTag);
	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(encodedCiphertext, "base64url")),
		decipher.final(),
	]);
	return JSON.parse(plaintext.toString("utf8")) as JSONRPCMessage;
}

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
	private readonly ownerKey: string;
	private readonly state: MemoryEventStoreState;

	constructor(
		ttlSeconds: number,
		ownerKey: string,
		state: MemoryEventStoreState = {
			events: new Map(),
			streamEvents: new Map(),
			activeReplayStreams: new Set(),
			lastCleanupAt: 0,
		},
	) {
		this.ttlMs = ttlSeconds * 1000;
		this.ownerKey = ownerKey;
		this.state = state;
	}

	forOwner(ownerKey: string): InMemoryEventStore {
		return new InMemoryEventStore(this.ttlMs / 1000, ownerKey, this.state);
	}

	private removeEvent(
		eventId: EventId,
		event: MemoryEventRecord | undefined = this.state.events.get(eventId),
	): void {
		if (!event) {
			return;
		}

		this.state.events.delete(eventId);

		const eventIds = this.state.streamEvents.get(event.streamId);
		if (!eventIds) {
			return;
		}

		const filtered = eventIds.filter((candidate) => candidate !== eventId);
		if (filtered.length === 0) {
			this.state.streamEvents.delete(event.streamId);
		} else if (filtered.length !== eventIds.length) {
			this.state.streamEvents.set(event.streamId, filtered);
		}
	}

	private getEventIfUnexpired(
		eventId: EventId,
		now = Date.now(),
	): MemoryEventRecord | undefined {
		const event = this.state.events.get(eventId);
		if (!event) {
			return undefined;
		}
		if (event.ownerKey !== this.ownerKey) {
			return undefined;
		}
		if (event.expiresAt > now) {
			return event;
		}

		this.removeEvent(eventId, event);
		return undefined;
	}

	private cleanupExpired(now = Date.now()): void {
		for (const [eventId, event] of this.state.events.entries()) {
			if (event.expiresAt <= now) {
				this.state.events.delete(eventId);
			}
		}

		for (const [streamId, eventIds] of this.state.streamEvents.entries()) {
			const filtered = eventIds.filter((eventId) =>
				this.state.events.has(eventId),
			);
			if (filtered.length === 0) {
				this.state.streamEvents.delete(streamId);
			} else if (filtered.length !== eventIds.length) {
				this.state.streamEvents.set(streamId, filtered);
			}
		}
	}

	private maybeCleanupExpired(now = Date.now()): void {
		if (now - this.state.lastCleanupAt < EVENT_STORE_CLEANUP_INTERVAL_MS) {
			return;
		}

		this.cleanupExpired(now);
		this.state.lastCleanupAt = now;
	}

	async storeEvent(
		streamId: StreamId,
		message: JSONRPCMessage,
	): Promise<EventId> {
		this.maybeCleanupExpired();

		const eventId = randomUUID();
		this.state.events.set(eventId, {
			streamId,
			ownerKey: this.ownerKey,
			message,
			expiresAt: Date.now() + this.ttlMs,
		});

		const streamIds = this.state.streamEvents.get(streamId) || [];
		streamIds.push(eventId);
		this.state.streamEvents.set(streamId, streamIds);

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
		if (this.state.activeReplayStreams.has(streamId)) {
			return { status: "conflict" };
		}

		this.state.activeReplayStreams.add(streamId);
		let released = false;
		return {
			status: "acquired",
			release: async () => {
				if (!released) {
					released = true;
					this.state.activeReplayStreams.delete(streamId);
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

		const eventIds = this.state.streamEvents.get(lastEvent.streamId) || [];
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
	private readonly redisUrl: string;
	private readonly ttlSeconds: number;
	private readonly keyPrefix: string;
	private readonly ownerKey: string;
	private readonly encryptionKey: Buffer;
	private readonly commandTimeoutMs: number;
	private readonly connection: {
		client?: RedisResp2Client;
		connectPromise?: Promise<unknown>;
	};

	constructor(
		redisUrl: string,
		keyPrefix: string,
		ttlSeconds: number,
		ownerKey: string,
		encryptionKey: Buffer,
		commandTimeoutMs: number,
		connection: {
			client?: RedisResp2Client;
			connectPromise?: Promise<unknown>;
		} = {},
	) {
		this.redisUrl = redisUrl;
		this.ttlSeconds = ttlSeconds;
		this.keyPrefix = keyPrefix;
		this.ownerKey = ownerKey;
		this.encryptionKey = encryptionKey;
		this.commandTimeoutMs = commandTimeoutMs;
		this.connection = connection;
	}

	get client(): RedisResp2Client | undefined {
		return this.connection.client;
	}

	set client(client: RedisResp2Client | undefined) {
		this.connection.client = client;
	}

	forOwner(ownerKey: string): RedisEventStore {
		return new RedisEventStore(
			this.redisUrl,
			this.keyPrefix,
			this.ttlSeconds,
			ownerKey,
			this.encryptionKey,
			this.commandTimeoutMs,
			this.connection,
		);
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
		if (!this.connection.client) {
			const { createClient } = await import("redis");
			this.connection.client = createClient({
				url: this.redisUrl,
				// node-redis v6 defaults to RESP3, a 5-second command timeout, and a
				// 30-second keepalive delay. storeEvent/replayEventsAfter sit on the
				// MCP request-critical path (SSE sends, GET replay), so an unbounded
				// command wait here would hang requests indefinitely if Redis accepts
				// TCP but stalls on replies. Keep RESP2 for v5-compatible replies, but
				// use a bounded, configurable command timeout (default 5s, matching
				// node-redis's own default) instead of disabling it. Set
				// MCP_EVENT_STORE_COMMAND_TIMEOUT_MS=0 to restore the old unbounded
				// (v5-compatible) behavior.
				RESP: 2,
				socket: { keepAliveInitialDelay: 5_000 },
				commandOptions: {
					timeout:
						this.commandTimeoutMs === 0 ? undefined : this.commandTimeoutMs,
				},
			});
			this.connection.client.on("error", (error) => {
				Logger.error("Redis event store error", {
					metadata: {
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
		}

		if (this.connection.client.isOpen) {
			return;
		}

		if (!this.connection.connectPromise) {
			this.connection.connectPromise = this.connection.client
				.connect()
				.catch((error) => {
					this.connection.connectPromise = undefined;
					throw error;
				});
		}

		await this.connection.connectPromise;
	}

	private getConnectedClient(): RedisResp2Client {
		if (!this.connection.client) {
			throw new Error("Redis client not initialized");
		}
		return this.connection.client;
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
			ownerKey: this.ownerKey,
			sequence: String(sequence),
			message: encryptEventPayload(message, this.encryptionKey),
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
		const event = await this.getConnectedClient().hGetAll(
			this.eventKey(eventId),
		);
		return event.ownerKey === this.ownerKey
			? event.streamId || undefined
			: undefined;
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
		if (!streamId || baseEvent.ownerKey !== this.ownerKey) {
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
			tx.hGetAll(this.eventKey(eventId));
		}
		const encodedEvents = await tx.exec();

		for (const [index, eventId] of eventIds.entries()) {
			const event = encodedEvents[index];
			if (
				typeof event !== "object" ||
				event === null ||
				!("message" in event) ||
				!("ownerKey" in event) ||
				event.ownerKey !== this.ownerKey ||
				typeof event.message !== "string"
			) {
				continue;
			}
			let message: JSONRPCMessage;
			try {
				message = decryptEventPayload(event.message, this.encryptionKey);
			} catch {
				continue;
			}
			await send(eventId, message);
		}

		return streamId;
	}

	async close(): Promise<void> {
		if (!this.connection.client) {
			return;
		}
		if (!this.connection.client.isOpen && this.connection.connectPromise) {
			try {
				await this.connection.connectPromise;
			} catch {
				// Ignore connect failures during shutdown.
			}
		}
		if (this.connection.client.isOpen) {
			await this.connection.client.close();
		}
	}
}

export function createManagedEventStore(
	config: ServerConfig,
): ManagedEventStore {
	if (config.eventStore.mode === "off") {
		return {
			mode: "off",
			eventStoreForOwner: () => undefined,
			close: async () => {},
		};
	}

	if (config.eventStore.mode === "memory") {
		const memoryStore = new InMemoryEventStore(
			config.eventStore.ttlSeconds,
			"internal",
		);
		return {
			mode: "memory",
			eventStoreForOwner: (ownerKey) => memoryStore.forOwner(ownerKey),
			acquireReplayLease: (eventId, ownerKey) =>
				memoryStore.forOwner(ownerKey).acquireReplayLease(eventId),
			close: async () => {},
		};
	}

	const encryptionKey = config.eventStore.encryptionKey;
	if (!encryptionKey) {
		throw new Error(
			"Redis event store requires MCP_EVENT_ENCRYPTION_KEY configuration",
		);
	}

	const redisStore = new RedisEventStore(
		config.eventStore.redisUrl as string,
		config.eventStore.redisKeyPrefix,
		config.eventStore.ttlSeconds,
		"internal",
		encryptionKey,
		config.eventStore.commandTimeoutMs,
	);

	return {
		mode: "redis",
		eventStoreForOwner: (ownerKey) => redisStore.forOwner(ownerKey),
		acquireReplayLease: (eventId, ownerKey) =>
			redisStore.forOwner(ownerKey).acquireReplayLease(eventId),
		close: async () => {
			await redisStore.close();
		},
	};
}
