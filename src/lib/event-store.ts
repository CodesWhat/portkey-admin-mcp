import type {
	EventId,
	EventStore,
	StreamId,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createClient, type RedisClientType } from "redis";
import type { ServerConfig } from "./config.js";
import { Logger } from "./logger.js";

interface ManagedEventStore {
	mode: "off" | "memory" | "redis";
	eventStore?: EventStore;
	close: () => Promise<void>;
}

interface MemoryEventRecord {
	streamId: StreamId;
	message: JSONRPCMessage;
	expiresAt: number;
}

const EVENT_STORE_CLEANUP_INTERVAL_MS = 30_000;

class InMemoryEventStore implements EventStore {
	private sequence = 0;
	private readonly ttlMs: number;
	private readonly events = new Map<EventId, MemoryEventRecord>();
	private readonly streamEvents = new Map<StreamId, EventId[]>();
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

		this.sequence += 1;
		const eventId = String(this.sequence);
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
	private readonly client: RedisClientType;
	private readonly ttlSeconds: number;
	private readonly keyPrefix: string;
	private connectPromise: Promise<unknown> | undefined;

	constructor(redisUrl: string, keyPrefix: string, ttlSeconds: number) {
		this.ttlSeconds = ttlSeconds;
		this.keyPrefix = keyPrefix;

		this.client = createClient({
			url: redisUrl,
		});
		this.client.on("error", (error) => {
			Logger.error("Redis event store error", {
				metadata: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
		});
	}

	private counterKey(): string {
		return `${this.keyPrefix}:counter`;
	}

	private eventKey(eventId: EventId): string {
		return `${this.keyPrefix}:event:${eventId}`;
	}

	private streamEventsKey(streamId: StreamId): string {
		return `${this.keyPrefix}:stream:${streamId}:events`;
	}

	private async ensureConnected(): Promise<void> {
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

	async storeEvent(
		streamId: StreamId,
		message: JSONRPCMessage,
	): Promise<EventId> {
		await this.ensureConnected();

		const eventId = String(await this.client.incr(this.counterKey()));
		const eventKey = this.eventKey(eventId);
		const streamKey = this.streamEventsKey(streamId);

		const tx = this.client.multi();
		tx.hSet(eventKey, {
			streamId,
			message: JSON.stringify(message),
		});
		tx.expire(eventKey, this.ttlSeconds);
		tx.zAdd(streamKey, {
			score: Number(eventId),
			value: eventId,
		});
		tx.expire(streamKey, this.ttlSeconds);
		await tx.exec();

		return eventId;
	}

	async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
		await this.ensureConnected();
		const streamId = await this.client.hGet(this.eventKey(eventId), "streamId");
		return streamId || undefined;
	}

	async replayEventsAfter(
		lastEventId: EventId,
		{
			send,
		}: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
	): Promise<StreamId> {
		await this.ensureConnected();

		const baseEvent = await this.client.hGetAll(this.eventKey(lastEventId));
		const streamId = baseEvent.streamId;
		if (!streamId) {
			throw new Error(`Event not found for replay: ${lastEventId}`);
		}

		const baseScore = Number(lastEventId);
		if (!Number.isFinite(baseScore)) {
			throw new Error(`Invalid replay event ID: ${lastEventId}`);
		}

		const eventIds = await this.client.zRangeByScore(
			this.streamEventsKey(streamId),
			`(${baseScore}`,
			"+inf",
		);

		if (eventIds.length === 0) {
			return streamId;
		}

		const tx = this.client.multi();
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
		if (!this.client.isOpen && this.connectPromise) {
			try {
				await this.connectPromise;
			} catch {
				// Ignore connect failures during shutdown.
			}
		}
		if (this.client.isOpen) {
			await this.client.quit();
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
		return {
			mode: "memory",
			eventStore: new InMemoryEventStore(config.eventStore.ttlSeconds),
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
		close: async () => {
			await redisStore.close();
		},
	};
}
