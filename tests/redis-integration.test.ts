import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "redis";
import { createManagedEventStore } from "../src/lib/event-store.js";
import { consumeRedisRateLimitToken } from "../src/lib/security.js";

const redisUrl = process.env.MCP_REDIS_TEST_URL ?? "redis://127.0.0.1:6379";

async function redisIsAvailable(): Promise<boolean> {
	const client = createClient({ url: redisUrl });
	client.on("error", () => {});
	try {
		await client.connect();
		await client.ping();
		return true;
	} catch {
		return false;
	} finally {
		if (client.isOpen) {
			client.destroy();
		}
	}
}

test("Redis event store preserves v5 protocol and timeout defaults under node-redis v6", {
	skip: !(await redisIsAvailable()) && "Redis is unavailable",
}, async () => {
	const keyPrefix = `portkey-mcp:test:${randomUUID()}`;
	const managedStore = createManagedEventStore({
		transport: "http",
		sessionMode: "stateless",
		eventStore: {
			mode: "redis",
			ttlSeconds: 60,
			redisUrl,
			redisKeyPrefix: keyPrefix,
			encryptionKey: Buffer.alloc(32, 7),
		},
		protocol: "http",
		port: 3000,
		host: "127.0.0.1",
		maxSessions: 100,
		sessionTimeout: 3_600_000,
		shutdownTimeout: 10_000,
		tls: { enabled: false },
	});
	const ownerKey = "principal-a";
	const eventStore = managedStore.eventStoreForOwner(ownerKey) as unknown as {
		client?: {
			options: {
				RESP?: number;
				commandOptions?: { timeout?: number };
				socket?: { keepAliveInitialDelay?: number };
			};
			del: (keys: string[]) => Promise<number>;
			hGet: (key: string, field: string) => Promise<string | null>;
		};
		storeEvent: (streamId: string, message: unknown) => Promise<string>;
		replayEventsAfter: (
			lastEventId: string,
			options: {
				send: (eventId: string, message: unknown) => Promise<void>;
			},
		) => Promise<string>;
	};

	try {
		const firstEventId = await eventStore.storeEvent("stream-1", {
			jsonrpc: "2.0",
			method: "first",
		});
		const secondEventId = await eventStore.storeEvent("stream-1", {
			jsonrpc: "2.0",
			method: "second",
		});
		const replayed: Array<{ eventId: string; message: unknown }> = [];
		assert.match(firstEventId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
		assert.match(secondEventId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
		assert.notEqual(firstEventId, secondEventId);
		const storedPayload = await eventStore.client?.hGet(
			`${keyPrefix}:event:${secondEventId}`,
			"message",
		);
		assert.match(storedPayload ?? "", /^v1\./);
		assert.ok(!storedPayload?.includes('"method":"second"'));
		const firstLease = await managedStore.acquireReplayLease?.(
			firstEventId,
			ownerKey,
		);
		assert.equal(firstLease?.status, "acquired");
		assert.equal(
			(await managedStore.acquireReplayLease?.(firstEventId, ownerKey))?.status,
			"conflict",
		);
		if (firstLease?.status === "acquired") {
			await firstLease.release();
		}

		const streamId = await eventStore.replayEventsAfter(firstEventId, {
			send: async (eventId, message) => {
				replayed.push({ eventId, message });
			},
		});

		assert.equal(streamId, "stream-1");
		assert.deepEqual(replayed, [
			{
				eventId: secondEventId,
				message: { jsonrpc: "2.0", method: "second" },
			},
		]);
		assert.equal(eventStore.client?.options.RESP, 2);
		assert.equal(
			eventStore.client?.options.socket?.keepAliveInitialDelay,
			5_000,
		);
		assert.ok(
			Object.hasOwn(eventStore.client?.options.commandOptions ?? {}, "timeout"),
		);
		assert.equal(eventStore.client?.options.commandOptions?.timeout, undefined);

		await eventStore.client?.del([
			`${keyPrefix}:counter`,
			`${keyPrefix}:event:${firstEventId}`,
			`${keyPrefix}:event:${secondEventId}`,
			`${keyPrefix}:stream:stream-1:events`,
		]);
	} finally {
		await managedStore.close();
	}
});

test("Redis rate limiting consumes a shared bucket atomically", {
	skip: !(await redisIsAvailable()) && "Redis is unavailable",
}, async () => {
	const client = createClient({ url: redisUrl });
	const key = `portkey-mcp:test:rate-limit:${randomUUID()}`;
	await client.connect();

	try {
		const decisions = await Promise.all(
			Array.from({ length: 8 }, () =>
				consumeRedisRateLimitToken(client, {
					key,
					maxTokens: 1,
					windowMs: 60_000,
					refillRate: 1,
					now: Date.now(),
				}),
			),
		);

		assert.equal(decisions.filter((decision) => decision.allowed).length, 1);
	} finally {
		await client.del(key);
		await client.close();
	}
});
