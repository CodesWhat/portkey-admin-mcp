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
	commandTimeoutMs = 5_000,
): ServerConfig {
	return eventStoreConfig({
		mode: "redis",
		ttlSeconds: 60,
		redisUrl: "redis://127.0.0.1:6379",
		redisKeyPrefix: "test-events",
		encryptionKey,
		commandTimeoutMs,
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
			() => decryptEventPayload(`v2.${iv}.${tag}.${ciphertext}`, key),
			/Invalid encrypted event payload envelope/,
		);
		assert.throws(
			() => decryptEventPayload(`${encrypted}.unexpected`, key),
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
		assert.throws(
			() =>
				decryptEventPayload(
					`${version}.${iv}.${Buffer.alloc(8).toString("base64url")}.${ciphertext}`,
					key,
				),
			/16-byte authentication tag/,
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
				commandTimeoutMs: 5_000,
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
						commandTimeoutMs: 5_000,
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
					commandTimeoutMs: 5_000,
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

	it("removes individually expired events and rejects missing stream mappings", async () => {
		const originalDateNow = Date.now;
		let now = 31_000;
		Date.now = () => now;

		try {
			const managedStore = createManagedEventStore(
				eventStoreConfig({
					mode: "memory",
					ttlSeconds: 1,
					redisKeyPrefix: "unused",
					commandTimeoutMs: 5_000,
				}),
			);
			const eventStore = managedStore.eventStoreForOwner(
				"principal-a",
			) as unknown as {
				state: {
					lastCleanupAt: number;
					streamEvents: Map<string, Set<string>>;
				};
				storeEvent: (
					streamId: string,
					message: JSONRPCMessage,
				) => Promise<string>;
				getStreamIdForEventId: (eventId: string) => Promise<string | undefined>;
				replayEventsAfter: (
					eventId: string,
					options: {
						send: (eventId: string, message: JSONRPCMessage) => Promise<void>;
					},
				) => Promise<string>;
			};
			const firstEventId = await eventStore.storeEvent("stream-1", {
				jsonrpc: "2.0",
				method: "first",
			});
			now = 31_500;
			const secondEventId = await eventStore.storeEvent("stream-1", {
				jsonrpc: "2.0",
				method: "second",
			});

			now = 32_100;
			eventStore.state.lastCleanupAt = now;
			assert.equal(
				await eventStore.getStreamIdForEventId(firstEventId),
				undefined,
			);
			assert.deepEqual(
				Array.from(eventStore.state.streamEvents.get("stream-1") ?? []),
				[secondEventId],
			);

			eventStore.state.streamEvents.delete("stream-1");
			await assert.rejects(
				() =>
					eventStore.replayEventsAfter(secondEventId, {
						send: async () => {},
					}),
				/Stream mapping not found for replay event/,
			);

			now = 32_600;
			eventStore.state.lastCleanupAt = now;
			assert.equal(
				await eventStore.getStreamIdForEventId(secondEventId),
				undefined,
			);
		} finally {
			Date.now = originalDateNow;
		}
	});

	it("evicts the oldest memory events at count and byte caps", async () => {
		const countStore = createManagedEventStore(
			eventStoreConfig({
				mode: "memory",
				ttlSeconds: 60,
				redisKeyPrefix: "unused",
				commandTimeoutMs: 5_000,
				maxEvents: 2,
				maxBytes: 1_000_000,
			} as ServerConfig["eventStore"]),
		);
		const countEvents = countStore.eventStoreForOwner("principal-a");
		assert.ok(countEvents);
		const first = await countEvents.storeEvent("stream-1", {
			jsonrpc: "2.0",
			method: "first",
		});
		const second = await countEvents.storeEvent("stream-1", {
			jsonrpc: "2.0",
			method: "second",
		});
		const third = await countEvents.storeEvent("stream-1", {
			jsonrpc: "2.0",
			method: "third",
		});
		assert.equal(await countEvents.getStreamIdForEventId?.(first), undefined);
		assert.equal(await countEvents.getStreamIdForEventId?.(second), "stream-1");
		const replayed: string[] = [];
		await countEvents.replayEventsAfter(second, {
			send: async (eventId) => {
				replayed.push(eventId);
			},
		});
		assert.deepEqual(replayed, [third]);

		const message = {
			jsonrpc: "2.0" as const,
			method: "payload",
			params: { value: "x".repeat(64) },
		};
		const oneMessageBytes = Buffer.byteLength(JSON.stringify(message));
		const byteStore = createManagedEventStore(
			eventStoreConfig({
				mode: "memory",
				ttlSeconds: 60,
				redisKeyPrefix: "unused",
				commandTimeoutMs: 5_000,
				maxEvents: 100,
				maxBytes: oneMessageBytes + 1,
			} as ServerConfig["eventStore"]),
		);
		const byteEvents = byteStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			state: { events: Map<string, unknown>; totalBytes: number };
			storeEvent: (streamId: string, value: JSONRPCMessage) => Promise<string>;
			getStreamIdForEventId: (eventId: string) => Promise<string | undefined>;
		};
		const byteFirst = await byteEvents.storeEvent("stream-2", message);
		await byteEvents.storeEvent("stream-2", message);
		assert.equal(await byteEvents.getStreamIdForEventId(byteFirst), undefined);
		assert.equal(byteEvents.state.events.size, 1);
		assert.ok(byteEvents.state.totalBytes <= oneMessageBytes + 1);
	});
});

describe("Redis event-store behavior", () => {
	it("reads the configured command timeout onto per-owner Redis event stores", () => {
		const defaultStore = createManagedEventStore(redisEventStoreConfig());
		const defaultEventStore = defaultStore.eventStoreForOwner(
			"principal-a",
		) as unknown as { commandTimeoutMs: number };
		assert.equal(defaultEventStore.commandTimeoutMs, 5_000);

		const customStore = createManagedEventStore(
			redisEventStoreConfig(Buffer.alloc(32, 7), 1_500),
		);
		const customEventStore = customStore.eventStoreForOwner(
			"principal-a",
		) as unknown as { commandTimeoutMs: number };
		assert.equal(customEventStore.commandTimeoutMs, 1_500);

		const disabledStore = createManagedEventStore(
			redisEventStoreConfig(Buffer.alloc(32, 7), 0),
		);
		const disabledEventStore = disabledStore.eventStoreForOwner(
			"principal-a",
		) as unknown as { commandTimeoutMs: number };
		assert.equal(disabledEventStore.commandTimeoutMs, 0);
	});

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

	it("shares in-flight connections and retries after a failed connection", async () => {
		const managedStore = createManagedEventStore(redisEventStoreConfig());
		const eventStore = managedStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			client: unknown;
			getStreamIdForEventId: (eventId: string) => Promise<string | undefined>;
		};
		let resolveConnection: (() => void) | undefined;
		const connectionGate = new Promise<void>((resolve) => {
			resolveConnection = resolve;
		});
		let connectCalls = 0;
		const sharedClient = {
			isOpen: false,
			async connect() {
				connectCalls += 1;
				await connectionGate;
				sharedClient.isOpen = true;
			},
			async hGetAll() {
				return { streamId: "stream-1", ownerKey: "principal-a" };
			},
		};
		eventStore.client = sharedClient;

		const firstLookup = eventStore.getStreamIdForEventId("event-1");
		const secondLookup = eventStore.getStreamIdForEventId("event-2");
		await Promise.resolve();
		assert.equal(connectCalls, 1);
		resolveConnection?.();
		assert.deepEqual(await Promise.all([firstLookup, secondLookup]), [
			"stream-1",
			"stream-1",
		]);

		const retryStore = createManagedEventStore(redisEventStoreConfig());
		const retryEventStore = retryStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			client: unknown;
			getStreamIdForEventId: (eventId: string) => Promise<string | undefined>;
		};
		let retryConnectCalls = 0;
		const retryClient = {
			isOpen: false,
			async connect() {
				retryConnectCalls += 1;
				if (retryConnectCalls === 1) {
					throw new Error("Redis unavailable");
				}
				retryClient.isOpen = true;
			},
			async hGetAll() {
				return { streamId: "stream-2", ownerKey: "principal-a" };
			},
		};
		retryEventStore.client = retryClient;

		await assert.rejects(
			retryEventStore.getStreamIdForEventId("event-1"),
			/Redis unavailable/,
		);
		assert.equal(
			await retryEventStore.getStreamIdForEventId("event-1"),
			"stream-2",
		);
		assert.equal(retryConnectCalls, 2);
	});

	it("handles unopened and in-flight Redis clients during shutdown", async () => {
		const unusedStore = createManagedEventStore(redisEventStoreConfig());
		await unusedStore.close();

		const managedStore = createManagedEventStore(redisEventStoreConfig());
		const eventStore = managedStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			client: unknown;
			connection: { connectPromise?: Promise<unknown> };
		};
		let closeCalls = 0;
		const client = {
			isOpen: false,
			async close() {
				closeCalls += 1;
			},
		};
		eventStore.client = client;
		eventStore.connection.connectPromise = Promise.resolve().then(() => {
			client.isOpen = true;
		});
		await managedStore.close();
		assert.equal(closeCalls, 1);

		const failedStore = createManagedEventStore(redisEventStoreConfig());
		const failedEventStore = failedStore.eventStoreForOwner(
			"principal-a",
		) as unknown as {
			client: unknown;
			connection: { connectPromise?: Promise<unknown> };
		};
		failedEventStore.client = { isOpen: false };
		failedEventStore.connection.connectPromise = Promise.reject(
			new Error("connection failed"),
		);
		await assert.doesNotReject(failedStore.close());
	});
});
