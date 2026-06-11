/**
 * Unit tests for isolated logic paths:
 * - parseErrorResponse error extraction
 * - service request construction / payload assembly
 * - tool callback behavior for selected edge cases
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { z } from "zod";
import { createManagedEventStore } from "../src/lib/event-store.js";
import { parseErrorResponse } from "../src/lib/fetch.js";
import { Logger } from "../src/lib/logger.js";
import { ToolChoiceSchema, toPromptToolChoice } from "../src/lib/schemas.js";
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
import { registerAnalyticsTools } from "../src/tools/analytics.tools.js";
import { registerConfigsTools } from "../src/tools/configs.tools.js";
import { registerAllTools } from "../src/tools/index.js";
import { registerPromptsTools } from "../src/tools/prompts.tools.js";
import { registerUsersTools } from "../src/tools/users.tools.js";

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

describe("HealthService cache sharing", () => {
	it("reuses one HealthService via getSharedPortkeyService for the same config", async () => {
		const originalApiKey = process.env.PORTKEY_API_KEY;
		const originalBaseUrl = process.env.PORTKEY_BASE_URL;
		process.env.PORTKEY_API_KEY = "test-dummy-key";
		process.env.PORTKEY_BASE_URL = "https://example.portkey.test/v1";

		try {
			const { getSharedPortkeyService: freshGetShared } = await import(
				`../src/services/index.js?test=${Date.now()}-${Math.random()}`
			);

			const first = freshGetShared();
			const second = freshGetShared();

			assert.equal(first, second);
			assert.equal(first.health, second.health);
		} finally {
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
			// Debug logs must carry only param keys, never the composed URL or
			// query values — guards the log-redaction in BaseService.executeRequest.
			assert.deepEqual(
				debugLogs.map((entry) => {
					const extra = entry.extra as {
						method?: string;
						path?: string;
						metadata?: { paramKeys?: string[] };
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
						metadata: { paramKeys: ["filter", "page"] },
					},
					{
						method: "POST",
						path: "/resource",
						metadata: { paramKeys: [] },
					},
					{
						method: "PUT",
						path: "/resource/123",
						metadata: { paramKeys: [] },
					},
					{
						method: "DELETE",
						path: "/resource/123",
						metadata: { paramKeys: [] },
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
// ConfigsService response parsing
// ---------------------------------------------------------------------------

describe("ConfigsService response parsing", () => {
	it("parses JSON-encoded config details in getConfig and updateConfig", async () => {
		const service = new ConfigsService("test-dummy-key");
		const basePrototype = BaseService.prototype as {
			get: (path: string, params?: object) => Promise<unknown>;
			put: (path: string, body?: unknown) => Promise<unknown>;
		};
		const originalGet = basePrototype.get;
		const originalPut = basePrototype.put;

		basePrototype.get = async () => ({
			id: "cfg_123",
			name: "Support Config",
			workspace_id: "ws_123",
			slug: "support-config",
			organisation_id: "org_123",
			is_default: 0,
			status: "active",
			owner_id: "user_123",
			updated_by: "user_456",
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
			config:
				'{"cache":{"mode":"simple","max_age":300},"targets":[{"provider":"openai"}]}',
			format: "json",
			type: "router",
			version_id: "ver_123",
			object: "config",
		});
		basePrototype.put = async () => ({
			id: "cfg_123",
			name: "Support Config",
			workspace_id: "ws_123",
			slug: "support-config",
			organisation_id: "org_123",
			is_default: 0,
			status: "active",
			owner_id: "user_123",
			updated_by: "user_456",
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
			config: '{"retry":{"attempts":2,"on_status_codes":[429]}}',
			format: "json",
			type: "router",
			version_id: "ver_124",
			object: "config",
		});

		try {
			const config = await service.getConfig("support-config");
			const updated = await service.updateConfig("support-config", {
				status: "active",
			});

			assert.deepEqual(config.config, {
				cache: { mode: "simple", max_age: 300 },
				targets: [{ provider: "openai" }],
			});
			assert.deepEqual(updated.config, {
				retry: {
					attempts: 2,
					on_status_codes: [429],
				},
			});
		} finally {
			basePrototype.get = originalGet;
			basePrototype.put = originalPut;
		}
	});
});

describe("ToolChoiceSchema", () => {
	it("emits a flat object JSON schema without union combinators", () => {
		const jsonSchema = toJsonSchemaCompat(ToolChoiceSchema) as {
			type?: string;
			anyOf?: unknown;
			oneOf?: unknown;
			properties?: Record<string, unknown>;
			required?: string[];
		};

		assert.equal(jsonSchema.type, "object");
		assert.equal(jsonSchema.anyOf, undefined);
		assert.equal(jsonSchema.oneOf, undefined);
		assert.deepEqual(Object.keys(jsonSchema.properties ?? {}).sort(), [
			"function_name",
			"mode",
		]);
		assert.deepEqual(jsonSchema.required, ["mode"]);
	});

	it("maps flat MCP tool_choice input back to the Portkey API shape", () => {
		assert.equal(toPromptToolChoice({ mode: "auto" }), "auto");
		assert.equal(toPromptToolChoice({ mode: "none" }), "none");
		assert.deepEqual(
			toPromptToolChoice({
				mode: "function",
				function_name: "search_docs",
			}),
			{
				type: "function",
				function: {
					name: "search_docs",
				},
			},
		);
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

describe("PromptsService.validateBillingMetadata", () => {
	it("accepts arbitrary app and env identifiers without unrecognized warnings", () => {
		const service = new PromptsService("test-dummy-key");
		const result = service.validateBillingMetadata({
			client_id: "test-client",
			app: "support-console",
			env: "qa",
			project_id: "project-1",
		});

		assert.equal(result.valid, true);
		assert.deepEqual(result.errors, []);
		assert.deepEqual(result.warnings, []);
	});
});

// ---------------------------------------------------------------------------
// MCP server package metadata caching
// ---------------------------------------------------------------------------

describe("createMcpServer package metadata caching", () => {
	it("reads package.json once per module load, not once per session", async () => {
		const originalReadFileSync = fs.readFileSync;
		const originalApiKey = process.env.PORTKEY_API_KEY;
		const packageJsonPath = fileURLToPath(
			new URL("../package.json", import.meta.url),
		);
		let readFileSyncCalls = 0;

		fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
			const requestedPath =
				args[0] instanceof URL ? fileURLToPath(args[0]) : args[0];
			if (requestedPath === packageJsonPath) {
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

	it("resolves package.json relative to the module instead of process.cwd()", async () => {
		const originalApiKey = process.env.PORTKEY_API_KEY;
		const originalCwd = process.cwd();
		const tempCwd = fs.mkdtempSync(join(tmpdir(), "portkey-admin-mcp-cwd-"));
		const expectedVersion = JSON.parse(
			fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
		).version as string;

		process.env.PORTKEY_API_KEY = "test-dummy-key";
		process.chdir(tempCwd);

		try {
			const { createMcpServer } = await import(
				`../src/lib/mcp-server.js?test=${Date.now()}-${Math.random()}`
			);

			const { server } = createMcpServer();
			const version = (
				server as unknown as {
					server: { _serverInfo?: { version?: string } };
				}
			).server._serverInfo?.version;

			assert.equal(version, expectedVersion);
		} finally {
			process.chdir(originalCwd);
			fs.rmSync(tempCwd, { recursive: true, force: true });
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
// Curated tool responses
// ---------------------------------------------------------------------------

describe("Curated tool responses", () => {
	it("includes pagination metadata in list_prompts responses", async () => {
		const listPromptsCallback = registerToolCallbacks((server) => {
			registerPromptsTools(
				server as never,
				{
					prompts: {
						listPrompts: async () => ({
							object: "list",
							total: 5,
							data: [
								{
									id: "prompt-3",
									name: "Support Prompt",
									slug: "support-prompt",
									collection_id: "collection-1",
									workspace_id: "workspace-1",
									model: "gpt-4.1",
									status: "active",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
									object: "prompt",
								},
								{
									id: "prompt-4",
									name: "Billing Prompt",
									slug: "billing-prompt",
									collection_id: "collection-1",
									workspace_id: "workspace-1",
									model: "gpt-4.1-mini",
									status: "archived",
									created_at: "2026-01-03T00:00:00.000Z",
									last_updated_at: "2026-01-04T00:00:00.000Z",
									object: "prompt",
								},
							],
						}),
					},
				} as never,
			);
		}).get("list_prompts");

		assert.ok(listPromptsCallback, "expected list_prompts to be registered");

		const result = (await listPromptsCallback({
			current_page: 2,
			page_size: 2,
		})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			current_page?: number;
			page_size?: number;
			returned_count?: number;
			has_more?: boolean;
			next_offset?: number | null;
			prompts?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.total, 5);
		assert.equal(payload.current_page, 2);
		assert.equal(payload.page_size, 2);
		assert.equal(payload.returned_count, 2);
		assert.equal(payload.has_more, true);
		assert.equal(payload.next_offset, 4);
		assert.deepEqual(payload.prompts, [
			{
				id: "prompt-3",
				name: "Support Prompt",
				slug: "support-prompt",
				collection_id: "collection-1",
				model: "gpt-4.1",
				status: "active",
				created_at: "2026-01-01T00:00:00.000Z",
				last_updated_at: "2026-01-02T00:00:00.000Z",
			},
			{
				id: "prompt-4",
				name: "Billing Prompt",
				slug: "billing-prompt",
				collection_id: "collection-1",
				model: "gpt-4.1-mini",
				status: "archived",
				created_at: "2026-01-03T00:00:00.000Z",
				last_updated_at: "2026-01-04T00:00:00.000Z",
			},
		]);
	});

	it("summarizes user lists instead of returning raw API list wrappers", async () => {
		const listUsersCallback = registerToolCallbacks((server) => {
			registerUsersTools(
				server as never,
				{
					users: {
						listUsers: async () => ({
							total: 2,
							object: "list",
							data: [
								{
									object: "user",
									id: "user-1",
									first_name: "Ada",
									last_name: "Lovelace",
									role: "admin",
									email: "ada@example.com",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
								},
								{
									object: "user",
									id: "user-2",
									first_name: "Grace",
									last_name: "Hopper",
									role: "member",
									email: "grace@example.com",
									created_at: "2026-01-03T00:00:00.000Z",
									last_updated_at: "2026-01-04T00:00:00.000Z",
								},
							],
						}),
					},
				} as never,
			);
		}).get("list_all_users");

		assert.ok(listUsersCallback, "expected list_all_users to be registered");

		const result = (await listUsersCallback()) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			users?: Array<Record<string, unknown>>;
			object?: string;
			data?: unknown[];
		};

		assert.equal(payload.total, 2);
		assert.equal(payload.object, undefined);
		assert.equal(payload.data, undefined);
		assert.deepEqual(payload.users, [
			{
				id: "user-1",
				name: "Ada Lovelace",
				email: "ada@example.com",
				role: "admin",
				created_at: "2026-01-01T00:00:00.000Z",
				last_updated_at: "2026-01-02T00:00:00.000Z",
			},
			{
				id: "user-2",
				name: "Grace Hopper",
				email: "grace@example.com",
				role: "member",
				created_at: "2026-01-03T00:00:00.000Z",
				last_updated_at: "2026-01-04T00:00:00.000Z",
			},
		]);
	});

	it("returns compact generic analytics payloads", async () => {
		const analyticsCallback = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getErrorStacksAnalytics: async () => ({
							object: "analytics-graph",
							summary: { total_errors: 3, unique_stacks: 2 },
							data_points: [
								{
									timestamp: "2026-01-01T00:00:00.000Z",
									auth_error: 2,
									timeout_error: 1,
								},
							],
						}),
					},
				} as never,
			);
		}).get("get_error_stacks_analytics");

		assert.ok(
			analyticsCallback,
			"expected get_error_stacks_analytics to be registered",
		);

		const result = (await analyticsCallback({
			time_of_generation_min: "2026-01-01T00:00:00.000Z",
			time_of_generation_max: "2026-01-02T00:00:00.000Z",
		})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			summary?: Record<string, unknown>;
			point_count?: number;
			data_points?: Array<Record<string, unknown>>;
			object?: string;
		};

		assert.deepEqual(payload.summary, {
			total_errors: 3,
			unique_stacks: 2,
		});
		assert.equal(payload.point_count, 1);
		assert.equal(payload.object, undefined);
		assert.deepEqual(payload.data_points, [
			{
				timestamp: "2026-01-01T00:00:00.000Z",
				auth_error: 2,
				timeout_error: 1,
			},
		]);
	});

	it("summarizes prompt versions instead of returning flattened raw prompt objects", async () => {
		const getPromptVersionCallback = registerToolCallbacks((server) => {
			registerPromptsTools(
				server as never,
				{
					prompts: {
						getPromptVersion: async () => ({
							id: "prompt-1",
							name: "Support Prompt",
							slug: "support-prompt",
							collection_id: "collection-1",
							workspace_id: "workspace-1",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							status: "active",
							model: "gpt-4.1",
							string: '[{"role":"system","content":"Be helpful"}]',
							prompt_version_id: "version-2",
							prompt_version: 2,
							prompt_version_description: "Production",
							prompt_version_status: "active",
							parameters: { team: "support" },
							functions: [
								{
									name: "lookup_ticket",
									description: "Find a support ticket",
								},
							],
							tools: [
								{
									type: "function",
									function: {
										name: "search_docs",
										description: "Search documentation",
									},
								},
							],
							tool_choice: "auto",
							template_metadata: { app: "hourlink", env: "prod" },
							virtual_key: "vk_support",
							object: "prompt",
						}),
					},
				} as never,
			);
		}).get("get_prompt_version");

		assert.ok(
			getPromptVersionCallback,
			"expected get_prompt_version to be registered",
		);

		const result = (await getPromptVersionCallback({
			prompt_id: "prompt-1",
			version_id: "version-2",
		})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			prompt?: Record<string, unknown>;
			version?: Record<string, unknown>;
			object?: string;
			functions?: unknown[];
			tools?: unknown[];
		};

		assert.equal(payload.object, undefined);
		assert.deepEqual(payload.prompt, {
			id: "prompt-1",
			name: "Support Prompt",
			slug: "support-prompt",
			collection_id: "collection-1",
			workspace_id: "workspace-1",
		});
		assert.deepEqual(payload.version, {
			id: "version-2",
			number: 2,
			description: "Production",
			status: "active",
			model: "gpt-4.1",
			virtual_key: "vk_support",
			template: '[{"role":"system","content":"Be helpful"}]',
			parameters: { team: "support" },
			metadata: { app: "hourlink", env: "prod" },
			function_names: ["lookup_ticket"],
			tool_names: ["search_docs"],
			tool_choice: "auto",
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
		});
		assert.equal(payload.functions, undefined);
		assert.equal(payload.tools, undefined);
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
	let descriptionRegistrations = new Map<
		string,
		{
			config: {
				description?: string;
			};
		}
	>();

	const descriptionFor = (name: string) =>
		descriptionRegistrations.get(name)?.config.description || "";

	before(() => {
		descriptionRegistrations = new Map();

		registerAllTools(
			{
				registerTool(
					name: string,
					config: {
						description?: string;
					},
				) {
					descriptionRegistrations.set(name, { config });
					return {} as never;
				},
				tool() {
					return {} as never;
				},
			} as never,
			{} as never,
		);
	});

	it("registers a standard outputSchema when registerTool is available", () => {
		const registrations = new Map<
			string,
			{
				config: {
					outputSchema?: unknown;
					annotations?: unknown;
				};
				callback: (...args: unknown[]) => Promise<unknown>;
			}
		>();
		const legacyToolCalls: string[] = [];

		registerAllTools(
			{
				registerTool(
					name: string,
					config: {
						outputSchema?: unknown;
						annotations?: unknown;
					},
					callback: (...args: unknown[]) => Promise<unknown>,
				) {
					registrations.set(name, { config, callback });
					return {} as never;
				},
				tool(name: string) {
					legacyToolCalls.push(name);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		assert.equal(
			legacyToolCalls.length,
			0,
			"expected registerAllTools to prefer registerTool when available",
		);

		const listUsersRegistration = registrations.get("list_all_users");
		assert.ok(
			listUsersRegistration?.config.outputSchema,
			"expected list_all_users to include an outputSchema",
		);

		const outputSchema =
			listUsersRegistration.config.outputSchema instanceof z.ZodType
				? listUsersRegistration.config.outputSchema
				: z.object(listUsersRegistration.config.outputSchema as z.ZodRawShape);

		assert.equal(
			outputSchema.safeParse({
				ok: true,
				data: { total: 1, users: [] },
			}).success,
			true,
		);
		assert.equal(
			outputSchema.safeParse({
				ok: false,
				error: { message: "boom" },
			}).success,
			true,
		);
	});

	it("annotates Enterprise-gated tool descriptions with a simple plan requirement note", () => {
		const analyticsTools = [
			"get_cost_analytics",
			"get_request_analytics",
			"get_token_analytics",
			"get_latency_analytics",
			"get_error_analytics",
			"get_error_rate_analytics",
			"get_cache_hit_latency",
			"get_cache_hit_rate",
			"get_users_analytics",
			"get_error_stacks_analytics",
			"get_error_status_codes_analytics",
			"get_user_requests_analytics",
			"get_rescued_requests_analytics",
			"get_feedback_analytics",
			"get_feedback_models_analytics",
			"get_feedback_scores_analytics",
			"get_feedback_weighted_analytics",
			"get_analytics_group_users",
			"get_analytics_group_models",
			"get_analytics_group_metadata",
		] as const;

		for (const toolName of analyticsTools) {
			assert.match(
				descriptionFor(toolName),
				/Enterprise-gated\./,
				`${toolName} should advertise that it is Enterprise-gated`,
			);
		}

		assert.match(descriptionFor("list_audit_logs"), /Enterprise-gated\./);

		for (const toolName of [
			"get_integration",
			"list_integration_models",
			"list_integration_workspaces",
		] as const) {
			assert.match(
				descriptionFor(toolName),
				/Enterprise-gated\./,
				`${toolName} should advertise that it is Enterprise-gated`,
			);
		}

		for (const toolName of [
			"list_all_users",
			"get_user",
			"list_user_invites",
			"get_user_stats",
		] as const) {
			assert.match(
				descriptionFor(toolName),
				/Enterprise-gated\./,
				`${toolName} should advertise that it is Enterprise-gated`,
			);
		}

		assert.doesNotMatch(
			descriptionFor("create_prompt"),
			/Enterprise-gated\./,
			"non-gated tools should not be annotated as Enterprise-gated",
		);
	});

	it("describes workflow boundaries, returned scope, and sibling-tool guidance for weak tool families", () => {
		assert.match(
			descriptionFor("start_log_export"),
			/async|asynchronous|queue|queued/i,
			"start_log_export should disclose that export processing runs asynchronously",
		);
		assert.match(
			descriptionFor("start_log_export"),
			/does not return .*file|does not return .*rows|does not return .*result/i,
			"start_log_export should clarify that starting the job does not return export contents",
		);
		assert.match(
			descriptionFor("download_log_export"),
			/\b(url|link)\b/i,
			"download_log_export should clarify that it returns a URL or link rather than export contents",
		);
		assert.match(
			descriptionFor("list_configs"),
			/get_config/i,
			"list_configs should direct callers to get_config for detailed config inspection",
		);
		assert.match(
			descriptionFor("list_configs"),
			/\b(detail|full|routing|cache|retry|target)\b/i,
			"list_configs should explain what extra detail get_config provides",
		);
		assert.match(
			descriptionFor("get_request_analytics"),
			/summary/i,
			"get_request_analytics should mention the rolled-up summary alongside the time series",
		);
		assert.match(
			descriptionFor("get_token_analytics"),
			/summary/i,
			"get_token_analytics should mention the rolled-up summary alongside the time series",
		);
		assert.match(
			descriptionFor("get_usage_limit"),
			/list_usage_limits/i,
			"get_usage_limit should point callers to list_usage_limits when they need discovery",
		);
		assert.match(
			descriptionFor("get_user"),
			/invite|invitation/i,
			"get_user should distinguish accepted users from pending invitations",
		);
		assert.match(
			descriptionFor("list_all_users"),
			/invite|invitation/i,
			"list_all_users should distinguish accepted users from pending invitations",
		);
	});

	it("holds A-rated and infrastructure tool descriptions to the same stricter standard", () => {
		assert.match(
			descriptionFor("publish_prompt"),
			/default|active/i,
			"publish_prompt should clarify that it changes the prompt's default or active version",
		);
		assert.match(
			descriptionFor("publish_prompt"),
			/update_prompt|list_prompt_versions/i,
			"publish_prompt should point callers to adjacent prompt workflow tools",
		);

		assert.match(
			descriptionFor("create_collection"),
			/\b(id|slug)\b/i,
			"create_collection should mention the identifiers it returns",
		);
		assert.match(
			descriptionFor("create_collection"),
			/create_prompt|list_prompts/i,
			"create_collection should explain what downstream prompt workflows it supports",
		);

		assert.match(
			descriptionFor("create_feedback"),
			/\b(status|feedback_ids|ids?)\b/i,
			"create_feedback should mention the feedback identifiers or status it returns",
		);
		assert.match(
			descriptionFor("create_feedback"),
			/update_feedback/i,
			"create_feedback should distinguish itself from update_feedback",
		);

		assert.match(
			descriptionFor("update_log_export"),
			/only/i,
			"update_log_export should be explicit about the limited fields that can change",
		);
		assert.match(
			descriptionFor("update_log_export"),
			/start_log_export|get_log_export/i,
			"update_log_export should place itself in the broader export workflow",
		);

		assert.match(
			descriptionFor("list_audit_logs"),
			/individual|events?/i,
			"list_audit_logs should clarify that it returns individual events rather than aggregates",
		);
		assert.match(
			descriptionFor("list_audit_logs"),
			/analytics/i,
			"list_audit_logs should distinguish itself from analytics tools",
		);

		assert.match(
			descriptionFor("create_mcp_integration"),
			/\b(id|slug)\b/i,
			"create_mcp_integration should mention the identifiers it returns",
		);
		assert.match(
			descriptionFor("create_mcp_integration"),
			/create_mcp_server|capabilities/i,
			"create_mcp_integration should point to the next MCP setup step",
		);

		assert.match(
			descriptionFor("delete_mcp_integration"),
			/\b(remove|servers?)\b/i,
			"delete_mcp_integration should disclose its cascading effect on child servers",
		);
		assert.match(
			descriptionFor("delete_mcp_integration"),
			/immediately|lose access/i,
			"delete_mcp_integration should disclose immediate access impact",
		);

		assert.match(
			descriptionFor("test_mcp_server"),
			/response time|latency/i,
			"test_mcp_server should mention the measured connectivity result",
		);
		assert.match(
			descriptionFor("test_mcp_server"),
			/error/i,
			"test_mcp_server should mention that failures return an error message",
		);
	});

	it("requires high-risk tool descriptions to disclose irreversible, access, billable, or failure semantics", () => {
		const riskyTools = [
			{
				toolName: "delete_api_key",
				patterns: [
					/\b(irreversible|cannot be undone|permanent)\b/i,
					/\b(break|stop|revoke|fail)\w*\b/i,
				],
			},
			{
				toolName: "delete_virtual_key",
				patterns: [
					/\b(irreversible|cannot be undone|permanent)\b/i,
					/\b(break|stop|revoke|fail)\w*\b/i,
				],
			},
			{
				toolName: "delete_prompt",
				patterns: [
					/\b(irreversible|cannot be undone|permanent)\b/i,
					/\b(break|stop|revoke|fail)\w*\b/i,
				],
			},
			{
				toolName: "delete_integration",
				patterns: [
					/\b(irreversible|cannot be undone|permanent)\b/i,
					/\b(break|stop|revoke|fail)\w*\b/i,
				],
			},
			{
				toolName: "create_api_key",
				patterns: [
					/(returned once|only returned once|one-time)/i,
					/\b(access|grant)\w*\b/i,
				],
			},
			{
				toolName: "create_virtual_key",
				patterns: [
					/(returned once|only returned at creation time|creation time)/i,
					/\b(immediately|prompts|configs)\b/i,
				],
			},
			{
				toolName: "run_prompt_completion",
				patterns: [
					/\bbillable\b/i,
					/(render_prompt|validate_completion_metadata)/i,
				],
			},
			{
				toolName: "insert_log",
				patterns: [/\b(write|writes|insert)\b/i, /(fail|must match)/i],
			},
		] as const;

		for (const { toolName, patterns } of riskyTools) {
			const description = descriptionFor(toolName);
			for (const pattern of patterns) {
				assert.match(
					description,
					pattern,
					`${toolName} should disclose high-risk behavior with pattern ${pattern}`,
				);
			}
		}
	});

	it("accepts arbitrary app and env identifiers in prompt tool schemas", () => {
		const registrations = new Map<string, unknown[]>();

		registerPromptsTools(
			{
				tool(name: string, ...rest: unknown[]) {
					registrations.set(name, rest);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		const migratePromptSchema = registrations.get("migrate_prompt")?.[1] as
			| z.ZodRawShape
			| undefined;
		const runPromptCompletionSchema = registrations.get(
			"run_prompt_completion",
		)?.[1] as z.ZodRawShape | undefined;

		assert.ok(migratePromptSchema, "expected migrate_prompt schema");
		assert.ok(
			runPromptCompletionSchema,
			"expected run_prompt_completion schema",
		);

		const migratePromptResult = z.object(migratePromptSchema).safeParse({
			name: "Support Prompt",
			app: "support-console",
			env: "qa",
			collection_id: "collection-1",
			string: "Hello {{name}}",
			parameters: { name: "Ada" },
			virtual_key: "vk_support",
		});
		assert.equal(migratePromptResult.success, true);

		const runPromptCompletionResult = z
			.object(runPromptCompletionSchema)
			.safeParse({
				prompt_id: "prompt-1",
				variables: { name: "Ada" },
				metadata: {
					client_id: "test-client",
					app: "support-console",
					env: "qa",
				},
			});
		assert.equal(runPromptCompletionResult.success, true);
	});

	it("accepts structured prompt template aliases in create_prompt schemas", () => {
		const registrations = new Map<string, unknown[]>();

		registerPromptsTools(
			{
				tool(name: string, ...rest: unknown[]) {
					registrations.set(name, rest);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		const createPromptSchema = registrations.get("create_prompt")?.[1] as
			| z.ZodRawShape
			| undefined;
		assert.ok(createPromptSchema, "expected create_prompt schema");

		const result = z.object(createPromptSchema).safeParse({
			name: "Support Prompt",
			collection_id: "collection-1",
			messages: [
				{
					role: "system",
					content: [{ type: "text", text: "Be helpful" }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "{{input}}" }],
				},
			],
			parameters: { input: "Ada" },
			virtual_key: "vk_support",
			model: "gpt-4.1",
		});

		assert.equal(result.success, true);
	});

	it("normalizes structured prompt template aliases before calling the prompts service", async () => {
		let receivedCreatePrompt: Record<string, unknown> | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerPromptsTools(
				server as never,
				{
					prompts: {
						createPrompt: async (params: Record<string, unknown>) => {
							receivedCreatePrompt = params;
							return {
								id: "prompt-1",
								slug: "support-prompt",
								version_id: "version-1",
								object: "prompt",
							};
						},
					},
				} as never,
			);
		});

		const createPromptCallback = callbacks.get("create_prompt");
		assert.ok(createPromptCallback, "expected create_prompt callback");

		await createPromptCallback({
			name: "Support Prompt",
			collection_id: "collection-1",
			messages: [
				{
					role: "system",
					content: [{ type: "text", text: "Be helpful" }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "{{input}}" }],
				},
			],
			parameters: { input: "Ada" },
			virtual_key: "vk_support",
			model: "gpt-4.1",
		});

		assert.deepEqual(receivedCreatePrompt, {
			name: "Support Prompt",
			collection_id: "collection-1",
			string:
				'[{"role":"system","content":[{"type":"text","text":"Be helpful"}]},{"role":"user","content":[{"type":"text","text":"{{input}}"}]}]',
			parameters: { input: "Ada" },
			virtual_key: "vk_support",
			model: "gpt-4.1",
		});
	});

	it("accepts structured prompt template aliases in update_prompt and migrate_prompt", async () => {
		const registrations = new Map<string, unknown[]>();

		registerPromptsTools(
			{
				tool(name: string, ...rest: unknown[]) {
					registrations.set(name, rest);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		const updatePromptSchema = registrations.get("update_prompt")?.[1] as
			| z.ZodRawShape
			| undefined;
		const migratePromptSchema = registrations.get("migrate_prompt")?.[1] as
			| z.ZodRawShape
			| undefined;
		assert.ok(updatePromptSchema, "expected update_prompt schema");
		assert.ok(migratePromptSchema, "expected migrate_prompt schema");

		assert.equal(
			z.object(updatePromptSchema).safeParse({
				prompt_id: "prompt-1",
				messages: [
					{
						role: "system",
						content: [{ type: "text", text: "Be concise" }],
					},
				],
			}).success,
			true,
		);
		assert.equal(
			z.object(migratePromptSchema).safeParse({
				name: "Support Prompt",
				app: "support-console",
				env: "qa",
				collection_id: "collection-1",
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "{{input}}" }],
					},
				],
				parameters: { input: "Ada" },
				virtual_key: "vk_support",
			}).success,
			true,
		);

		let receivedUpdatePrompt:
			| {
					prompt_id: string;
					body: Record<string, unknown>;
			  }
			| undefined;
		let receivedMigratePrompt: Record<string, unknown> | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerPromptsTools(
				server as never,
				{
					prompts: {
						updatePrompt: async (
							promptId: string,
							body: Record<string, unknown>,
						) => {
							receivedUpdatePrompt = { prompt_id: promptId, body };
							return {
								id: promptId,
								slug: "support-prompt",
								prompt_version_id: "version-2",
								object: "prompt",
							};
						},
						migratePrompt: async (body: Record<string, unknown>) => {
							receivedMigratePrompt = body;
							return {
								action: "create",
								dry_run: false,
								message: "created",
								prompt_id: "prompt-1",
								slug: "support-prompt",
								version_id: "version-1",
							};
						},
					},
				} as never,
			);
		});

		const updatePromptCallback = callbacks.get("update_prompt");
		const migratePromptCallback = callbacks.get("migrate_prompt");
		assert.ok(updatePromptCallback, "expected update_prompt callback");
		assert.ok(migratePromptCallback, "expected migrate_prompt callback");

		await updatePromptCallback({
			prompt_id: "prompt-1",
			messages: [
				{
					role: "system",
					content: [{ type: "text", text: "Be concise" }],
				},
			],
		});
		await migratePromptCallback({
			name: "Support Prompt",
			app: "support-console",
			env: "qa",
			collection_id: "collection-1",
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: "{{input}}" }],
				},
			],
			parameters: { input: "Ada" },
			virtual_key: "vk_support",
		});

		assert.deepEqual(receivedUpdatePrompt, {
			prompt_id: "prompt-1",
			body: {
				string:
					'[{"role":"system","content":[{"type":"text","text":"Be concise"}]}]',
			},
		});
		assert.deepEqual(receivedMigratePrompt, {
			name: "Support Prompt",
			app: "support-console",
			env: "qa",
			collection_id: "collection-1",
			string:
				'[{"role":"user","content":[{"type":"text","text":"{{input}}"}]}]',
			parameters: { input: "Ada" },
			virtual_key: "vk_support",
		});
	});

	it("accepts structured analytics filter aliases and normalizes them before calling the analytics service", async () => {
		const registrations = new Map<string, unknown[]>();
		registerAnalyticsTools(
			{
				tool(name: string, ...rest: unknown[]) {
					registrations.set(name, rest);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		const requestAnalyticsSchema = registrations.get(
			"get_request_analytics",
		)?.[1] as z.ZodRawShape | undefined;
		assert.ok(requestAnalyticsSchema, "expected get_request_analytics schema");

		const schemaResult = z.object(requestAnalyticsSchema).safeParse({
			time_of_generation_min: "2026-01-01T00:00:00.000Z",
			time_of_generation_max: "2026-01-02T00:00:00.000Z",
			status_codes: ["429", "500"],
			virtual_key_slugs: ["vk_support", "vk_sales"],
			config_slugs: ["cfg_support"],
			api_key_ids: ["key-1", "key-2"],
			trace_ids: ["trace-1"],
			span_ids: ["span-1"],
			provider_models: ["openai__gpt-4.1"],
			metadata_filter: { env: "prod", app: "support-console" },
		});
		assert.equal(schemaResult.success, true);

		let capturedParams: Record<string, unknown> | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getRequestAnalytics: async (params: Record<string, unknown>) => {
							capturedParams = params;
							return {
								summary: { total: 1, success: 1, failed: 0 },
								data_points: [],
							};
						},
					},
				} as never,
			);
		});

		const requestAnalyticsCallback = callbacks.get("get_request_analytics");
		assert.ok(
			requestAnalyticsCallback,
			"expected get_request_analytics callback",
		);

		await requestAnalyticsCallback({
			time_of_generation_min: "2026-01-01T00:00:00.000Z",
			time_of_generation_max: "2026-01-02T00:00:00.000Z",
			status_codes: ["429", "500"],
			virtual_key_slugs: ["vk_support", "vk_sales"],
			config_slugs: ["cfg_support"],
			api_key_ids: ["key-1", "key-2"],
			trace_ids: ["trace-1"],
			span_ids: ["span-1"],
			provider_models: ["openai__gpt-4.1"],
			metadata_filter: { env: "prod", app: "support-console" },
		});

		assert.deepEqual(capturedParams, {
			time_of_generation_min: "2026-01-01T00:00:00.000Z",
			time_of_generation_max: "2026-01-02T00:00:00.000Z",
			status_code: "429,500",
			virtual_keys: "vk_support,vk_sales",
			configs: "cfg_support",
			api_key_ids: "key-1,key-2",
			trace_id: "trace-1",
			span_id: "span-1",
			ai_org_model: "openai__gpt-4.1",
			metadata: '{"env":"prod","app":"support-console"}',
		});
	});

	it("applies structured analytics aliases across graph analytics tools sharing the base filter schema", async () => {
		const registrations = new Map<string, unknown[]>();
		registerAnalyticsTools(
			{
				tool(name: string, ...rest: unknown[]) {
					registrations.set(name, rest);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		const costAnalyticsSchema = registrations.get("get_cost_analytics")?.[1] as
			| z.ZodRawShape
			| undefined;
		assert.ok(costAnalyticsSchema, "expected get_cost_analytics schema");
		assert.equal(
			z.object(costAnalyticsSchema).safeParse({
				time_of_generation_min: "2026-01-01T00:00:00.000Z",
				time_of_generation_max: "2026-01-02T00:00:00.000Z",
				status_codes: ["429"],
				metadata_filter: { env: "prod" },
			}).success,
			true,
		);

		let capturedParams: Record<string, unknown> | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getCostAnalytics: async (params: Record<string, unknown>) => {
							capturedParams = params;
							return {
								summary: { total: 1, avg: 1 },
								data_points: [],
							};
						},
					},
				} as never,
			);
		});

		const costAnalyticsCallback = callbacks.get("get_cost_analytics");
		assert.ok(costAnalyticsCallback, "expected get_cost_analytics callback");

		await costAnalyticsCallback({
			time_of_generation_min: "2026-01-01T00:00:00.000Z",
			time_of_generation_max: "2026-01-02T00:00:00.000Z",
			status_codes: ["429"],
			metadata_filter: { env: "prod" },
		});

		assert.deepEqual(capturedParams, {
			time_of_generation_min: "2026-01-01T00:00:00.000Z",
			time_of_generation_max: "2026-01-02T00:00:00.000Z",
			status_code: "429",
			metadata: '{"env":"prod"}',
		});
	});

	it("wraps successful tool responses in a standard ok/data envelope", async () => {
		const callbacks = new Map<
			string,
			(...args: unknown[]) => Promise<unknown>
		>();

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
			{
				prompts: {
					validateBillingMetadata: (params: unknown) => ({
						valid: true,
						errors: [],
						warnings: [],
						received: params,
					}),
				},
			} as never,
		);

		const validateCallback = callbacks.get("validate_completion_metadata");
		assert.ok(
			validateCallback,
			"expected validate_completion_metadata to be registered",
		);

		const result = (await validateCallback({
			client_id: "test-client",
			app: "support-console",
			env: "qa",
		})) as {
			content: Array<{ type: string; text: string }>;
			structuredContent?: unknown;
			isError?: boolean;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			ok?: boolean;
			data?: {
				valid?: boolean;
				errors?: unknown[];
				warnings?: unknown[];
				metadata?: Record<string, unknown>;
			};
		};

		assert.equal(result.isError, undefined);
		assert.equal(result.content[0]?.type, "text");
		assert.equal(payload.ok, true);
		assert.equal(payload.data?.valid, true);
		assert.deepEqual(payload.data?.errors, []);
		assert.deepEqual(payload.data?.warnings, []);
		assert.deepEqual(payload.data?.metadata, {
			client_id: "test-client",
			app: "support-console",
			env: "qa",
		});
		assert.deepEqual(result.structuredContent, payload);
	});

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
				structuredContent?: unknown;
				isError?: boolean;
			};
			const payload = JSON.parse(result.content[0]?.text || "{}") as {
				ok?: boolean;
				error?: {
					message?: string;
				};
			};

			assert.equal(result.isError, true);
			assert.equal(result.content[0]?.type, "text");
			assert.equal(payload.ok, false);
			assert.match(
				payload.error?.message || "",
				/Tool "list_all_users" failed: .*listUsers.*/,
			);
			assert.deepEqual(result.structuredContent, payload);
			assert.equal(loggedErrors.length, 1);
			assert.equal(loggedErrors[0]?.message, "Tool callback failed");
		} finally {
			Logger.error = originalLoggerError;
		}
	});
});

describe("Tool annotations", () => {
	it("adds inferred MCP annotations to every registered tool", () => {
		const registrations = new Map<string, unknown[]>();

		registerAllTools(
			{
				tool(name: string, ...rest: unknown[]) {
					registrations.set(name, rest);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		const getAnnotations = (name: string) => {
			const registration = registrations.get(name);
			assert.ok(registration, `expected ${name} to be registered`);

			const annotations = registration.at(-2) as
				| {
						readOnlyHint?: boolean;
						destructiveHint?: boolean;
						idempotentHint?: boolean;
						openWorldHint?: boolean;
				  }
				| undefined;

			assert.equal(
				typeof annotations,
				"object",
				`expected ${name} to include tool annotations`,
			);
			assert.equal(
				typeof annotations?.readOnlyHint,
				"boolean",
				`expected ${name} readOnlyHint to be set`,
			);
			assert.equal(
				typeof annotations?.destructiveHint,
				"boolean",
				`expected ${name} destructiveHint to be set`,
			);
			assert.equal(
				typeof annotations?.idempotentHint,
				"boolean",
				`expected ${name} idempotentHint to be set`,
			);
			assert.equal(
				typeof annotations?.openWorldHint,
				"boolean",
				`expected ${name} openWorldHint to be set`,
			);

			return annotations;
		};

		for (const toolName of registrations.keys()) {
			getAnnotations(toolName);
		}

		assert.deepEqual(getAnnotations("list_all_users"), {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		});
		assert.deepEqual(getAnnotations("create_prompt"), {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		});
		assert.deepEqual(getAnnotations("delete_user"), {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		});
		assert.deepEqual(getAnnotations("render_prompt"), {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		});
		// Side-effecting tools must not be marked read-only: run_* triggers a
		// billable completion and test_* opens an outbound connection.
		assert.deepEqual(getAnnotations("run_prompt_completion"), {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		});
		assert.deepEqual(getAnnotations("test_mcp_server"), {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		});
	});

	it("reuses module-level schema objects across tool registrations", () => {
		const captureSchemas = () => {
			const schemas = new Map<string, unknown>();

			registerAllTools(
				{
					tool(name: string, ...rest: unknown[]) {
						schemas.set(name, rest[1]);
						return {} as never;
					},
				} as never,
				{} as never,
			);

			return schemas;
		};

		const firstSchemas = captureSchemas();
		const secondSchemas = captureSchemas();

		assert.equal(firstSchemas.size, secondSchemas.size);

		for (const [toolName, firstSchema] of firstSchemas) {
			assert.strictEqual(
				secondSchemas.get(toolName),
				firstSchema,
				`expected ${toolName} to reuse its module-level schema object`,
			);
		}
	});
});
