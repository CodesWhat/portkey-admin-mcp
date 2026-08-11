import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { ServerConfig } from "../src/lib/config.js";
import {
	createManagedEventStore,
	decryptEventPayload,
	encryptEventPayload,
} from "../src/lib/event-store.js";

function eventStoreConfig(
	eventStore: ServerConfig["eventStore"],
): ServerConfig {
	return {
		transport: "http",
		sessionMode: "stateless",
		eventStore,
		protocol: "http",
		port: 3000,
		host: "127.0.0.1",
		maxSessions: 100,
		sessionTimeout: 3_600_000,
		shutdownTimeout: 10_000,
		tls: { enabled: false },
	};
}

function redisEventStoreConfig(
	encryptionKey: Buffer | undefined = Buffer.alloc(32, 7),
): ServerConfig {
	return eventStoreConfig({
		mode: "redis",
		ttlSeconds: 60,
		redisUrl: "redis://127.0.0.1:6379",
		redisKeyPrefix: "test-events",
		encryptionKey,
	});
}

describe("event payload envelope validation", () => {
	it("rejects invalid keys and malformed authenticated-encryption envelopes", () => {
		const key = Buffer.alloc(32, 7);
		const encrypted = encryptEventPayload(
			{ jsonrpc: "2.0", method: "notifications/tools/list_changed" },
			key,
		);
		const [version, iv, tag, ciphertext] = encrypted.split(".") as [
			string,
			string,
			string,
			string,
		];

		assert.throws(
			() =>
				encryptEventPayload(
					{ jsonrpc: "2.0", method: "ping" },
					key.subarray(1),
				),
			/32-byte key/,
		);
		assert.throws(
			() => decryptEventPayload(encrypted, key.subarray(1)),
			/32-byte key/,
		);
		assert.throws(
			() => decryptEventPayload(`${version}.${iv}.${tag}`, key),
			/Invalid encrypted event payload envelope/,
		);
		assert.throws(
			() =>
				decryptEventPayload(
					`${version}.${Buffer.alloc(8).toString("base64url")}.${tag}.${ciphertext}`,
					key,
				),
			/12-byte nonce/,
		);
	});
});

describe("managed event-store modes", () => {
	it("keeps the off mode inert and rejects Redis without an encryption key", async () => {
		const offStore = createManagedEventStore(
			eventStoreConfig({
				mode: "off",
				ttlSeconds: 60,
				redisKeyPrefix: "unused",
			}),
		);

		assert.equal(offStore.mode, "off");
		assert.equal(offStore.eventStoreForOwner("principal-a"), undefined);
		await offStore.close();
		assert.throws(
			() =>
				createManagedEventStore(
					eventStoreConfig({
						mode: "redis",
						ttlSeconds: 60,
						redisUrl: "redis://127.0.0.1:6379",
						redisKeyPrefix: "test-events",
					}),
				),
			/MCP_EVENT_ENCRYPTION_KEY/,
		);
	});

	it("expires memory events and releases replay leases idempotently", async () => {
		const originalDateNow = Date.now;
		let now = 31_000;
		Date.now = () => now;

		try {
			const managedStore = createManagedEventStore(
				eventStoreConfig({
					mode: "memory",
					ttlSeconds: 1,
					redisKeyPrefix: "unused",
				}),
			);
			const eventStore = managedStore.eventStoreForOwner("principal-a");
			assert.ok(eventStore);
			const eventId = await eventStore.storeEvent("stream-1", {
				jsonrpc: "2.0",
				method: "first",
			});
			const lease = await managedStore.acquireReplayLease?.(
				eventId,
				"principal-a",
			);
			assert.equal(lease?.status, "acquired");
			if (lease?.status === "acquired") {
				await lease.release();
				await lease.release();
			}

			now = 33_000;
			assert.equal(
				await eventStore.getStreamIdForEventId?.(eventId),
				undefined,
			);
			await assert.rejects(
				() =>
					eventStore.replayEventsAfter(eventId, {
						send: async () => {},
					}),
				/Event not found for replay/,
			);
		} finally {
			Date.now = originalDateNow;
		}
	});
});

describe("Redis event-store behavior", () => {
	it("persists encrypted events and their stream index in one transaction", async () => {
		const encryptionKey = Buffer.alloc(32, 7);
		const managedStore = createManagedEventStore(
			redisEventStoreConfig(encryptionKey),
		);
		const transactionCalls: Array<{ method: string; args: unknown[] }> = [];
		const transaction = {
			hSet(...args: unknown[]) {
				transactionCalls.push({ method: "hSet", args });
				return transaction;
			},
			expire(...args: unknown[]) {
				transactionCalls.push({ method: "expire", args });
				return transaction;
			},
			zAdd(...args: unknown[]) {
				transactionCalls.push({ method: "zAdd", args });
				return transaction;
			},
			async exec() {
				transactionCalls.push({ method: "exec", args: [] });
				return [];
			},
		};
		const eventStore = managedStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			client: unknown;
			storeEvent: (
				streamId: string,
				message: JSONRPCMessage,
			) => Promise<string>;
		};
		eventStore.client = {
			isOpen: true,
			async incr(key: string) {
				assert.equal(key, "test-events:counter");
				return 42;
			},
			multi: () => transaction,
		};

		const eventId = await eventStore.storeEvent("stream-1", {
			jsonrpc: "2.0",
			method: "notifications/resources/updated",
		});

		assert.match(eventId, /^[0-9a-f-]{36}$/);
		assert.deepEqual(
			transactionCalls.map(({ method }) => method),
			["hSet", "expire", "zAdd", "expire", "exec"],
		);
		const storedRecord = transactionCalls[0]?.args[1] as {
			streamId: string;
			ownerKey: string;
			sequence: string;
			message: string;
		};
		assert.deepEqual(
			{
				streamId: storedRecord.streamId,
				ownerKey: storedRecord.ownerKey,
				sequence: storedRecord.sequence,
			},
			{ streamId: "stream-1", ownerKey: "principal-a", sequence: "42" },
		);
		assert.deepEqual(decryptEventPayload(storedRecord.message, encryptionKey), {
			jsonrpc: "2.0",
			method: "notifications/resources/updated",
		});

		await assert.rejects(
			() =>
				eventStore.storeEvent("unsafe:stream", {
					jsonrpc: "2.0",
					method: "ping",
				}),
			/Invalid streamId/,
		);
	});

	it("isolates event ownership and serializes replay leases", async () => {
		const managedStore = createManagedEventStore(redisEventStoreConfig());
		let currentEvent: Record<string, string> = {
			streamId: "stream-1",
			ownerKey: "principal-a",
		};
		let leaseResult: string | null = "OK";
		const evalCalls: Array<{ keys: string[]; arguments: string[] }> = [];
		const eventStore = managedStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			client: unknown;
			getStreamIdForEventId: (eventId: string) => Promise<string | undefined>;
			acquireReplayLease: (
				eventId: string,
			) => Promise<
				| { status: "missing" | "conflict" }
				| { status: "acquired"; release: () => Promise<void> }
			>;
		};
		eventStore.client = {
			isOpen: true,
			async hGetAll() {
				return currentEvent;
			},
			async set() {
				return leaseResult;
			},
			async eval(
				_script: string,
				options: { keys: string[]; arguments: string[] },
			) {
				evalCalls.push(options);
				return 1;
			},
		};

		assert.equal(
			await eventStore.getStreamIdForEventId("unsafe:event:id"),
			undefined,
		);
		assert.equal(await eventStore.getStreamIdForEventId("event-1"), "stream-1");
		currentEvent = { streamId: "stream-1", ownerKey: "principal-b" };
		assert.equal(await eventStore.getStreamIdForEventId("event-1"), undefined);
		assert.equal(
			(await eventStore.acquireReplayLease("event-1")).status,
			"missing",
		);

		currentEvent = { streamId: "stream-1", ownerKey: "principal-a" };
		leaseResult = null;
		assert.equal(
			(await eventStore.acquireReplayLease("event-1")).status,
			"conflict",
		);
		leaseResult = "OK";
		const lease = await eventStore.acquireReplayLease("event-1");
		assert.equal(lease.status, "acquired");
		if (lease.status === "acquired") {
			await lease.release();
			await lease.release();
		}
		assert.equal(evalCalls.length, 1);
		assert.deepEqual(evalCalls[0]?.keys, [
			"test-events:stream:stream-1:replay-lease",
		]);
	});

	it("rejects invalid replay cursors and skips inaccessible or corrupt events", async () => {
		const encryptionKey = Buffer.alloc(32, 7);
		const managedStore = createManagedEventStore(
			redisEventStoreConfig(encryptionKey),
		);
		let baseEvent: Record<string, string> = {
			streamId: "stream-1",
			ownerKey: "principal-b",
			sequence: "1",
		};
		let eventIds: string[] = [];
		let encodedEvents: unknown[] = [];
		const eventStore = managedStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			client: unknown;
			replayEventsAfter: (
				lastEventId: string,
				options: {
					send: (eventId: string, message: JSONRPCMessage) => Promise<void>;
				},
			) => Promise<string>;
		};
		eventStore.client = {
			isOpen: true,
			async hGetAll() {
				return baseEvent;
			},
			async zRangeByScore() {
				return eventIds;
			},
			multi() {
				return {
					hGetAll() {
						return this;
					},
					async exec() {
						return encodedEvents;
					},
				};
			},
		};

		await assert.rejects(
			() =>
				eventStore.replayEventsAfter("event-1", {
					send: async () => {},
				}),
			/Event not found for replay/,
		);
		baseEvent = {
			streamId: "stream-1",
			ownerKey: "principal-a",
			sequence: "not-a-number",
		};
		await assert.rejects(
			() =>
				eventStore.replayEventsAfter("event-1", {
					send: async () => {},
				}),
			/Invalid replay sequence/,
		);

		baseEvent.sequence = "1";
		assert.equal(
			await eventStore.replayEventsAfter("event-1", {
				send: async () => {},
			}),
			"stream-1",
		);

		eventIds = ["event-2", "event-3", "event-4", "event-5"];
		encodedEvents = [
			null,
			{ ownerKey: "principal-b", message: "not-owned" },
			{ ownerKey: "principal-a", message: "not-an-envelope" },
			{
				ownerKey: "principal-a",
				message: encryptEventPayload(
					{ jsonrpc: "2.0", method: "event-5" },
					encryptionKey,
				),
			},
		];
		const replayed: Array<{ eventId: string; message: JSONRPCMessage }> = [];
		assert.equal(
			await eventStore.replayEventsAfter("event-1", {
				send: async (eventId, message) => {
					replayed.push({ eventId, message });
				},
			}),
			"stream-1",
		);
		assert.deepEqual(replayed, [
			{
				eventId: "event-5",
				message: { jsonrpc: "2.0", method: "event-5" },
			},
		]);
	});

	it("closes an open injected Redis client exactly once", async () => {
		const managedStore = createManagedEventStore(redisEventStoreConfig());
		const eventStore = managedStore.eventStoreForOwner(
			"principal-a",
		) as unknown as { client: unknown };
		let closeCalls = 0;
		eventStore.client = {
			isOpen: true,
			async close() {
				closeCalls += 1;
			},
		};

		await managedStore.close();
		assert.equal(closeCalls, 1);
	});
});
