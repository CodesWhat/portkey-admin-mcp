/**
 * Unit tests for isolated logic paths:
 * - parseErrorResponse error extraction
 * - service request construction / payload assembly
 * - tool callback behavior for selected edge cases
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createManagedEventStore } from "../src/lib/event-store.js";
import { parseErrorResponse } from "../src/lib/fetch.js";
import { Logger } from "../src/lib/logger.js";
import { SessionStore } from "../src/lib/session-store.js";
import { AnalyticsService } from "../src/services/analytics.service.js";
import { BaseService } from "../src/services/base.service.js";
import { ConfigsService } from "../src/services/configs.service.js";
import { PortkeyService } from "../src/services/index.js";
import { IntegrationsService } from "../src/services/integrations.service.js";
import { KeysService } from "../src/services/keys.service.js";
import { PromptsService } from "../src/services/prompts.service.js";
import { ProvidersService } from "../src/services/providers.service.js";
import { UsersService } from "../src/services/users.service.js";
import { WorkspacesService } from "../src/services/workspaces.service.js";
import { registerConfigsTools } from "../src/tools/configs.tools.js";
import { registerAllTools } from "../src/tools/index.js";
import { registerPromptsTools } from "../src/tools/prompts.tools.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response whose .json() resolves to `body`. */
function fakeResponse(status: number, body: unknown): Response {
	return {
		ok: false,
		status,
		json: () => Promise.resolve(body),
	} as unknown as Response;
}

function createFakeTransport() {
	return {
		close() {
			return Promise.resolve();
		},
	} as never;
}

class TestAnalyticsService extends AnalyticsService {
	public lastRequest:
		| {
				path: string;
				params?: object;
		  }
		| undefined;

	override async get<T>(path: string, params?: object): Promise<T> {
		this.lastRequest = { path, params };
		return {} as T;
	}
}

class TestBaseServiceClient extends BaseService {
	requestGet<T>(path: string, params?: object): Promise<T> {
		return this.get<T>(path, params);
	}

	requestPost<T>(path: string, body?: unknown): Promise<T> {
		return this.post<T>(path, body);
	}

	requestPut<T>(path: string, body?: unknown): Promise<T> {
		return this.put<T>(path, body);
	}

	requestDelete<T>(path: string): Promise<T> {
		return this.delete<T>(path);
	}
}

type CapturedRequest = {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	params?: object;
	body?: unknown;
};

async function captureServiceRequest(
	invoke: () => Promise<unknown>,
): Promise<CapturedRequest> {
	const basePrototype = BaseService.prototype as {
		get: (path: string, params?: object) => Promise<unknown>;
		post: (path: string, body?: unknown) => Promise<unknown>;
		put: (path: string, body?: unknown) => Promise<unknown>;
		delete: (path: string) => Promise<unknown>;
	};
	const originalMethods = {
		get: basePrototype.get,
		post: basePrototype.post,
		put: basePrototype.put,
		delete: basePrototype.delete,
	};
	let captured: CapturedRequest | undefined;

	basePrototype.get = async (path: string, params?: object) => {
		captured = { method: "GET", path, params };
		return {};
	};
	basePrototype.post = async (path: string, body?: unknown) => {
		captured = { method: "POST", path, body };
		return {};
	};
	basePrototype.put = async (path: string, body?: unknown) => {
		captured = { method: "PUT", path, body };
		return {};
	};
	basePrototype.delete = async (path: string) => {
		captured = { method: "DELETE", path };
		return {};
	};

	try {
		await invoke();
		assert.ok(captured, "expected a service request to be captured");
		return captured;
	} finally {
		basePrototype.get = originalMethods.get;
		basePrototype.post = originalMethods.post;
		basePrototype.put = originalMethods.put;
		basePrototype.delete = originalMethods.delete;
	}
}

function registerToolCallbacks(
	register: (server: { tool(name: string, ...rest: unknown[]): never }) => void,
): Map<string, (...args: unknown[]) => Promise<unknown>> {
	const callbacks = new Map<string, (...args: unknown[]) => Promise<unknown>>();

	register({
		tool(name: string, ...rest: unknown[]) {
			callbacks.set(
				name,
				rest[rest.length - 1] as (...args: unknown[]) => Promise<unknown>,
			);
			return {} as never;
		},
	});

	return callbacks;
}

// ---------------------------------------------------------------------------
// PortkeyService facade shape
// ---------------------------------------------------------------------------

describe("PortkeyService facade shape", () => {
	it("exposes domain sub-services instead of delegated API methods", () => {
		const service = new PortkeyService("test-dummy-key") as unknown as {
			users?: { listUsers?: () => Promise<unknown> };
			prompts?: { getPrompt?: (promptId: string) => Promise<unknown> };
			health?: { ping?: () => Promise<unknown> };
			listUsers?: unknown;
			getPrompt?: unknown;
			ping?: unknown;
		};

		assert.equal(typeof service.users?.listUsers, "function");
		assert.equal(typeof service.prompts?.getPrompt, "function");
		assert.equal(typeof service.health?.ping, "function");
		assert.equal(service.listUsers, undefined);
		assert.equal(service.getPrompt, undefined);
		assert.equal(service.ping, undefined);
	});
});

// ---------------------------------------------------------------------------
// BaseService HTTP execution
// ---------------------------------------------------------------------------

describe("BaseService HTTP execution", () => {
	it("uses one consistent request shape across HTTP verbs", async () => {
		const originalFetch = globalThis.fetch;
		const originalApiKey = process.env.PORTKEY_API_KEY;
		const originalBaseUrl = process.env.PORTKEY_BASE_URL;
		const originalLoggerDebug = Logger.debug;
		const originalLoggerInfo = Logger.info;
		const originalLoggerError = Logger.error;
		const fetchCalls: Array<{ url: string; options: RequestInit }> = [];
		const debugLogs: Array<{ message: string; extra?: object }> = [];
		const infoLogs: Array<{ message: string; extra?: object }> = [];
		let deleteJsonCalls = 0;

		globalThis.fetch = (async (
			url: string | URL | Request,
			options?: RequestInit,
		) => {
			fetchCalls.push({ url: String(url), options: options ?? {} });
			switch (fetchCalls.length) {
				case 1:
					return {
						ok: true,
						status: 200,
						json: async () => ({ method: "GET" }),
					} as Response;
				case 2:
					return {
						ok: true,
						status: 201,
						json: async () => ({ method: "POST" }),
					} as Response;
				case 3:
					return {
						ok: true,
						status: 200,
						json: async () => ({ method: "PUT" }),
					} as Response;
				case 4:
					return {
						ok: true,
						status: 204,
						json: async () => {
							deleteJsonCalls += 1;
							return {};
						},
					} as Response;
				default:
					throw new Error(`Unexpected fetch call ${fetchCalls.length}`);
			}
		}) as typeof globalThis.fetch;

		Logger.debug = ((message: string, extra?: object) => {
			debugLogs.push({ message, extra });
		}) as typeof Logger.debug;
		Logger.info = ((message: string, extra?: object) => {
			infoLogs.push({ message, extra });
		}) as typeof Logger.info;
		Logger.error = (() => {
			throw new Error(
				"Logger.error should not be called for successful requests",
			);
		}) as typeof Logger.error;

		process.env.PORTKEY_API_KEY = "test-dummy-key";
		process.env.PORTKEY_BASE_URL = "https://example.portkey.test/v1";

		try {
			const service = new TestBaseServiceClient();

			assert.deepEqual(
				await service.requestGet<{ method: string }>("/resource", {
					filter: "alpha beta",
					page: 2,
				}),
				{ method: "GET" },
			);
			assert.deepEqual(
				await service.requestPost<{ method: string }>("/resource", {
					name: "created",
				}),
				{ method: "POST" },
			);
			assert.deepEqual(
				await service.requestPut<{ method: string }>("/resource/123", {
					name: "updated",
				}),
				{ method: "PUT" },
			);
			assert.deepEqual(await service.requestDelete("/resource/123"), {});

			assert.deepEqual(
				fetchCalls.map(({ url, options }) => ({
					url,
					method: options.method,
					headers: options.headers,
					body: options.body,
				})),
				[
					{
						url: "https://example.portkey.test/v1/resource?filter=alpha+beta&page=2",
						method: "GET",
						headers: {
							"x-portkey-api-key": "test-dummy-key",
							Accept: "application/json",
						},
						body: undefined,
					},
					{
						url: "https://example.portkey.test/v1/resource",
						method: "POST",
						headers: {
							"x-portkey-api-key": "test-dummy-key",
							"Content-Type": "application/json",
							Accept: "application/json",
						},
						body: JSON.stringify({ name: "created" }),
					},
					{
						url: "https://example.portkey.test/v1/resource/123",
						method: "PUT",
						headers: {
							"x-portkey-api-key": "test-dummy-key",
							"Content-Type": "application/json",
							Accept: "application/json",
						},
						body: JSON.stringify({ name: "updated" }),
					},
					{
						url: "https://example.portkey.test/v1/resource/123",
						method: "DELETE",
						headers: {
							"x-portkey-api-key": "test-dummy-key",
							Accept: "application/json",
						},
						body: undefined,
					},
				],
			);
			assert.equal(deleteJsonCalls, 0);
			assert.equal(debugLogs.length, 4);
			assert.equal(infoLogs.length, 4);
			for (const log of debugLogs) {
				assert.equal(
					typeof (log.extra as { requestId?: unknown })?.requestId,
					"string",
				);
			}
			assert.deepEqual(
				debugLogs.map((entry) => {
					const extra = entry.extra as {
						method?: string;
						path?: string;
						metadata?: { url?: string };
					};
					return {
						method: extra.method,
						path: extra.path,
						metadata: extra.metadata,
					};
				}),
				[
					{
						method: "GET",
						path: "/resource",
						metadata: {
							url: "https://example.portkey.test/v1/resource?filter=alpha+beta&page=2",
						},
					},
					{
						method: "POST",
						path: "/resource",
						metadata: {
							url: "https://example.portkey.test/v1/resource",
						},
					},
					{
						method: "PUT",
						path: "/resource/123",
						metadata: {
							url: "https://example.portkey.test/v1/resource/123",
						},
					},
					{
						method: "DELETE",
						path: "/resource/123",
						metadata: {
							url: "https://example.portkey.test/v1/resource/123",
						},
					},
				],
			);
		} finally {
			globalThis.fetch = originalFetch;
			Logger.debug = originalLoggerDebug;
			Logger.info = originalLoggerInfo;
			Logger.error = originalLoggerError;
			if (originalApiKey === undefined) {
				delete process.env.PORTKEY_API_KEY;
			} else {
				process.env.PORTKEY_API_KEY = originalApiKey;
			}
			if (originalBaseUrl === undefined) {
				delete process.env.PORTKEY_BASE_URL;
			} else {
				process.env.PORTKEY_BASE_URL = originalBaseUrl;
			}
		}
	});
});

// ---------------------------------------------------------------------------
// parseErrorResponse
// ---------------------------------------------------------------------------

describe("parseErrorResponse", () => {
	it("extracts message from body.error (standard format)", async () => {
		const res = fakeResponse(422, {
			status_code: 422,
			success: false,
			error: {
				message: "Invalid config",
				slug: "invalid_config",
				code: "AB01",
			},
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "Invalid config");
		assert.equal(err.code, "AB01");
		assert.equal(err.slug, "invalid_config");
		assert.equal(err.status_code, 422);
	});

	it("extracts message from body.data (Portkey alternate format)", async () => {
		const res = fakeResponse(400, {
			success: false,
			data: {
				message: "Invalid request. Please check and try again.",
				errorCode: "AB01",
			},
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "Invalid request. Please check and try again.");
		assert.equal(err.code, "AB01");
		assert.equal(err.status_code, 400);
	});

	it("extracts message from top-level body when no error/data wrapper", async () => {
		const res = fakeResponse(403, {
			message: "Forbidden",
			code: "FORBIDDEN",
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "Forbidden");
		assert.equal(err.code, "FORBIDDEN");
	});

	it("prefers body.error over body.data when both present", async () => {
		const res = fakeResponse(400, {
			error: { message: "from error" },
			data: { message: "from data" },
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "from error");
	});

	it("falls back to generic message when body is not JSON", async () => {
		const res = {
			ok: false,
			status: 502,
			json: () => Promise.reject(new Error("not json")),
		} as unknown as Response;
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "HTTP error! status: 502");
		assert.equal(err.status_code, 502);
	});

	it("includes errorCode in fallback message when message is missing", async () => {
		const res = fakeResponse(400, {
			success: false,
			data: { errorCode: "AB99" },
		});
		const err = await parseErrorResponse(res);
		assert.equal(err.message, "HTTP error! status: 400 (AB99)");
		assert.equal(err.code, "AB99");
	});

	it("uses response.status when body.status_code is absent", async () => {
		const res = fakeResponse(429, { data: { message: "Rate limited" } });
		const err = await parseErrorResponse(res);
		assert.equal(err.status_code, 429);
	});

	it("handles null JSON body without throwing", async () => {
		const res = fakeResponse(500, null);
		const err = await parseErrorResponse(res);
		assert.equal(err.status_code, 500);
		assert.equal(err.message, "HTTP error! status: 500");
	});
});

// ---------------------------------------------------------------------------
// PromptsService.updatePrompt
// ---------------------------------------------------------------------------

describe("PromptsService.updatePrompt", () => {
	it("sends patch mode and remaps template_metadata while preserving string", async () => {
		const request = await captureServiceRequest(() =>
			new PromptsService("test-dummy-key").updatePrompt("prompt/one two", {
				string: '[{"role":"system","content":"Be helpful"}]',
				model: "claude-3-opus",
				version_description: "v2",
				template_metadata: { app: "hourlink", env: "prod" },
			}),
		);

		assert.equal(request.method, "PUT");
		assert.equal(request.path, "/prompts/prompt%2Fone%20two");
		assert.deepEqual(request.body, {
			string: '[{"role":"system","content":"Be helpful"}]',
			model: "claude-3-opus",
			version_description: "v2",
			patch: true,
			prompt_metadata: { app: "hourlink", env: "prod" },
		});
		assert.equal(
			"template_metadata" in ((request.body as Record<string, unknown>) || {}),
			false,
		);
		assert.equal(
			"prompt_template" in ((request.body as Record<string, unknown>) || {}),
			false,
		);
	});

	it("omits remapped fields when optional inputs are not provided", async () => {
		const request = await captureServiceRequest(() =>
			new PromptsService("test-dummy-key").updatePrompt("prompt-id", {
				model: "gpt-4",
			}),
		);

		assert.equal(request.method, "PUT");
		assert.equal(request.path, "/prompts/prompt-id");
		assert.deepEqual(request.body, {
			model: "gpt-4",
			patch: true,
		});
	});
});

// ---------------------------------------------------------------------------
// get_prompt tool formatting
// ---------------------------------------------------------------------------

describe("get_prompt tool formatting", () => {
	it("formats real prompt templates from the registered tool callback", async () => {
		const promptCallback = registerToolCallbacks((server) => {
			registerPromptsTools(
				server as never,
				{
					prompts: {
						getPrompt: async () => ({
							id: "prompt-1",
							name: "Support Prompt",
							slug: "support-prompt",
							collection_id: "collection-1",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							current_version: {
								id: "version-1",
								version_number: 1,
								version_description: "Initial",
								model: "gpt-4",
								string: {
									string: '[{"role":"system","content":"Be helpful"}]',
								},
								parameters: { team: "support" },
								template_metadata: { env: "prod" },
								functions: [],
								tools: [],
							},
							versions: [],
						}),
					},
				} as never,
			);
		}).get("get_prompt");

		assert.ok(promptCallback, "expected get_prompt to be registered");

		const result = (await promptCallback({
			prompt_id: "prompt-1",
		})) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			current_version?: {
				template?: string;
				template_format?: string;
				metadata?: Record<string, unknown>;
			} | null;
		};

		assert.equal(
			payload.current_version?.template,
			'[{"role":"system","content":"Be helpful"}]',
		);
		assert.equal(
			payload.current_version?.template_format,
			"multi-message (JSON messages array)",
		);
		assert.deepEqual(payload.current_version?.metadata, { env: "prod" });
	});

	it("keeps plain text and non-role arrays as plain-string templates", async () => {
		const cases = [
			{
				rawTemplate: "Hello {{name}}",
				expectedTemplate: "Hello {{name}}",
				expectedFormat: "plain string",
			},
			{
				rawTemplate: "[Note: this is just text]",
				expectedTemplate: "[Note: this is just text]",
				expectedFormat: "plain string",
			},
			{
				rawTemplate: "[1, 2, 3]",
				expectedTemplate: "[1, 2, 3]",
				expectedFormat: "plain string",
			},
			{
				rawTemplate: { string: 42 },
				expectedTemplate: "42",
				expectedFormat: "plain string",
			},
			{
				rawTemplate: null,
				expectedTemplate: "null",
				expectedFormat: "plain string",
			},
			{
				rawTemplate: {},
				expectedTemplate: "{}",
				expectedFormat: "plain string",
			},
		] as const;

		for (const testCase of cases) {
			const promptCallback = registerToolCallbacks((server) => {
				registerPromptsTools(
					server as never,
					{
						prompts: {
							getPrompt: async () => ({
								id: "prompt-1",
								name: "Support Prompt",
								slug: "support-prompt",
								collection_id: "collection-1",
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-02T00:00:00.000Z",
								current_version: {
									id: "version-1",
									version_number: 1,
									version_description: "Initial",
									model: "gpt-4",
									string: testCase.rawTemplate,
									parameters: {},
									template_metadata: undefined,
									functions: [],
									tools: [],
								},
								versions: [],
							}),
						},
					} as never,
				);
			}).get("get_prompt");

			assert.ok(promptCallback, "expected get_prompt to be registered");

			const result = (await promptCallback({
				prompt_id: "prompt-1",
			})) as {
				content: Array<{ text: string }>;
			};
			const payload = JSON.parse(result.content[0]?.text || "{}") as {
				current_version?: {
					template?: string;
					template_format?: string;
				} | null;
			};

			assert.equal(
				payload.current_version?.template,
				testCase.expectedTemplate,
			);
			assert.equal(
				payload.current_version?.template_format,
				testCase.expectedFormat,
			);
		}
	});

	it("returns null current_version when the prompt has no active version", async () => {
		const promptCallback = registerToolCallbacks((server) => {
			registerPromptsTools(
				server as never,
				{
					prompts: {
						getPrompt: async () => ({
							id: "prompt-1",
							name: "Support Prompt",
							slug: "support-prompt",
							collection_id: "collection-1",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							current_version: undefined,
							versions: [],
						}),
					},
				} as never,
			);
		}).get("get_prompt");

		assert.ok(promptCallback, "expected get_prompt to be registered");

		const result = (await promptCallback({
			prompt_id: "prompt-1",
		})) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			current_version?: unknown;
			version_count?: number;
		};

		assert.equal(payload.current_version, null);
		assert.equal(payload.version_count, 0);
	});
});

// ---------------------------------------------------------------------------
// SessionStore capacity limits
// ---------------------------------------------------------------------------

describe("SessionStore capacity limits", () => {
	it("rejects new sessions beyond the configured cap", () => {
		const store = new SessionStore(1);

		store.set("session-1", {
			transport: createFakeTransport(),
			createdAt: 1,
			lastActivity: 1,
		});

		assert.throws(
			() =>
				store.set("session-2", {
					transport: createFakeTransport(),
					createdAt: 2,
					lastActivity: 2,
				}),
			/maximum active session limit/i,
		);
	});

	it("counts reserved slots against the configured cap", () => {
		const store = new SessionStore(1);

		assert.equal(store.tryReserve(), true);
		assert.equal(store.tryReserve(), false);
		store.releaseReservation();
		assert.equal(store.tryReserve(), true);
	});
});

// ---------------------------------------------------------------------------
// In-memory event store cleanup throttling
// ---------------------------------------------------------------------------

describe("InMemoryEventStore cleanup throttling", () => {
	it("runs full cleanup at most once every 30 seconds during writes", async () => {
		const managedStore = createManagedEventStore({
			transport: "http",
			sessionMode: "stateless",
			eventStore: {
				mode: "memory",
				ttlSeconds: 60,
				redisKeyPrefix: "test",
			},
			protocol: "http",
			port: 3000,
			host: "127.0.0.1",
			maxSessions: 100,
			sessionTimeout: 3_600_000,
			tls: { enabled: false },
		});
		const eventStore = managedStore.eventStore as {
			cleanupExpired: () => void;
			storeEvent: (streamId: string, message: unknown) => Promise<string>;
		};
		const originalCleanupExpired = eventStore.cleanupExpired.bind(eventStore);
		const originalDateNow = Date.now;
		let cleanupCalls = 0;
		let now = 31_000;

		Date.now = () => now;
		eventStore.cleanupExpired = () => {
			cleanupCalls += 1;
			originalCleanupExpired();
		};

		try {
			await eventStore.storeEvent("stream-1", {
				jsonrpc: "2.0",
				method: "ping",
			});
			now = 32_000;
			await eventStore.storeEvent("stream-1", {
				jsonrpc: "2.0",
				method: "ping",
			});
			now = 60_999;
			await eventStore.storeEvent("stream-1", {
				jsonrpc: "2.0",
				method: "ping",
			});
			now = 61_000;
			await eventStore.storeEvent("stream-1", {
				jsonrpc: "2.0",
				method: "ping",
			});
		} finally {
			Date.now = originalDateNow;
		}

		assert.equal(cleanupCalls, 2);
	});
});

// ---------------------------------------------------------------------------
// Redis event store replay batching
// ---------------------------------------------------------------------------

describe("RedisEventStore replay batching", () => {
	it("replays queued events with one batched Redis fetch instead of per-event hGet calls", async () => {
		const managedStore = createManagedEventStore({
			transport: "http",
			sessionMode: "stateless",
			eventStore: {
				mode: "redis",
				ttlSeconds: 60,
				redisUrl: "redis://127.0.0.1:6379",
				redisKeyPrefix: "test",
			},
			protocol: "http",
			port: 3000,
			host: "127.0.0.1",
			maxSessions: 100,
			sessionTimeout: 3_600_000,
			tls: { enabled: false },
		});
		const eventStore = managedStore.eventStore as {
			client: {
				isOpen: boolean;
				hGetAll: (key: string) => Promise<Record<string, string>>;
				zRangeByScore: (
					key: string,
					min: string,
					max: string,
				) => Promise<string[]>;
				hGet: (key: string, field: string) => Promise<string | null>;
				multi: () => {
					hGet: (key: string, field: string) => unknown;
					exec: () => Promise<Array<string | null>>;
				};
			};
			replayEventsAfter: (
				lastEventId: string,
				options: {
					send: (eventId: string, message: unknown) => Promise<void>;
				},
			) => Promise<string>;
		};
		const batchedRequests: Array<{ key: string; field: string }> = [];
		let clientLevelHGetCalls = 0;
		const sentEvents: Array<{ eventId: string; message: unknown }> = [];
		const fakeMulti = {
			hGet(key: string, field: string) {
				batchedRequests.push({ key, field });
				return fakeMulti;
			},
			async exec() {
				return [
					JSON.stringify({ jsonrpc: "2.0", method: "event-2" }),
					JSON.stringify({ jsonrpc: "2.0", method: "event-3" }),
					JSON.stringify({ jsonrpc: "2.0", method: "event-4" }),
				];
			},
		};

		eventStore.client = {
			isOpen: true,
			async hGetAll(key: string) {
				assert.equal(key, "test:event:1");
				return { streamId: "stream-1" };
			},
			async zRangeByScore(key: string, min: string, max: string) {
				assert.equal(key, "test:stream:stream-1:events");
				assert.equal(min, "(1");
				assert.equal(max, "+inf");
				return ["2", "3", "4"];
			},
			async hGet() {
				clientLevelHGetCalls += 1;
				throw new Error("replayEventsAfter should batch Redis message fetches");
			},
			multi() {
				return fakeMulti;
			},
		};

		const streamId = await eventStore.replayEventsAfter("1", {
			send: async (eventId, message) => {
				sentEvents.push({ eventId, message });
			},
		});

		assert.equal(streamId, "stream-1");
		assert.equal(clientLevelHGetCalls, 0);
		assert.deepEqual(batchedRequests, [
			{ key: "test:event:2", field: "message" },
			{ key: "test:event:3", field: "message" },
			{ key: "test:event:4", field: "message" },
		]);
		assert.deepEqual(sentEvents, [
			{
				eventId: "2",
				message: { jsonrpc: "2.0", method: "event-2" },
			},
			{
				eventId: "3",
				message: { jsonrpc: "2.0", method: "event-3" },
			},
			{
				eventId: "4",
				message: { jsonrpc: "2.0", method: "event-4" },
			},
		]);
	});
});

// ---------------------------------------------------------------------------
// MCP server package metadata caching
// ---------------------------------------------------------------------------

describe("createMcpServer package metadata caching", () => {
	it("reads package.json once per module load, not once per session", async () => {
		const originalReadFileSync = fs.readFileSync;
		const originalApiKey = process.env.PORTKEY_API_KEY;
		const packageJsonPath = join(process.cwd(), "package.json");
		let readFileSyncCalls = 0;

		fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
			if (args[0] === packageJsonPath) {
				readFileSyncCalls += 1;
			}
			return originalReadFileSync(...args);
		}) as typeof fs.readFileSync;
		syncBuiltinESMExports();
		process.env.PORTKEY_API_KEY = "test-dummy-key";

		try {
			const { createMcpServer } = await import(
				`../src/lib/mcp-server.js?test=${Date.now()}-${Math.random()}`
			);

			createMcpServer();
			createMcpServer();

			assert.equal(readFileSyncCalls, 1);
		} finally {
			fs.readFileSync = originalReadFileSync;
			syncBuiltinESMExports();
			if (originalApiKey === undefined) {
				delete process.env.PORTKEY_API_KEY;
			} else {
				process.env.PORTKEY_API_KEY = originalApiKey;
			}
		}
	});

	it("reuses a shared PortkeyService across MCP server instances", async () => {
		const originalApiKey = process.env.PORTKEY_API_KEY;
		process.env.PORTKEY_API_KEY = "test-dummy-key";

		try {
			const { createMcpServer } = await import(
				`../src/lib/mcp-server.js?test=${Date.now()}-${Math.random()}`
			);

			const first = createMcpServer();
			const second = createMcpServer();

			assert.notEqual(first.server, second.server);
			assert.equal(first.service, second.service);
		} finally {
			if (originalApiKey === undefined) {
				delete process.env.PORTKEY_API_KEY;
			} else {
				process.env.PORTKEY_API_KEY = originalApiKey;
			}
		}
	});
});

// ---------------------------------------------------------------------------
// Analytics query params
// ---------------------------------------------------------------------------

describe("AnalyticsService query params", () => {
	it("includes prompt_slug in analytics requests", async () => {
		const service = new TestAnalyticsService("test-dummy-key");

		await service.getRequestAnalytics({
			time_of_generation_min: "2026-01-01T00:00:00.000Z",
			time_of_generation_max: "2026-01-02T00:00:00.000Z",
			prompt_slug: "support-triage",
		});

		assert.equal(service.lastRequest?.path, "/analytics/graphs/requests");
		assert.equal(
			(service.lastRequest?.params as Record<string, unknown>).prompt_slug,
			"support-triage",
		);
	});
});

// ---------------------------------------------------------------------------
// Service path param encoding
// ---------------------------------------------------------------------------

describe("Service path param encoding", () => {
	it("encodes dynamic path segments before making API requests", async () => {
		const cases = [
			{
				description: "config slugs in nested config version paths",
				request: () =>
					captureServiceRequest(() =>
						new ConfigsService("test-dummy-key").listConfigVersions(
							"config/alpha beta",
						),
					),
				expectedMethod: "GET",
				expectedPath: "/configs/config%2Falpha%20beta/versions",
			},
			{
				description: "prompt and version ids in nested prompt version paths",
				request: () =>
					captureServiceRequest(() =>
						new PromptsService("test-dummy-key").getPromptVersion(
							"prompt/one two",
							"version/2 #",
						),
					),
				expectedMethod: "GET",
				expectedPath: "/prompts/prompt%2Fone%20two/versions/version%2F2%20%23",
			},
			{
				description: "workspace and user ids in workspace membership paths",
				request: () =>
					captureServiceRequest(() =>
						new WorkspacesService("test-dummy-key").removeWorkspaceMember(
							"workspace/one two",
							"user/alpha beta",
						),
					),
				expectedMethod: "DELETE",
				expectedPath:
					"/admin/workspaces/workspace%2Fone%20two/users/user%2Falpha%20beta",
			},
			{
				description: "provider slugs alongside encoded query params",
				request: () =>
					captureServiceRequest(() =>
						new ProvidersService("test-dummy-key").updateProvider(
							"provider/one two",
							{},
							"workspace/one two",
						),
					),
				expectedMethod: "PUT",
				expectedPath:
					"/providers/provider%2Fone%20two?workspace_id=workspace%2Fone%20two",
			},
			{
				description: "integration slugs before query strings",
				request: () =>
					captureServiceRequest(() =>
						new IntegrationsService("test-dummy-key").deleteIntegrationModel(
							"integration/one two",
							"model/three?",
						),
					),
				expectedMethod: "DELETE",
				expectedPath:
					"/integrations/integration%2Fone%20two/models?slugs=model%2Fthree%3F",
			},
			{
				description: "api key ids in direct resource paths",
				request: () =>
					captureServiceRequest(() =>
						new KeysService("test-dummy-key").getApiKey("key/one two"),
					),
				expectedMethod: "GET",
				expectedPath: "/api-keys/key%2Fone%20two",
			},
			{
				description: "invite ids in action subresource paths",
				request: () =>
					captureServiceRequest(() =>
						new UsersService("test-dummy-key").resendUserInvite(
							"invite/one two",
						),
					),
				expectedMethod: "POST",
				expectedPath: "/admin/users/invites/invite%2Fone%20two/resend",
			},
		] as const;

		for (const testCase of cases) {
			const request = await testCase.request();
			assert.equal(
				request.method,
				testCase.expectedMethod,
				`${testCase.description}: method`,
			);
			assert.equal(
				request.path,
				testCase.expectedPath,
				`${testCase.description}: path`,
			);
		}
	});
});

// ---------------------------------------------------------------------------
// Config tool payload assembly
// ---------------------------------------------------------------------------

describe("Config tool payload assembly", () => {
	it("preserves zero-valued config fields instead of dropping them as falsy", async () => {
		const callbacks = new Map<
			string,
			(...args: unknown[]) => Promise<unknown>
		>();
		const createCalls: unknown[] = [];
		const updateCalls: unknown[] = [];

		registerConfigsTools(
			{
				tool(name: string, ...rest: unknown[]) {
					callbacks.set(
						name,
						rest[rest.length - 1] as (...args: unknown[]) => Promise<unknown>,
					);
					return {} as never;
				},
			} as never,
			{
				configs: {
					createConfig: async (payload: unknown) => {
						createCalls.push(payload);
						return { id: "cfg_123", version_id: "ver_123" };
					},
					updateConfig: async (_slug: string, payload: unknown) => {
						updateCalls.push(payload);
						return {
							id: "cfg_123",
							slug: "config-zero",
							config: JSON.stringify(payload),
						};
					},
				},
			} as never,
		);

		const createConfigCallback = callbacks.get("create_config");
		const updateConfigCallback = callbacks.get("update_config");
		assert.ok(createConfigCallback, "expected create_config to be registered");
		assert.ok(updateConfigCallback, "expected update_config to be registered");

		await createConfigCallback({
			name: "config-zero",
			cache_mode: "simple",
			cache_max_age: 0,
			retry_attempts: 0,
			retry_on_status_codes: [429],
		});
		await updateConfigCallback({
			slug: "config-zero",
			cache_mode: "simple",
			cache_max_age: 0,
			retry_attempts: 0,
			retry_on_status_codes: [429],
		});

		assert.deepEqual(createCalls, [
			{
				name: "config-zero",
				config: {
					cache: {
						mode: "simple",
						max_age: 0,
					},
					retry: {
						attempts: 0,
						on_status_codes: [429],
					},
					strategy: undefined,
					targets: undefined,
				},
				workspace_id: undefined,
			},
		]);
		assert.deepEqual(updateCalls, [
			{
				config: {
					cache: {
						mode: "simple",
						max_age: 0,
					},
					retry: {
						attempts: 0,
						on_status_codes: [429],
					},
					strategy: undefined,
					targets: undefined,
				},
			},
		]);
	});
});

// ---------------------------------------------------------------------------
// Tool callback error handling
// ---------------------------------------------------------------------------

describe("Tool callback error handling", () => {
	it("wraps registered tool callbacks so thrown errors become MCP error results", async () => {
		const callbacks = new Map<
			string,
			(...args: unknown[]) => Promise<unknown>
		>();
		const originalLoggerError = Logger.error;
		const loggedErrors: Array<{ message: string; extra?: object }> = [];

		Logger.error = ((message: string, extra?: object) => {
			loggedErrors.push({ message, extra });
		}) as typeof Logger.error;

		try {
			registerAllTools(
				{
					tool(name: string, ...rest: unknown[]) {
						callbacks.set(
							name,
							rest[rest.length - 1] as (...args: unknown[]) => Promise<unknown>,
						);
						return {} as never;
					},
				} as never,
				{} as never,
			);

			const listUsersCallback = callbacks.get("list_all_users");
			assert.ok(listUsersCallback, "expected list_all_users to be registered");

			const result = (await listUsersCallback()) as {
				content: Array<{ type: string; text: string }>;
				isError?: boolean;
			};

			assert.equal(result.isError, true);
			assert.equal(result.content[0]?.type, "text");
			assert.match(
				result.content[0]?.text || "",
				/Tool "list_all_users" failed: .*listUsers.*/,
			);
			assert.equal(loggedErrors.length, 1);
			assert.equal(loggedErrors[0]?.message, "Tool callback failed");
		} finally {
			Logger.error = originalLoggerError;
		}
	});
});
