import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerAnalyticsTools } from "../src/tools/analytics.tools.js";
import { registerIntegrationsTools } from "../src/tools/integrations.tools.js";
import { registerLabelsTools } from "../src/tools/labels.tools.js";
import { registerLimitsTools } from "../src/tools/limits.tools.js";
import { registerLoggingTools } from "../src/tools/logging.tools.js";
import { registerMcpIntegrationsTools } from "../src/tools/mcp-integrations.tools.js";
import { registerMcpServersTools } from "../src/tools/mcp-servers.tools.js";
import { registerPartialsTools } from "../src/tools/partials.tools.js";
import { registerProvidersTools } from "../src/tools/providers.tools.js";
import { registerUsersTools } from "../src/tools/users.tools.js";
import { registerWorkspacesTools } from "../src/tools/workspaces.tools.js";
import {
	parseToolResult,
	registerToolCallbacks,
} from "./helpers/tool-registry.js";

type RegisterTools = (server: never, service: never) => void;

function callbacksFor(
	register: RegisterTools,
	domain: string,
	implementation: Record<string, unknown>,
) {
	return registerToolCallbacks((server) => {
		register(server as never, { [domain]: implementation } as never);
	});
}

const ANALYTICS_RANGE = {
	time_of_generation_min: "2026-01-01T00:00:00Z",
	time_of_generation_max: "2026-01-02T00:00:00Z",
};

describe("distinct analytics callbacks", () => {
	const graphCases = [
		{
			tool: "get_token_analytics",
			method: "getTokenAnalytics",
			response: {
				object: "analytics-graph",
				summary: { total: 120, prompt: 80, completion: 40 },
				data_points: [
					{
						timestamp: "2026-01-01T00:00:00Z",
						total: 12,
						prompt: 8,
						completion: 4,
					},
				],
			},
			expectedSummary: {
				total_tokens: 120,
				prompt_tokens: 80,
				completion_tokens: 40,
			},
			expectedPoint: {
				timestamp: "2026-01-01T00:00:00Z",
				total: 12,
				prompt: 8,
				completion: 4,
			},
		},
		{
			tool: "get_latency_analytics",
			method: "getLatencyAnalytics",
			response: {
				object: "analytics-graph",
				summary: { avg: 42, p50: 30, p90: 80, p99: 120 },
				data_points: [
					{
						timestamp: "2026-01-01T00:00:00Z",
						avg: 42,
						p50: 30,
						p90: 80,
						p99: 120,
					},
				],
			},
			expectedSummary: {
				avg_latency_ms: 42,
				p50_latency_ms: 30,
				p90_latency_ms: 80,
				p99_latency_ms: 120,
			},
			expectedPoint: {
				timestamp: "2026-01-01T00:00:00Z",
				avg: 42,
				p50: 30,
				p90: 80,
				p99: 120,
			},
		},
		{
			tool: "get_error_analytics",
			method: "getErrorAnalytics",
			response: {
				object: "analytics-graph",
				summary: { total: 7 },
				data_points: [{ timestamp: "2026-01-01T00:00:00Z", total: 3 }],
			},
			expectedSummary: { total_errors: 7 },
			expectedPoint: {
				timestamp: "2026-01-01T00:00:00Z",
				total_errors: 3,
			},
		},
		{
			tool: "get_error_rate_analytics",
			method: "getErrorRateAnalytics",
			response: {
				object: "analytics-graph",
				summary: { rate: 2.5 },
				data_points: [{ timestamp: "2026-01-01T00:00:00Z", rate: 1.5 }],
			},
			expectedSummary: { error_rate_percent: 2.5 },
			expectedPoint: {
				timestamp: "2026-01-01T00:00:00Z",
				error_rate_percent: 1.5,
			},
		},
		{
			tool: "get_cache_hit_latency",
			method: "getCacheHitLatency",
			response: {
				object: "analytics-graph",
				summary: { total: 100, avg: 10 },
				data_points: [{ timestamp: "2026-01-01T00:00:00Z", total: 20, avg: 5 }],
			},
			expectedSummary: { total_latency: 100, avg_latency: 10 },
			expectedPoint: {
				timestamp: "2026-01-01T00:00:00Z",
				total: 20,
				avg: 5,
			},
		},
		{
			tool: "get_cache_hit_rate",
			method: "getCacheHitRate",
			response: {
				object: "analytics-graph",
				summary: { rate: 90, total_hits: 900, total_misses: 100 },
				data_points: [
					{
						timestamp: "2026-01-01T00:00:00Z",
						rate: 80,
						hits: 80,
						misses: 20,
					},
				],
			},
			expectedSummary: { hit_rate: 90, total_hits: 900, total_misses: 100 },
			expectedPoint: {
				timestamp: "2026-01-01T00:00:00Z",
				rate: 80,
				hits: 80,
				misses: 20,
			},
		},
	] as const;

	for (const analyticsCase of graphCases) {
		it(`routes and formats ${analyticsCase.tool}`, async () => {
			let received: unknown;
			const callback = callbacksFor(registerAnalyticsTools, "analytics", {
				[analyticsCase.method]: async (params: unknown) => {
					received = params;
					return analyticsCase.response;
				},
			}).get(analyticsCase.tool);
			assert.ok(callback);

			const payload = parseToolResult(await callback(ANALYTICS_RANGE));
			assert.deepEqual(received, ANALYTICS_RANGE);
			assert.deepEqual(payload.summary, analyticsCase.expectedSummary);
			assert.equal(payload.point_count, 1);
			assert.deepEqual(
				(payload.data_points as Array<Record<string, unknown>>)[0],
				analyticsCase.expectedPoint,
			);
		});
	}

	it("routes user, model, and metadata group queries", async () => {
		const calls: unknown[] = [];
		const groupResponse = {
			total: 2,
			data: [{ name: "group-1", requests: 10, cost: 1.25 }],
		};
		const callbacks = callbacksFor(registerAnalyticsTools, "analytics", {
			getAnalyticsGroupUsers: async (params: unknown) => {
				calls.push(["users", params]);
				return groupResponse;
			},
			getAnalyticsGroupModels: async (params: unknown) => {
				calls.push(["models", params]);
				return groupResponse;
			},
			getAnalyticsGroupMetadata: async (key: string, params: unknown) => {
				calls.push(["metadata", key, params]);
				return groupResponse;
			},
		});
		const users = callbacks.get("get_analytics_group_users");
		const models = callbacks.get("get_analytics_group_models");
		const metadata = callbacks.get("get_analytics_group_metadata");
		assert.ok(users && models && metadata);

		const userPayload = parseToolResult(
			await users({ ...ANALYTICS_RANGE, current_page: 2, page_size: 10 }),
		);
		const modelPayload = parseToolResult(await models(ANALYTICS_RANGE));
		const metadataPayload = parseToolResult(
			await metadata({ ...ANALYTICS_RANGE, metadata_key: "environment" }),
		);

		assert.equal(userPayload.total_groups, 2);
		assert.equal(userPayload.group_count, 1);
		assert.deepEqual(userPayload.users, groupResponse.data);
		assert.deepEqual(modelPayload.models, groupResponse.data);
		assert.deepEqual(metadataPayload.metadata_groups, groupResponse.data);
		assert.deepEqual(calls, [
			["users", { ...ANALYTICS_RANGE, current_page: 2, page_size: 10 }],
			["models", ANALYTICS_RANGE],
			["metadata", "environment", ANALYTICS_RANGE],
		]);
	});
});

const USER = {
	id: "user-1",
	first_name: "Ada",
	last_name: "Lovelace",
	email: "ada@example.com",
	role: "admin",
	created_at: "2026-01-01T00:00:00.000Z",
	last_updated_at: "2026-01-02T00:00:00.000Z",
};

const INVITE = {
	id: "invite-1",
	email: "grace@example.com",
	role: "member",
	status: "pending",
	created_at: "2026-01-01T00:00:00.000Z",
	expires_at: "2026-01-08T00:00:00.000Z",
};

const MEMBER = {
	id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
	first_name: "Grace",
	last_name: "Hopper",
	org_role: "member",
	role: "manager",
	status: "active",
	created_at: "2026-01-01T00:00:00.000Z",
	last_updated_at: "2026-01-02T00:00:00.000Z",
};

const RATE_LIMIT = {
	id: "rate-1",
	name: "Production RPM",
	type: "requests",
	unit: "rpm",
	value: 100,
	target: "llm",
	status: "active",
	conditions: [{ key: "virtual_key", value: "vk-1" }],
	group_by: [{ key: "virtual_key" }],
	workspace_id: "workspace-1",
	organisation_id: "org-1",
	created_at: "2026-01-01T00:00:00.000Z",
	last_updated_at: "2026-01-02T00:00:00.000Z",
};

const USAGE_LIMIT = {
	id: "usage-1",
	name: "Monthly budget",
	type: "cost",
	credit_limit: 500,
	alert_threshold: 80,
	periodic_reset: "monthly",
	periodic_reset_days: null,
	next_usage_reset_at: null,
	last_reset_at: "2026-01-01T00:00:00.000Z",
	status: "active",
	conditions: [{ key: "metadata._user", value: "user-1" }],
	group_by: [{ key: "metadata._user" }],
	workspace_id: "workspace-1",
	organisation_id: "org-1",
	created_at: "2026-01-01T00:00:00.000Z",
	last_updated_at: "2026-01-02T00:00:00.000Z",
};

describe("label lifecycle callbacks", () => {
	it("gets, updates, and deletes a label through the service boundary", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerLabelsTools, "labels", {
			getLabel: async (id: string, params: unknown) => {
				calls.push(["get", id, params]);
				return {
					id,
					name: "Production",
					description: "Live traffic",
					color_code: "#FF5733",
					organisation_id: "org-1",
					workspace_id: "workspace-1",
					is_universal: false,
					status: "active",
					created_at: "2026-01-01T00:00:00.000Z",
					last_updated_at: "2026-01-02T00:00:00.000Z",
				};
			},
			updateLabel: async (id: string, params: unknown) => {
				calls.push(["update", id, params]);
			},
			deleteLabel: async (id: string) => {
				calls.push(["delete", id]);
			},
		});

		const get = callbacks.get("get_prompt_label");
		const update = callbacks.get("update_prompt_label");
		const remove = callbacks.get("delete_prompt_label");
		assert.ok(get && update && remove);

		const label = parseToolResult(
			await get({
				label_id: "label-1",
				organisation_id: "org-1",
				workspace_id: "workspace-1",
			}),
		);
		const updated = parseToolResult(
			await update({
				label_id: "label-1",
				name: "Production v2",
				description: "Updated",
				color_code: "#00FF00",
			}),
		);
		const deleted = parseToolResult(await remove({ label_id: "label-1" }));

		assert.equal(label.name, "Production");
		assert.equal(label.workspace_id, "workspace-1");
		assert.equal(updated.success, true);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			[
				"get",
				"label-1",
				{ organisation_id: "org-1", workspace_id: "workspace-1" },
			],
			[
				"update",
				"label-1",
				{
					name: "Production v2",
					description: "Updated",
					color_code: "#00FF00",
				},
			],
			["delete", "label-1"],
		]);
	});
});

describe("provider lifecycle callbacks", () => {
	it("lists providers with and without limits", async () => {
		let received: unknown;
		const callback = callbacksFor(registerProvidersTools, "providers", {
			listProviders: async (params: unknown) => {
				received = params;
				return {
					total: 2,
					data: [
						{
							name: "OpenAI",
							slug: "openai-prod",
							integration_id: "openai",
							status: "active",
							note: "primary",
							usage_limits: {
								credit_limit: 100,
								alert_threshold: 80,
								periodic_reset: "monthly",
							},
							rate_limits: [{ type: "requests", unit: "rpm", value: 60 }],
							reset_usage: false,
							expires_at: "2027-01-01T00:00:00.000Z",
							created_at: "2026-01-01T00:00:00.000Z",
						},
						{
							name: "Anthropic",
							slug: "anthropic-prod",
							integration_id: "anthropic",
							status: "active",
							usage_limits: undefined,
							rate_limits: undefined,
							reset_usage: false,
							created_at: "2026-01-01T00:00:00.000Z",
						},
					],
				};
			},
		}).get("list_providers");
		assert.ok(callback);

		const payload = parseToolResult(
			await callback({
				current_page: 2,
				page_size: 25,
				workspace_id: "workspace-1",
			}),
		);
		const providers = payload.providers as Array<Record<string, unknown>>;
		assert.deepEqual(received, {
			current_page: 2,
			page_size: 25,
			workspace_id: "workspace-1",
		});
		assert.equal(providers[0]?.slug, "openai-prod");
		assert.equal(providers[1]?.usage_limits, null);
		assert.equal(providers[1]?.rate_limits, null);
	});

	it("updates provider limits and deletes the selected workspace provider", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerProvidersTools, "providers", {
			updateProvider: async (
				slug: string,
				params: unknown,
				workspaceId: string,
			) => {
				calls.push(["update", slug, params, workspaceId]);
				return { id: "provider-1", slug };
			},
			deleteProvider: async (slug: string, workspaceId: string) => {
				calls.push(["delete", slug, workspaceId]);
			},
		});
		const update = callbacks.get("update_provider");
		const remove = callbacks.get("delete_provider");
		assert.ok(update && remove);

		const updated = parseToolResult(
			await update({
				slug: "openai-prod",
				workspace_id: "workspace-1",
				name: "OpenAI Production",
				note: "primary",
				credit_limit: 500,
				alert_threshold: 75,
				usage_limit_type: "cost",
				periodic_reset: "weekly",
				rate_limit_value: 100,
				rate_limit_unit: "rpm",
				expires_at: "2027-01-01T00:00:00.000Z",
				reset_usage: true,
			}),
		);
		const deleted = parseToolResult(
			await remove({ slug: "openai-prod", workspace_id: "workspace-1" }),
		);

		assert.equal(updated.id, "provider-1");
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			[
				"update",
				"openai-prod",
				{
					name: "OpenAI Production",
					note: "primary",
					usage_limits: {
						type: "cost",
						credit_limit: 500,
						alert_threshold: 75,
						periodic_reset: "weekly",
					},
					rate_limits: [{ type: "requests", unit: "rpm", value: 100 }],
					expires_at: "2027-01-01T00:00:00.000Z",
					reset_usage: true,
				},
				"workspace-1",
			],
			["delete", "openai-prod", "workspace-1"],
		]);
	});
});

describe("partial lifecycle callbacks", () => {
	it("updates, publishes, and deletes a prompt partial", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerPartialsTools, "partials", {
			updatePromptPartial: async (id: string, params: unknown) => {
				calls.push(["update", id, params]);
				return { prompt_partial_version_id: "partial-version-2" };
			},
			publishPartial: async (id: string, params: unknown) => {
				calls.push(["publish", id, params]);
			},
			deletePromptPartial: async (id: string) => {
				calls.push(["delete", id]);
			},
		});
		const update = callbacks.get("update_prompt_partial");
		const publish = callbacks.get("publish_partial");
		const remove = callbacks.get("delete_prompt_partial");
		assert.ok(update && publish && remove);

		const updated = parseToolResult(
			await update({
				prompt_partial_id: "partial-1",
				name: "Header",
				string: "New header",
				description: "Second version",
				status: "active",
			}),
		);
		const published = parseToolResult(
			await publish({ prompt_partial_id: "partial-1", version: 2 }),
		);
		const deleted = parseToolResult(
			await remove({ prompt_partial_id: "partial-1" }),
		);

		assert.equal(updated.prompt_partial_version_id, "partial-version-2");
		assert.equal(published.published_version, 2);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			[
				"update",
				"partial-1",
				{
					name: "Header",
					string: "New header",
					description: "Second version",
					status: "active",
				},
			],
			["publish", "partial-1", { version: 2 }],
			["delete", "partial-1"],
		]);
	});
});

describe("user query and lifecycle callbacks", () => {
	it("returns grouped user analytics and pending invitations", async () => {
		const callbacks = callbacksFor(registerUsersTools, "users", {
			getUserGroupedData: async () => ({
				total: 1,
				data: [{ user: "ada@example.com", requests: "25", cost: "4.50" }],
			}),
			listUserInvites: async () => ({ total: 1, data: [INVITE] }),
		});
		const stats = callbacks.get("get_user_stats");
		const invites = callbacks.get("list_user_invites");
		assert.ok(stats && invites);

		const statsPayload = parseToolResult(
			await stats({
				time_of_generation_min: "2026-01-01T00:00:00.000Z",
				time_of_generation_max: "2026-02-01T00:00:00.000Z",
			}),
		);
		const invitesPayload = parseToolResult(
			await invites({ current_page: 1, page_size: 20 }),
		);

		assert.equal(statsPayload.total_users, 1);
		assert.deepEqual(statsPayload.users, [
			{ user: "ada@example.com", requests: "25", cost: "4.50" },
		]);
		assert.equal(invitesPayload.total, 1);
		assert.deepEqual(invitesPayload.invites, [INVITE]);
	});

	it("gets and permanently deletes an accepted user", async () => {
		const deleted: string[] = [];
		const callbacks = callbacksFor(registerUsersTools, "users", {
			getUser: async () => USER,
			deleteUser: async (id: string) => {
				deleted.push(id);
			},
		});
		const get = callbacks.get("get_user");
		const remove = callbacks.get("delete_user");
		assert.ok(get && remove);

		const user = parseToolResult(await get({ user_id: "user-1" }));
		const result = parseToolResult(await remove({ user_id: "user-1" }));
		assert.deepEqual(user, {
			id: "user-1",
			name: "Ada Lovelace",
			email: "ada@example.com",
			role: "admin",
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
		});
		assert.deepEqual(deleted, ["user-1"]);
		assert.equal(result.success, true);
	});
});

describe("workspace mutation callbacks", () => {
	it("builds defaults for workspace updates and omits them when untouched", async () => {
		const calls: unknown[] = [];
		const callback = callbacksFor(registerWorkspacesTools, "workspaces", {
			updateWorkspace: async (id: string, params: unknown) => {
				calls.push([id, params]);
				return { success: true };
			},
		}).get("update_workspace");
		assert.ok(callback);

		await callback({
			workspace_id: "workspace-1",
			name: "Production v2",
			slug: "production-v2",
			description: "Updated",
			is_default: 0,
			metadata: { env: "prod-v2" },
			input_guardrails: ["guardrail-in"],
			output_guardrails: ["guardrail-out"],
			user_api_key_config: "pc-default",
			usage_limits: [],
			rate_limits: [],
		});
		await callback({ workspace_id: "workspace-1", name: "Production" });

		assert.deepEqual(calls, [
			[
				"workspace-1",
				{
					name: "Production v2",
					slug: "production-v2",
					description: "Updated",
					defaults: {
						is_default: 0,
						metadata: { env: "prod-v2" },
						input_guardrails: ["guardrail-in"],
						output_guardrails: ["guardrail-out"],
						user_api_key_config: "pc-default",
					},
					usage_limits: [],
					rate_limits: [],
				},
			],
			["workspace-1", { name: "Production" }],
		]);
	});

	it("gets and removes a workspace member, then deletes the workspace", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerWorkspacesTools, "workspaces", {
			getWorkspaceMember: async (workspaceId: string, userId: string) => {
				calls.push(["get-member", workspaceId, userId]);
				return MEMBER;
			},
			removeWorkspaceMember: async (workspaceId: string, userId: string) => {
				calls.push(["remove-member", workspaceId, userId]);
			},
			deleteWorkspace: async (workspaceId: string) => {
				calls.push(["delete-workspace", workspaceId]);
			},
		});
		const get = callbacks.get("get_workspace_member");
		const removeMember = callbacks.get("remove_workspace_member");
		const removeWorkspace = callbacks.get("delete_workspace");
		assert.ok(get && removeMember && removeWorkspace);

		const member = parseToolResult(
			await get({ workspace_id: "workspace-1", user_id: MEMBER.id }),
		);
		const removed = parseToolResult(
			await removeMember({ workspace_id: "workspace-1", user_id: MEMBER.id }),
		);
		const deleted = parseToolResult(
			await removeWorkspace({ workspace_id: "workspace-1" }),
		);

		assert.equal(member.name, "Grace Hopper");
		assert.equal(member.workspace_role, "manager");
		assert.equal(removed.success, true);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			["get-member", "workspace-1", MEMBER.id],
			["remove-member", "workspace-1", MEMBER.id],
			["delete-workspace", "workspace-1"],
		]);
	});
});

describe("log export lifecycle callbacks", () => {
	it("gets, starts, and cancels an export job", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerLoggingTools, "logging", {
			getLogExport: async (id: string) => {
				calls.push(["get", id]);
				return {
					id,
					status: "pending",
					description: "January logs",
					filters: { time_of_generation_min: "2026-01-01" },
					requested_data: ["id", "cost"],
					organisation_id: "org-1",
					workspace_id: "workspace-1",
					created_at: "2026-01-01T00:00:00.000Z",
					last_updated_at: "2026-01-02T00:00:00.000Z",
					created_by: "user-1",
				};
			},
			startLogExport: async (id: string) => {
				calls.push(["start", id]);
				return { message: "queued" };
			},
			cancelLogExport: async (id: string) => {
				calls.push(["cancel", id]);
				return { message: "cancelled" };
			},
		});
		const get = callbacks.get("get_log_export");
		const start = callbacks.get("start_log_export");
		const cancel = callbacks.get("cancel_log_export");
		assert.ok(get && start && cancel);

		const job = parseToolResult(await get({ export_id: "export-1" }));
		const started = parseToolResult(await start({ export_id: "export-1" }));
		const cancelled = parseToolResult(await cancel({ export_id: "export-1" }));
		assert.equal(job.status, "pending");
		assert.equal(started.status, "started");
		assert.equal(cancelled.status, "cancelled");
		assert.deepEqual(calls, [
			["get", "export-1"],
			["start", "export-1"],
			["cancel", "export-1"],
		]);
	});

	it("builds full and empty log export updates from optional fields", async () => {
		const calls: unknown[] = [];
		const callback = callbacksFor(registerLoggingTools, "logging", {
			updateLogExport: async (id: string, params: unknown) => {
				calls.push([id, params]);
				return { id, total: 1, object: "log-export" };
			},
		}).get("update_log_export");
		assert.ok(callback);

		const full = parseToolResult(
			await callback({
				export_id: "export-1",
				workspace_id: "workspace-1",
				time_of_generation_max: "2026-02-01",
				requested_fields: ["id", "cost"],
			}),
		);
		await callback({ export_id: "export-2" });

		assert.equal(full.id, "export-1");
		assert.deepEqual(calls, [
			[
				"export-1",
				{
					workspace_id: "workspace-1",
					filters: { time_of_generation_max: "2026-02-01" },
					requested_data: ["id", "cost"],
				},
			],
			["export-2", {}],
		]);
	});
});

describe("rate and usage limit lifecycle callbacks", () => {
	it("lists, updates, and deletes rate limits", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerLimitsTools, "limits", {
			listRateLimits: async (params: unknown) => {
				calls.push(["list", params]);
				return { total: 1, data: [RATE_LIMIT] };
			},
			updateRateLimit: async (id: string, params: unknown) => {
				calls.push(["update", id, params]);
				return {};
			},
			deleteRateLimit: async (id: string) => {
				calls.push(["delete", id]);
			},
		});
		const list = callbacks.get("list_rate_limits");
		const update = callbacks.get("update_rate_limit");
		const remove = callbacks.get("delete_rate_limit");
		assert.ok(list && update && remove);

		const listed = parseToolResult(
			await list({
				workspace_id: "workspace-1",
				status: "active",
				target: "llm",
				current_page: 0,
			}),
		);
		const updated = parseToolResult(
			await update({ id: "rate-1", name: "Updated", unit: "rph", value: 200 }),
		);
		const deleted = parseToolResult(await remove({ id: "rate-1" }));
		assert.equal(listed.total, 1);
		assert.equal(updated.success, true);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			[
				"list",
				{
					workspace_id: "workspace-1",
					status: "active",
					target: "llm",
					current_page: 0,
				},
			],
			["update", "rate-1", { name: "Updated", unit: "rph", value: 200 }],
			["delete", "rate-1"],
		]);
	});

	it("gets, updates, and deletes a usage limit", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerLimitsTools, "limits", {
			getUsageLimit: async (id: string) => {
				calls.push(["get", id]);
				return USAGE_LIMIT;
			},
			updateUsageLimit: async (id: string, params: unknown) => {
				calls.push(["update", id, params]);
				return {};
			},
			deleteUsageLimit: async (id: string) => {
				calls.push(["delete", id]);
			},
		});
		const get = callbacks.get("get_usage_limit");
		const update = callbacks.get("update_usage_limit");
		const remove = callbacks.get("delete_usage_limit");
		assert.ok(get && update && remove);

		const usage = parseToolResult(await get({ id: "usage-1" }));
		const updated = parseToolResult(
			await update({
				id: "usage-1",
				name: "Updated budget",
				credit_limit: 750,
				alert_threshold: 90,
				periodic_reset: "weekly",
				reset_usage_for_value: "user-1",
			}),
		);
		const deleted = parseToolResult(await remove({ id: "usage-1" }));
		assert.equal(usage.credit_limit, 500);
		assert.equal(updated.success, true);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			["get", "usage-1"],
			[
				"update",
				"usage-1",
				{
					name: "Updated budget",
					credit_limit: 750,
					alert_threshold: 90,
					periodic_reset: "weekly",
					reset_usage_for_value: "user-1",
				},
			],
			["delete", "usage-1"],
		]);
	});

	it("lists tracked entities and resets only the selected entity", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerLimitsTools, "limits", {
			listUsageLimitEntities: async (limitId: string, params: unknown) => {
				calls.push(["list", limitId, params]);
				return {
					total: 1,
					data: [
						{
							id: "entity-1",
							value_key: "metadata._user:user-1",
							current_usage: 42,
						},
					],
				};
			},
			resetUsageLimitEntity: async (limitId: string, entityId: string) => {
				calls.push(["reset", limitId, entityId]);
			},
		});
		const list = callbacks.get("list_usage_limit_entities");
		const reset = callbacks.get("reset_usage_limit_entity");
		assert.ok(list && reset);

		const listed = parseToolResult(
			await list({
				limit_id: "usage-1",
				status: "exhausted",
				search: "user-1",
				page_size: 100,
				current_page: 0,
			}),
		);
		const result = parseToolResult(
			await reset({ limit_id: "usage-1", entity_id: "user-1" }),
		);
		assert.equal(listed.total, 1);
		assert.equal(result.success, true);
		assert.deepEqual(calls, [
			[
				"list",
				"usage-1",
				{
					status: "exhausted",
					search: "user-1",
					page_size: 100,
					current_page: 0,
				},
			],
			["reset", "usage-1", "user-1"],
		]);
	});
});

describe("MCP integration access callbacks", () => {
	it("deletes an integration and manages capability exposure", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(
			registerMcpIntegrationsTools,
			"mcpIntegrations",
			{
				deleteMcpIntegration: async (id: string) => {
					calls.push(["delete", id]);
				},
				listMcpIntegrationCapabilities: async (id: string) => {
					calls.push(["list-capabilities", id]);
					return {
						total: 1,
						data: [{ name: "search", type: "tool", enabled: true }],
					};
				},
				updateMcpIntegrationCapabilities: async (
					id: string,
					params: unknown,
				) => {
					calls.push(["update-capabilities", id, params]);
				},
			},
		);
		const remove = callbacks.get("delete_mcp_integration");
		const list = callbacks.get("list_mcp_integration_capabilities");
		const update = callbacks.get("update_mcp_integration_capabilities");
		assert.ok(remove && list && update);

		const listed = parseToolResult(await list({ id: "integration-1" }));
		const changes = [{ name: "search", type: "tool", enabled: false }];
		const updated = parseToolResult(
			await update({ id: "integration-1", capabilities: changes }),
		);
		const deleted = parseToolResult(await remove({ id: "integration-1" }));
		assert.equal(listed.total, 1);
		assert.equal(updated.success, true);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			["list-capabilities", "integration-1"],
			["update-capabilities", "integration-1", { capabilities: changes }],
			["delete", "integration-1"],
		]);
	});

	it("lists and updates workspace access", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(
			registerMcpIntegrationsTools,
			"mcpIntegrations",
			{
				listMcpIntegrationWorkspaces: async (id: string) => {
					calls.push(["list", id]);
					return {
						global_workspace_access: false,
						workspaces: [
							{
								id: "workspace-1",
								enabled: true,
								status: "active",
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-02T00:00:00.000Z",
							},
						],
					};
				},
				updateMcpIntegrationWorkspaces: async (id: string, params: unknown) => {
					calls.push(["update", id, params]);
				},
			},
		);
		const list = callbacks.get("list_mcp_integration_workspaces");
		const update = callbacks.get("update_mcp_integration_workspaces");
		assert.ok(list && update);

		const listed = parseToolResult(await list({ id: "integration-1" }));
		const workspaces = [{ id: "workspace-1", enabled: false }];
		const updated = parseToolResult(
			await update({ id: "integration-1", workspaces }),
		);
		assert.equal(listed.workspace_count, 1);
		assert.equal(updated.success, true);
		assert.deepEqual(calls, [
			["list", "integration-1"],
			["update", "integration-1", { workspaces }],
		]);
	});
});

describe("MCP server lifecycle callbacks", () => {
	it("lists, updates, tests, and deletes server records", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerMcpServersTools, "mcpServers", {
			listMcpServers: async (params: unknown) => {
				calls.push(["list", params]);
				return {
					total: 1,
					data: [
						{
							id: "server-1",
							name: "Support MCP",
							slug: "support-mcp",
							description: "Support tools",
							mcp_integration_id: "integration-1",
							status: "active",
							created_at: "2026-01-01T00:00:00.000Z",
						},
					],
				};
			},
			updateMcpServer: async (id: string, params: unknown) => {
				calls.push(["update", id, params]);
			},
			testMcpServer: async (id: string) => {
				calls.push(["test", id]);
				return {
					success: true,
					server_name: "Support MCP",
					url: "https://mcp.example.com",
					status_code: 200,
					response_time_ms: 42,
				};
			},
			deleteMcpServer: async (id: string) => {
				calls.push(["delete", id]);
			},
		});
		const list = callbacks.get("list_mcp_servers");
		const update = callbacks.get("update_mcp_server");
		const test = callbacks.get("test_mcp_server");
		const remove = callbacks.get("delete_mcp_server");
		assert.ok(list && update && test && remove);

		const listed = parseToolResult(
			await list({
				current_page: 1,
				page_size: 20,
				workspace_id: "workspace-1",
			}),
		);
		const updated = parseToolResult(
			await update({
				id: "server-1",
				name: "Support MCP v2",
				description: "Updated",
			}),
		);
		const tested = parseToolResult(await test({ id: "server-1" }));
		const deleted = parseToolResult(await remove({ id: "server-1" }));
		assert.equal(listed.total, 1);
		assert.equal(updated.success, true);
		assert.equal(tested.response_time_ms, 42);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			["list", { current_page: 1, page_size: 20, workspace_id: "workspace-1" }],
			[
				"update",
				"server-1",
				{ name: "Support MCP v2", description: "Updated" },
			],
			["test", "server-1"],
			["delete", "server-1"],
		]);
	});

	it("updates server capability and per-user access overrides", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerMcpServersTools, "mcpServers", {
			updateMcpServerCapabilities: async (id: string, params: unknown) => {
				calls.push(["capabilities", id, params]);
			},
			updateMcpServerUserAccess: async (id: string, params: unknown) => {
				calls.push(["users", id, params]);
			},
		});
		const updateCapabilities = callbacks.get("update_mcp_server_capabilities");
		const updateUsers = callbacks.get("update_mcp_server_user_access");
		assert.ok(updateCapabilities && updateUsers);

		const capabilities = [{ name: "search", type: "tool", enabled: false }];
		const users = [{ user_id: "user-1", enabled: true }];
		const capsResult = parseToolResult(
			await updateCapabilities({ id: "server-1", capabilities }),
		);
		const usersResult = parseToolResult(
			await updateUsers({ id: "server-1", users }),
		);
		assert.equal(capsResult.success, true);
		assert.equal(usersResult.success, true);
		assert.deepEqual(calls, [
			["capabilities", "server-1", { capabilities }],
			["users", "server-1", { user_access: users }],
		]);
	});
});

describe("integration model and workspace query callbacks", () => {
	it("deletes an integration and lists or deletes its custom models", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksFor(registerIntegrationsTools, "integrations", {
			deleteIntegration: async (slug: string) => {
				calls.push(["delete-integration", slug]);
				return { success: true };
			},
			listIntegrationModels: async (slug: string, params: unknown) => {
				calls.push(["list-models", slug, params]);
				return {
					total: 1,
					data: [
						{
							id: "model-1",
							model_id: "custom-model",
							model_name: "Custom Model",
							enabled: true,
							custom: true,
							is_finetune: false,
							base_model_slug: "gpt-4.1",
							configurations: { host: "https://models.example.com" },
							pricing_config: { prompt: 0.01 },
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
						},
					],
				};
			},
			deleteIntegrationModel: async (slug: string, modelSlug: string) => {
				calls.push(["delete-model", slug, modelSlug]);
				return { success: true };
			},
		});
		const removeIntegration = callbacks.get("delete_integration");
		const listModels = callbacks.get("list_integration_models");
		const removeModel = callbacks.get("delete_integration_model");
		assert.ok(removeIntegration && listModels && removeModel);

		const models = parseToolResult(
			await listModels({ slug: "openai", current_page: 1, page_size: 20 }),
		);
		const model = (models.models as Array<Record<string, unknown>>)[0];
		const deletedModel = parseToolResult(
			await removeModel({ slug: "openai", model_slug: "custom-model" }),
		);
		const deletedIntegration = parseToolResult(
			await removeIntegration({ slug: "openai" }),
		);
		assert.equal(model?.slug, "custom-model");
		assert.equal(model?.name, "Custom Model");
		assert.equal(model?.is_custom, true);
		assert.equal(deletedModel.success, true);
		assert.equal(deletedIntegration.success, true);
		assert.deepEqual(calls, [
			["list-models", "openai", { current_page: 1, page_size: 20 }],
			["delete-model", "openai", "custom-model"],
			["delete-integration", "openai"],
		]);
	});

	it("lists integration workspace access and limits", async () => {
		let received: unknown;
		const callback = callbacksFor(registerIntegrationsTools, "integrations", {
			listIntegrationWorkspaces: async (slug: string, params: unknown) => {
				received = { slug, params };
				return {
					total: 1,
					data: [
						{
							id: "workspace-1",
							workspace_name: "Production",
							enabled: true,
							usage_limits: [{ credit_limit: 500 }],
							rate_limits: [{ unit: "rpm", value: 100 }],
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
						},
					],
				};
			},
		}).get("list_integration_workspaces");
		assert.ok(callback);

		const payload = parseToolResult(
			await callback({ slug: "openai", current_page: 2, page_size: 25 }),
		);
		assert.deepEqual(received, {
			slug: "openai",
			params: { current_page: 2, page_size: 25 },
		});
		assert.equal(payload.total, 1);
		assert.deepEqual(payload.workspaces, [
			{
				id: "workspace-1",
				workspace_id: "workspace-1",
				workspace_name: "Production",
				enabled: true,
				usage_limits: [{ credit_limit: 500 }],
				rate_limits: [{ unit: "rpm", value: 100 }],
				created_at: "2026-01-01T00:00:00.000Z",
				last_updated_at: "2026-01-02T00:00:00.000Z",
			},
		]);
	});
});
