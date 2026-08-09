/**
 * Behavioral unit tests for src/tools/analytics.tools.ts.
 *
 * Analytics sat at ~39% function coverage because generic schema/annotation
 * sweeps register every tool but never invoke a callback, so
 * normalizeAnalyticsParams' query-param construction and each tool's
 * response-curation body were unverified.
 *
 * Covers 4 representative tools (get_cost_analytics, get_request_analytics,
 * get_users_analytics — which has a distinct summary/data-point shape — and
 * get_feedback_analytics, one of the 8 table-driven generic graph tools),
 * plus a full walk of GENERIC_GRAPH_ANALYTICS_TOOLS that asserts every
 * table entry registers under its expected name and calls its declared
 * AnalyticsService method. That walk is the regression guard for the
 * table-driven refactor: a swapped/duplicated method or a typo'd tool name
 * in the table would be invisible to schema sweeps but fails this test.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerAnalyticsTools } from "../src/tools/analytics.tools.js";
import { registerToolCallbacks } from "./helpers/tool-registry.js";

const TIME_RANGE = {
	time_of_generation_min: "2024-01-01T00:00:00Z",
	time_of_generation_max: "2024-02-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// get_cost_analytics — structured-alias query-param normalization
// ---------------------------------------------------------------------------

describe("get_cost_analytics", () => {
	it("normalizes structured aliases into the legacy comma-separated/JSON params", async () => {
		let capturedParams: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getCostAnalytics: async (params: unknown) => {
							capturedParams = params;
							return {
								object: "analytics-graph" as const,
								summary: { total: 500, avg: 2.5 },
								data_points: [
									{ timestamp: "2024-01-01T00:00:00Z", total: 100, avg: 2 },
								],
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_cost_analytics");
		assert.ok(cb, "get_cost_analytics should be registered");

		const result = (await cb({
			...TIME_RANGE,
			status_codes: ["400", "500"],
			virtual_key_slugs: ["vk1", "vk2"],
			config_slugs: ["c1", "c2"],
			api_key_ids: ["k1", "k2"],
			provider_models: ["openai__gpt-4", "anthropic__claude-3-opus"],
			trace_ids: ["t1", "t2"],
			span_ids: ["s1", "s2"],
			metadata_filter: { env: "prod", app: "myapp" },
		})) as { content: Array<{ text: string }> };

		assert.deepEqual(capturedParams, {
			...TIME_RANGE,
			status_code: "400,500",
			virtual_keys: "vk1,vk2",
			configs: "c1,c2",
			api_key_ids: "k1,k2",
			ai_org_model: "openai__gpt-4,anthropic__claude-3-opus",
			trace_id: "t1,t2",
			span_id: "s1,s2",
			metadata: JSON.stringify({ env: "prod", app: "myapp" }),
		});

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			summary?: Record<string, unknown>;
			point_count?: number;
			data_points?: Array<Record<string, unknown>>;
		};
		assert.deepEqual(payload.summary, {
			total_cost: 500,
			average_cost_per_request: 2.5,
		});
		assert.equal(payload.point_count, 1);
		assert.deepEqual(payload.data_points, [
			{ timestamp: "2024-01-01T00:00:00Z", total_cost: 100, average_cost: 2 },
		]);
	});

	it("prefers legacy comma-separated params when no structured alias is given", async () => {
		let capturedParams: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getCostAnalytics: async (params: unknown) => {
							capturedParams = params;
							return {
								object: "analytics-graph" as const,
								summary: { total: 0, avg: 0 },
								data_points: [],
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_cost_analytics");
		assert.ok(cb);
		await cb({ ...TIME_RANGE, status_code: "500", virtual_keys: "vk9" });

		assert.deepEqual(capturedParams, {
			...TIME_RANGE,
			status_code: "500",
			virtual_keys: "vk9",
		});
	});
});

// ---------------------------------------------------------------------------
// get_request_analytics — distinct response shape
// ---------------------------------------------------------------------------

describe("get_request_analytics", () => {
	it("passes through legacy params unmodified and curates total/success/failed", async () => {
		let capturedParams: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getRequestAnalytics: async (params: unknown) => {
							capturedParams = params;
							return {
								object: "analytics-graph" as const,
								summary: { total: 100, success: 90, failed: 10 },
								data_points: [
									{
										timestamp: "2024-01-01T00:00:00Z",
										total: 10,
										success: 9,
										failed: 1,
									},
								],
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_request_analytics");
		assert.ok(cb, "get_request_analytics should be registered");

		const result = (await cb({
			...TIME_RANGE,
			workspace_slug: "ws-1",
		})) as { content: Array<{ text: string }> };

		assert.deepEqual(capturedParams, { ...TIME_RANGE, workspace_slug: "ws-1" });

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			summary?: Record<string, unknown>;
			data_points?: Array<Record<string, unknown>>;
		};
		assert.deepEqual(payload.summary, {
			total_requests: 100,
			successful_requests: 90,
			failed_requests: 10,
		});
		assert.deepEqual(payload.data_points, [
			{ timestamp: "2024-01-01T00:00:00Z", total: 10, success: 9, failed: 1 },
		]);
	});
});

// ---------------------------------------------------------------------------
// get_users_analytics — distinct body (active/new user growth, not requests)
// ---------------------------------------------------------------------------

describe("get_users_analytics", () => {
	it("curates active/new user growth fields distinct from request/cost shapes", async () => {
		let capturedParams: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getUsersAnalytics: async (params: unknown) => {
							capturedParams = params;
							return {
								object: "analytics-graph" as const,
								summary: { total_active_users: 42, total_new_users: 7 },
								data_points: [
									{
										timestamp: "2024-01-01T00:00:00Z",
										active_users: 5,
										new_users: 1,
									},
								],
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_users_analytics");
		assert.ok(cb, "get_users_analytics should be registered");

		const result = (await cb(TIME_RANGE)) as {
			content: Array<{ text: string }>;
		};

		assert.deepEqual(capturedParams, TIME_RANGE);

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			summary?: Record<string, unknown>;
			data_points?: Array<Record<string, unknown>>;
		};
		assert.deepEqual(payload.summary, {
			total_active_users: 42,
			total_new_users: 7,
		});
		assert.deepEqual(payload.data_points, [
			{ timestamp: "2024-01-01T00:00:00Z", active_users: 5, new_users: 1 },
		]);
	});
});

// ---------------------------------------------------------------------------
// get_feedback_analytics — one representative table-driven generic graph tool
// ---------------------------------------------------------------------------

describe("get_feedback_analytics (table-driven generic graph tool)", () => {
	it("calls getFeedbackAnalytics with normalized params and wraps the raw shape unchanged", async () => {
		let capturedParams: unknown;
		const rawSummary = { total_feedback: 12 };
		const rawDataPoints = [{ timestamp: "2024-01-01T00:00:00Z", count: 3 }];
		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{
					analytics: {
						getFeedbackAnalytics: async (params: unknown) => {
							capturedParams = params;
							return {
								object: "analytics-graph" as const,
								summary: rawSummary,
								data_points: rawDataPoints,
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_feedback_analytics");
		assert.ok(cb, "get_feedback_analytics should be registered");

		const result = (await cb({
			...TIME_RANGE,
			status_codes: ["200"],
		})) as { content: Array<{ text: string }> };

		assert.deepEqual(capturedParams, { ...TIME_RANGE, status_code: "200" });

		// Generic graph tools wrap the raw summary/data_points verbatim (no
		// per-field remapping like get_cost_analytics/get_request_analytics do).
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			summary?: Record<string, unknown>;
			point_count?: number;
			data_points?: Array<Record<string, unknown>>;
		};
		assert.deepEqual(payload.summary, rawSummary);
		assert.equal(payload.point_count, 1);
		assert.deepEqual(payload.data_points, rawDataPoints);
	});
});

// ---------------------------------------------------------------------------
// Full GENERIC_GRAPH_ANALYTICS_TOOLS table walk — refactor regression guard
// ---------------------------------------------------------------------------

describe("generic graph analytics tools table", () => {
	const EXPECTED_TABLE: ReadonlyArray<{ toolName: string; method: string }> = [
		{
			toolName: "get_error_stacks_analytics",
			method: "getErrorStacksAnalytics",
		},
		{
			toolName: "get_error_status_codes_analytics",
			method: "getErrorStatusCodesAnalytics",
		},
		{
			toolName: "get_user_requests_analytics",
			method: "getUserRequestsAnalytics",
		},
		{
			toolName: "get_rescued_requests_analytics",
			method: "getRescuedRequestsAnalytics",
		},
		{ toolName: "get_feedback_analytics", method: "getFeedbackAnalytics" },
		{
			toolName: "get_feedback_models_analytics",
			method: "getFeedbackModelsAnalytics",
		},
		{
			toolName: "get_feedback_scores_analytics",
			method: "getFeedbackScoresAnalytics",
		},
		{
			toolName: "get_feedback_weighted_analytics",
			method: "getFeedbackWeightedAnalytics",
		},
	];

	it("registers exactly the expected 8 tools, each invoking only its declared service method", async () => {
		const calledMethods: string[] = [];
		const canned = {
			object: "analytics-graph" as const,
			summary: { ok: true },
			data_points: [{ ok: true }],
		};

		const analyticsStub: Record<string, (params: unknown) => Promise<unknown>> =
			{};
		for (const { method } of EXPECTED_TABLE) {
			analyticsStub[method] = async () => {
				calledMethods.push(method);
				return canned;
			};
		}

		const callbacks = registerToolCallbacks((server) => {
			registerAnalyticsTools(
				server as never,
				{ analytics: analyticsStub } as never,
			);
		});

		for (const { toolName, method } of EXPECTED_TABLE) {
			const cb = callbacks.get(toolName);
			assert.ok(cb, `expected ${toolName} to be registered`);

			calledMethods.length = 0;
			const result = (await cb(TIME_RANGE)) as {
				content: Array<{ text: string }>;
			};

			assert.deepEqual(
				calledMethods,
				[method],
				`${toolName} should call exactly ${method} on the analytics service`,
			);

			const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
				summary?: unknown;
				point_count?: number;
				data_points?: unknown;
			};
			assert.deepEqual(payload.summary, { ok: true });
			assert.equal(payload.point_count, 1);
			assert.deepEqual(payload.data_points, [{ ok: true }]);
		}
	});
});
