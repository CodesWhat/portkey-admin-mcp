/**
 * Unit tests for observability / governance tool modules that had zero coverage:
 * - src/tools/guardrails.tools.ts
 * - src/tools/limits.tools.ts
 * - src/tools/logging.tools.ts
 * - src/tools/tracing.tools.ts
 * - src/tools/audit.tools.ts
 *
 * Also covers direct unit tests for src/lib/limits.ts exports:
 * buildUsageLimits, buildRateLimitsRpm, buildRateLimits
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildRateLimits,
	buildRateLimitsRpm,
	buildUsageLimits,
} from "../src/lib/limits.js";
import { BaseService } from "../src/services/base.service.js";
import { registerAuditTools } from "../src/tools/audit.tools.js";
import { registerGuardrailsTools } from "../src/tools/guardrails.tools.js";
import { registerLimitsTools } from "../src/tools/limits.tools.js";
import { registerLoggingTools } from "../src/tools/logging.tools.js";
import { registerTracingTools } from "../src/tools/tracing.tools.js";

// ---------------------------------------------------------------------------
// Helpers (mirrored from unit.test.ts)
// ---------------------------------------------------------------------------

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
// src/lib/limits.ts — buildUsageLimits
// ---------------------------------------------------------------------------

describe("buildUsageLimits", () => {
	it("returns undefined when neither credit_limit nor alert_threshold is provided", () => {
		assert.equal(buildUsageLimits({}), undefined);
		assert.equal(
			buildUsageLimits({ type: "cost", periodic_reset: "monthly" }),
			undefined,
		);
	});

	it("preserves credit_limit=0 — does not treat zero as absent", () => {
		const result = buildUsageLimits({ credit_limit: 0 });
		assert.ok(
			result !== undefined,
			"expected a limits object when credit_limit=0",
		);
		assert.equal(result.credit_limit, 0);
	});

	it("preserves alert_threshold=0 — does not treat zero as absent", () => {
		const result = buildUsageLimits({ alert_threshold: 0 });
		assert.ok(
			result !== undefined,
			"expected a limits object when alert_threshold=0",
		);
		assert.equal(result.alert_threshold, 0);
	});

	it("includes both credit_limit and alert_threshold when both are 0", () => {
		const result = buildUsageLimits({ credit_limit: 0, alert_threshold: 0 });
		assert.ok(result !== undefined);
		assert.equal(result.credit_limit, 0);
		assert.equal(result.alert_threshold, 0);
	});

	it("sets defaults for type and periodic_reset when only credit_limit is provided", () => {
		const result = buildUsageLimits({ credit_limit: 100 });
		assert.ok(result !== undefined);
		assert.equal(result.type, "cost");
		assert.equal(result.periodic_reset, "monthly");
	});

	it("uses caller-supplied type and periodic_reset when provided", () => {
		const result = buildUsageLimits({
			credit_limit: 500,
			type: "tokens",
			periodic_reset: "weekly",
		});
		assert.ok(result !== undefined);
		assert.equal(result.type, "tokens");
		assert.equal(result.periodic_reset, "weekly");
	});

	it("omits credit_limit from returned object when only alert_threshold is provided", () => {
		const result = buildUsageLimits({ alert_threshold: 80 });
		assert.ok(result !== undefined);
		assert.equal("credit_limit" in result, false);
		assert.equal(result.alert_threshold, 80);
	});
});

// ---------------------------------------------------------------------------
// src/lib/limits.ts — buildRateLimitsRpm
// ---------------------------------------------------------------------------

describe("buildRateLimitsRpm", () => {
	it("returns undefined when value is undefined (none provided)", () => {
		assert.equal(buildRateLimitsRpm(undefined), undefined);
	});

	it("returns a single-element RPM array for a positive value", () => {
		const result = buildRateLimitsRpm(60);
		assert.deepEqual(result, [{ type: "requests", unit: "rpm", value: 60 }]);
	});

	it("preserves a value of 0", () => {
		const result = buildRateLimitsRpm(0);
		assert.ok(Array.isArray(result) && result.length === 1);
		assert.equal(result[0]?.value, 0);
		assert.equal(result[0]?.unit, "rpm");
	});
});

// ---------------------------------------------------------------------------
// src/lib/limits.ts — buildRateLimits
// ---------------------------------------------------------------------------

describe("buildRateLimits", () => {
	it("builds an RPD entry", () => {
		const result = buildRateLimits({ value: 1000, unit: "rpd" });
		assert.deepEqual(result, [{ type: "requests", unit: "rpd", value: 1000 }]);
	});

	it("builds an RPH entry", () => {
		const result = buildRateLimits({ value: 200, unit: "rph" });
		assert.deepEqual(result, [{ type: "requests", unit: "rph", value: 200 }]);
	});

	it("builds an RPM entry", () => {
		const result = buildRateLimits({ value: 30, unit: "rpm" });
		assert.deepEqual(result, [{ type: "requests", unit: "rpm", value: 30 }]);
	});
});

// ---------------------------------------------------------------------------
// guardrails.tools.ts — payload assembly
// ---------------------------------------------------------------------------

describe("create_guardrail payload assembly", () => {
	it("passes name, checks, and actions to the service", async () => {
		let receivedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerGuardrailsTools(
				server as never,
				{
					guardrails: {
						createGuardrail: async (payload: unknown) => {
							receivedPayload = payload;
							return { id: "guard_123", slug: "my-guard", version_id: "ver_1" };
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_guardrail");
		assert.ok(callback, "expected create_guardrail to be registered");

		await callback({
			name: "PII Guard",
			checks: [
				{ id: "default.pii", is_enabled: true, parameters: { block: true } },
			],
			actions: { deny: true, on_fail_action: "block" },
			workspace_id: "ws_abc",
		});

		assert.deepEqual(receivedPayload, {
			name: "PII Guard",
			checks: [
				{ id: "default.pii", is_enabled: true, parameters: { block: true } },
			],
			actions: { deny: true, on_fail_action: "block" },
			workspace_id: "ws_abc",
			organisation_id: undefined,
		});
	});

	it("returns id, slug, and version_id in the success response", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerGuardrailsTools(
				server as never,
				{
					guardrails: {
						createGuardrail: async () => ({
							id: "guard_456",
							slug: "jwt-guard",
							version_id: "ver_2",
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_guardrail");
		assert.ok(callback);

		const result = (await callback({
			name: "JWT Guard",
			checks: [{ id: "default.jwt" }],
			actions: {},
		})) as { content: Array<{ text: string }> };

		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			slug?: string;
			version_id?: string;
		};
		assert.equal(payload.id, "guard_456");
		assert.equal(payload.slug, "jwt-guard");
		assert.equal(payload.version_id, "ver_2");
	});
});

describe("update_guardrail payload assembly", () => {
	it("only includes defined fields (name, checks, actions) in the update body", async () => {
		let receivedId: string | undefined;
		let receivedUpdate: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerGuardrailsTools(
				server as never,
				{
					guardrails: {
						updateGuardrail: async (id: string, payload: unknown) => {
							receivedId = id;
							receivedUpdate = payload;
							return { id: "guard_123", slug: "my-guard", version_id: "ver_3" };
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("update_guardrail");
		assert.ok(callback);

		await callback({ guardrail_id: "guard/one two", name: "Updated Guard" });

		assert.equal(receivedId, "guard/one two");
		assert.deepEqual(receivedUpdate, { name: "Updated Guard" });
	});
});

describe("get_guardrail curated response shape", () => {
	it("includes checks and actions in the full detail response", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerGuardrailsTools(
				server as never,
				{
					guardrails: {
						getGuardrail: async () => ({
							id: "guard_789",
							name: "Prompt Injection Guard",
							slug: "prompt-injection-guard",
							status: "active",
							workspace_id: "ws_abc",
							organisation_id: "org_abc",
							checks: [{ id: "default.prompt_injection", is_enabled: true }],
							actions: { deny: true, message: "Blocked" },
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							owner_id: "user_1",
							updated_by: null,
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("get_guardrail");
		assert.ok(callback);

		const result = (await callback({ guardrail_id: "guard_789" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			checks?: Array<{ id: string }>;
			actions?: { deny?: boolean };
		};

		assert.equal(payload.id, "guard_789");
		assert.ok(Array.isArray(payload.checks) && payload.checks.length === 1);
		assert.equal(payload.checks[0]?.id, "default.prompt_injection");
		assert.equal(payload.actions?.deny, true);
	});
});

describe("list_guardrails curated response shape", () => {
	it("returns total and guardrails array without raw API wrapper fields", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerGuardrailsTools(
				server as never,
				{
					guardrails: {
						listGuardrails: async () => ({
							total: 2,
							data: [
								{
									id: "g1",
									name: "Guard A",
									slug: "guard-a",
									status: "active",
									workspace_id: "ws_1",
									organisation_id: "org_1",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-01T00:00:00.000Z",
									owner_id: "u1",
									updated_by: null,
								},
								{
									id: "g2",
									name: "Guard B",
									slug: "guard-b",
									status: "archived",
									workspace_id: "ws_1",
									organisation_id: "org_1",
									created_at: "2026-01-02T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
									owner_id: "u2",
									updated_by: "u1",
								},
							],
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("list_guardrails");
		assert.ok(callback);

		const result = (await callback({})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			guardrails?: Array<{ id: string; slug: string }>;
		};

		assert.equal(payload.total, 2);
		assert.ok(
			Array.isArray(payload.guardrails) && payload.guardrails.length === 2,
		);
		assert.equal(payload.guardrails[0]?.id, "g1");
		assert.equal(payload.guardrails[1]?.slug, "guard-b");
	});
});

describe("guardrails service path encoding", () => {
	it("encodes guardrail IDs containing slashes and spaces", async () => {
		const { GuardrailsService } = await import(
			"../src/services/guardrails.service.js"
		);

		const getReq = await captureServiceRequest(() =>
			new GuardrailsService("test-key").getGuardrail("guard/one two"),
		);
		assert.equal(getReq.method, "GET");
		assert.equal(getReq.path, "/guardrails/guard%2Fone%20two");

		const deleteReq = await captureServiceRequest(() =>
			new GuardrailsService("test-key").deleteGuardrail("guard/abc def"),
		);
		assert.equal(deleteReq.method, "DELETE");
		assert.equal(deleteReq.path, "/guardrails/guard%2Fabc%20def");
	});
});

// ---------------------------------------------------------------------------
// limits.tools.ts — rate limit payload assembly
// ---------------------------------------------------------------------------

describe("create_rate_limit payload assembly", () => {
	it("passes conditions, group_by, type, unit, and value to the service", async () => {
		let receivedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerLimitsTools(
				server as never,
				{
					limits: {
						createRateLimit: async (payload: unknown) => {
							receivedPayload = payload;
							return {
								id: "rl_123",
								name: "My RPM Limit",
								type: "requests",
								unit: "rpm",
								value: 100,
								status: "active",
								conditions: [
									{ field: "virtual_key", operator: "is", value: "vk_abc" },
								],
								group_by: ["virtual_key"],
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-01T00:00:00.000Z",
								object: "rate_limit",
							};
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_rate_limit");
		assert.ok(callback, "expected create_rate_limit to be registered");

		await callback({
			conditions: [{ field: "virtual_key", operator: "is", value: "vk_abc" }],
			group_by: ["virtual_key"],
			type: "requests",
			unit: "rpm",
			value: 100,
			name: "My RPM Limit",
			workspace_id: "ws_1",
		});

		assert.deepEqual(receivedPayload, {
			conditions: [{ field: "virtual_key", operator: "is", value: "vk_abc" }],
			group_by: ["virtual_key"],
			type: "requests",
			unit: "rpm",
			value: 100,
			name: "My RPM Limit",
			workspace_id: "ws_1",
			organisation_id: undefined,
		});
	});
});

describe("get_rate_limit curated response shape", () => {
	it("returns a formatted rate limit object without raw API wrapper fields", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerLimitsTools(
				server as never,
				{
					limits: {
						getRateLimit: async () => ({
							id: "rl_abc",
							name: "Token Limit",
							type: "tokens" as const,
							unit: "rpd" as const,
							value: 500000,
							status: "active",
							conditions: [
								{ field: "api_key", operator: "is", value: "key_1" },
							],
							group_by: ["api_key"],
							workspace_id: "ws_1",
							organisation_id: "org_1",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-01T00:00:00.000Z",
							object: "rate_limit",
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("get_rate_limit");
		assert.ok(callback);

		const result = (await callback({ id: "rl_abc" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			type?: string;
			unit?: string;
			value?: number;
			object?: string;
		};

		assert.equal(payload.id, "rl_abc");
		assert.equal(payload.type, "tokens");
		assert.equal(payload.unit, "rpd");
		assert.equal(payload.value, 500000);
		assert.equal(
			payload.object,
			undefined,
			"raw 'object' field should not appear in curated response",
		);
	});
});

// ---------------------------------------------------------------------------
// limits.tools.ts — usage limit payload assembly
// ---------------------------------------------------------------------------

describe("create_usage_limit payload assembly", () => {
	it("passes conditions, group_by, type, credit_limit, and alert_threshold to the service", async () => {
		let receivedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerLimitsTools(
				server as never,
				{
					limits: {
						createUsageLimit: async (payload: unknown) => {
							receivedPayload = payload;
							return {
								id: "ul_123",
								type: "cost" as const,
								credit_limit: 50,
								alert_threshold: 80,
								periodic_reset: "monthly" as const,
								status: "active",
								conditions: [
									{ field: "virtual_key", operator: "is", value: "vk_1" },
								],
								group_by: ["virtual_key"],
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-01T00:00:00.000Z",
								object: "usage_limit",
							};
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_usage_limit");
		assert.ok(callback, "expected create_usage_limit to be registered");

		await callback({
			conditions: [{ field: "virtual_key", operator: "is", value: "vk_1" }],
			group_by: ["virtual_key"],
			type: "cost",
			credit_limit: 50,
			alert_threshold: 80,
			periodic_reset: "monthly",
		});

		assert.deepEqual(receivedPayload, {
			conditions: [{ field: "virtual_key", operator: "is", value: "vk_1" }],
			group_by: ["virtual_key"],
			type: "cost",
			credit_limit: 50,
			alert_threshold: 80,
			periodic_reset: "monthly",
			name: undefined,
			workspace_id: undefined,
			organisation_id: undefined,
		});
	});
});

describe("list_usage_limits curated response shape", () => {
	it("returns total and usage_limits array", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerLimitsTools(
				server as never,
				{
					limits: {
						listUsageLimits: async () => ({
							total: 1,
							object: "list" as const,
							data: [
								{
									id: "ul_1",
									type: "tokens" as const,
									credit_limit: 1000000,
									alert_threshold: 90,
									periodic_reset: "weekly" as const,
									status: "active",
									conditions: [],
									group_by: ["user_id"],
									workspace_id: "ws_1",
									organisation_id: "org_1",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-01T00:00:00.000Z",
									object: "usage_limit",
								},
							],
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("list_usage_limits");
		assert.ok(callback);

		const result = (await callback({})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			usage_limits?: Array<{ id: string; type: string; object?: string }>;
		};

		assert.equal(payload.total, 1);
		assert.ok(Array.isArray(payload.usage_limits));
		assert.equal(payload.usage_limits[0]?.id, "ul_1");
		assert.equal(payload.usage_limits[0]?.type, "tokens");
		assert.equal(
			payload.usage_limits[0]?.object,
			undefined,
			"raw 'object' should not be in curated list",
		);
	});
});

describe("limits service path encoding", () => {
	it("encodes rate limit IDs containing slashes and spaces", async () => {
		const { LimitsService } = await import("../src/services/limits.service.js");

		const getReq = await captureServiceRequest(() =>
			new LimitsService("test-key").getRateLimit("rl/one two"),
		);
		assert.equal(getReq.method, "GET");
		assert.equal(getReq.path, "/policies/rate-limits/rl%2Fone%20two");

		const updateReq = await captureServiceRequest(() =>
			new LimitsService("test-key").updateUsageLimit("ul/x y", { name: "new" }),
		);
		assert.equal(updateReq.method, "PUT");
		assert.equal(updateReq.path, "/policies/usage-limits/ul%2Fx%20y");
	});
});

// ---------------------------------------------------------------------------
// logging.tools.ts — insert_log payload assembly
// ---------------------------------------------------------------------------

describe("insert_log payload assembly", () => {
	it("assembles request, response, and metadata sub-objects from flat tool params", async () => {
		let receivedEntry: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerLoggingTools(
				server as never,
				{
					logging: {
						insertLog: async (entry: unknown) => {
							receivedEntry = entry;
							return { success: true };
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("insert_log");
		assert.ok(callback, "expected insert_log to be registered");

		await callback({
			request_url: "https://api.openai.com/v1/chat/completions",
			request_provider: "openai",
			request_method: "post",
			request_body: { model: "gpt-4" },
			response_status: 200,
			response_body: { choices: [] },
			response_time: 350,
			streaming_mode: false,
			metadata_trace_id: "trace-abc",
			metadata_span_id: "span-1",
			metadata_custom: { env: "prod" },
		});

		assert.deepEqual(receivedEntry, {
			request: {
				url: "https://api.openai.com/v1/chat/completions",
				provider: "openai",
				method: "post",
				headers: undefined,
				body: { model: "gpt-4" },
			},
			response: {
				status: 200,
				headers: undefined,
				body: { choices: [] },
				response_time: 350,
				streamingMode: false,
			},
			metadata: {
				organization: undefined,
				user: undefined,
				traceId: "trace-abc",
				spanId: "span-1",
				spanName: undefined,
				parentSpanId: undefined,
				env: "prod",
			},
		});
	});
});

describe("create_log_export payload assembly", () => {
	it("maps flat tool params to nested filters and requested_data", async () => {
		let receivedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerLoggingTools(
				server as never,
				{
					logging: {
						createLogExport: async (payload: unknown) => {
							receivedPayload = payload;
							return { id: "exp_123", total: 0, object: "log_export" };
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_log_export");
		assert.ok(callback, "expected create_log_export to be registered");

		await callback({
			workspace_id: "ws_1",
			time_min: "2026-01-01",
			time_max: "2026-01-31",
			requested_fields: ["id", "trace_id", "created_at"],
		});

		assert.deepEqual(receivedPayload, {
			workspace_id: "ws_1",
			description: undefined,
			filters: {
				time_of_generation_min: "2026-01-01",
				time_of_generation_max: "2026-01-31",
				cost_min: undefined,
				cost_max: undefined,
				total_units_min: undefined,
				total_units_max: undefined,
				ai_model: undefined,
			},
			requested_data: ["id", "trace_id", "created_at"],
		});
	});

	it("returns id, total, and object in the success response", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerLoggingTools(
				server as never,
				{
					logging: {
						createLogExport: async () => ({
							id: "exp_abc",
							total: 1500,
							object: "log_export",
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_log_export");
		assert.ok(callback);

		const result = (await callback({
			time_min: "2026-01-01",
			time_max: "2026-01-31",
			requested_fields: ["id"],
		})) as { content: Array<{ text: string }> };

		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			total?: number;
			object?: string;
		};
		assert.equal(payload.id, "exp_abc");
		assert.equal(payload.total, 1500);
		assert.equal(payload.object, "log_export");
	});
});

describe("list_log_exports curated response shape", () => {
	it("returns total and exports array with curated fields", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerLoggingTools(
				server as never,
				{
					logging: {
						listLogExports: async () => ({
							total: 1,
							object: "list" as const,
							data: [
								{
									id: "exp_1",
									status: "completed",
									description: "Jan export",
									filters: { time_of_generation_min: "2026-01-01" },
									requested_data: ["id", "trace_id"] as ["id", "trace_id"],
									workspace_id: "ws_1",
									organisation_id: "org_1",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
									created_by: "user_1",
								},
							],
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("list_log_exports");
		assert.ok(callback);

		const result = (await callback({ workspace_id: "ws_1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			exports?: Array<{ id: string; status: string }>;
		};

		assert.equal(payload.total, 1);
		assert.ok(Array.isArray(payload.exports) && payload.exports.length === 1);
		assert.equal(payload.exports[0]?.id, "exp_1");
		assert.equal(payload.exports[0]?.status, "completed");
	});
});

describe("download_log_export returns signed URL", () => {
	it("returns export_id and signed_url in response", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerLoggingTools(
				server as never,
				{
					logging: {
						downloadLogExport: async () => ({
							signed_url:
								"https://storage.example.com/exports/exp_1.csv?sig=abc",
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("download_log_export");
		assert.ok(callback);

		const result = (await callback({ export_id: "exp_1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			export_id?: string;
			signed_url?: string;
		};

		assert.equal(payload.export_id, "exp_1");
		assert.ok(
			typeof payload.signed_url === "string" &&
				payload.signed_url.startsWith("https://"),
		);
	});
});

// ---------------------------------------------------------------------------
// tracing.tools.ts — create_feedback payload assembly
// ---------------------------------------------------------------------------

describe("create_feedback payload assembly", () => {
	it("passes trace_id, value, weight, and metadata to the service", async () => {
		let receivedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerTracingTools(
				server as never,
				{
					tracing: {
						createFeedback: async (payload: unknown) => {
							receivedPayload = payload;
							return {
								status: "success",
								message: "ok",
								feedback_ids: ["fb_1"],
							};
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_feedback");
		assert.ok(callback, "expected create_feedback to be registered");

		await callback({
			trace_id: "trace-abc",
			value: 1,
			weight: 0.8,
			metadata: { source: "ui" },
		});

		assert.deepEqual(receivedPayload, {
			trace_id: "trace-abc",
			value: 1,
			weight: 0.8,
			metadata: { source: "ui" },
		});
	});

	it("returns status and feedback_ids in the success response", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerTracingTools(
				server as never,
				{
					tracing: {
						createFeedback: async () => ({
							status: "success" as const,
							message: "Feedback recorded",
							feedback_ids: ["fb_abc", "fb_def"],
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("create_feedback");
		assert.ok(callback);

		const result = (await callback({
			trace_id: "trace-xyz",
			value: 0,
		})) as { content: Array<{ text: string }> };

		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			status?: string;
			feedback_ids?: string[];
		};
		assert.equal(payload.status, "success");
		assert.deepEqual(payload.feedback_ids, ["fb_abc", "fb_def"]);
	});
});

describe("update_feedback payload assembly", () => {
	it("passes id and update fields to the service", async () => {
		let receivedId: string | undefined;
		let receivedUpdate: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerTracingTools(
				server as never,
				{
					tracing: {
						updateFeedback: async (id: string, update: unknown) => {
							receivedId = id;
							receivedUpdate = update;
							return {
								status: "success",
								message: "ok",
								feedback_ids: ["fb_1"],
							};
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("update_feedback");
		assert.ok(callback, "expected update_feedback to be registered");

		await callback({ id: "fb/one two", value: 0, weight: 0.5 });

		assert.equal(receivedId, "fb/one two");
		assert.deepEqual(receivedUpdate, {
			value: 0,
			weight: 0.5,
			metadata: undefined,
		});
	});
});

describe("tracing service path encoding", () => {
	it("encodes feedback IDs containing slashes and spaces", async () => {
		const { TracingService } = await import(
			"../src/services/tracing.service.js"
		);

		const req = await captureServiceRequest(() =>
			new TracingService("test-key").updateFeedback("fb/one two", { value: 1 }),
		);
		assert.equal(req.method, "PUT");
		assert.equal(req.path, "/feedback/fb%2Fone%20two");
	});
});

// ---------------------------------------------------------------------------
// audit.tools.ts — list_audit_logs payload assembly + curated response shape
// ---------------------------------------------------------------------------

describe("list_audit_logs payload assembly", () => {
	it("passes all filter parameters to the service", async () => {
		let receivedParams: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerAuditTools(
				server as never,
				{
					audit: {
						listAuditLogs: async (params: unknown) => {
							receivedParams = params;
							return {
								total: 0,
								current_page: 1,
								page_size: 20,
								object: "list" as const,
								data: [],
							};
						},
					},
				} as never,
			);
		});

		const callback = callbacks.get("list_audit_logs");
		assert.ok(callback, "expected list_audit_logs to be registered");

		await callback({
			workspace_id: "ws_1",
			actor_id: "user_abc",
			action: "delete",
			resource_type: "virtual_key",
			resource_id: "vk_123",
			start_time: "2026-01-01T00:00:00Z",
			end_time: "2026-01-31T23:59:59Z",
			current_page: 2,
			page_size: 50,
		});

		assert.deepEqual(receivedParams, {
			workspace_id: "ws_1",
			actor_id: "user_abc",
			action: "delete",
			resource_type: "virtual_key",
			resource_id: "vk_123",
			start_time: "2026-01-01T00:00:00Z",
			end_time: "2026-01-31T23:59:59Z",
			current_page: 2,
			page_size: 50,
		});
	});
});

describe("list_audit_logs curated response shape", () => {
	it("returns total, current_page, page_size, and audit_logs array", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerAuditTools(
				server as never,
				{
					audit: {
						listAuditLogs: async () => ({
							total: 1,
							current_page: 1,
							page_size: 20,
							object: "list" as const,
							data: [
								{
									id: "log_1",
									action: "create",
									actor_id: "user_1",
									actor_email: "admin@example.com",
									actor_name: "Admin User",
									resource_type: "workspace",
									resource_id: "ws_1",
									resource_name: "My Workspace",
									workspace_id: "ws_1",
									organisation_id: "org_1",
									metadata: { reason: "setup" },
									ip_address: "1.2.3.4",
									user_agent: "MCP/1.0",
									created_at: "2026-01-01T00:00:00.000Z",
								},
							],
						}),
					},
				} as never,
			);
		});

		const callback = callbacks.get("list_audit_logs");
		assert.ok(callback);

		const result = (await callback({})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			current_page?: number;
			page_size?: number;
			audit_logs?: Array<{
				id: string;
				action: string;
				actor_id: string;
				resource_type: string;
			}>;
			object?: string;
			data?: unknown[];
		};

		assert.equal(payload.total, 1);
		assert.equal(payload.current_page, 1);
		assert.equal(payload.page_size, 20);
		assert.equal(
			payload.object,
			undefined,
			"raw 'object' field should not appear",
		);
		assert.equal(payload.data, undefined, "raw 'data' field should not appear");
		assert.ok(
			Array.isArray(payload.audit_logs) && payload.audit_logs.length === 1,
		);
		assert.equal(payload.audit_logs[0]?.id, "log_1");
		assert.equal(payload.audit_logs[0]?.action, "create");
		assert.equal(payload.audit_logs[0]?.actor_id, "user_1");
		assert.equal(payload.audit_logs[0]?.resource_type, "workspace");
	});
});
