import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AnalyticsService } from "../src/services/analytics.service.js";
import {
	BaseService,
	isPrivateOrLocalHost,
	validateUrl,
} from "../src/services/base.service.js";
import { CollectionsService } from "../src/services/collections.service.js";
import { ConfigsService } from "../src/services/configs.service.js";
import { DeploymentsService } from "../src/services/deployments.service.js";
import { GuardrailsService } from "../src/services/guardrails.service.js";
import { HealthService } from "../src/services/health.service.js";
import { IntegrationsService } from "../src/services/integrations.service.js";
import { KeysService } from "../src/services/keys.service.js";
import { LabelsService } from "../src/services/labels.service.js";
import { LimitsService } from "../src/services/limits.service.js";
import { LoggingService } from "../src/services/logging.service.js";
import { McpIntegrationsService } from "../src/services/mcp-integrations.service.js";
import { McpServersService } from "../src/services/mcp-servers.service.js";
import { PartialsService } from "../src/services/partials.service.js";
import { PromptsService } from "../src/services/prompts.service.js";
import { ProvidersService } from "../src/services/providers.service.js";
import { SecretReferencesService } from "../src/services/secret-references.service.js";
import { TracingService } from "../src/services/tracing.service.js";
import { UsersService } from "../src/services/users.service.js";
import { WorkspacesService } from "../src/services/workspaces.service.js";

const BASE_URL = "https://api.example.com/v1";

interface QueuedResponse {
	body?: unknown;
	error?: unknown;
	status: number;
}

interface CapturedFetch {
	input: RequestInfo | URL;
	init?: RequestInit;
}

let capturedFetches: CapturedFetch[] = [];
let queuedResponses: QueuedResponse[] = [];
let originalFetch: typeof globalThis.fetch;

class TestBaseClient extends BaseService {
	request(path: string): Promise<unknown> {
		return this.get(path);
	}
}

function enqueue(body: unknown = {}, status = 200): void {
	queuedResponses.push({ body, status });
}

function enqueueError(error: unknown): void {
	queuedResponses.push({ error, status: 0 });
}

function capturedUrl(index: number): URL {
	return new URL(String(capturedFetches[index]?.input));
}

function capturedBody(index: number): unknown {
	const body = capturedFetches[index]?.init?.body;
	return body === undefined ? undefined : JSON.parse(String(body));
}

beforeEach(() => {
	originalFetch = globalThis.fetch;
	capturedFetches = [];
	queuedResponses = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		capturedFetches.push({ input, init });
		const queued = queuedResponses.shift() ?? { body: {}, status: 200 };
		if (queued.error !== undefined) {
			throw queued.error;
		}
		if (queued.status === 204) {
			return new Response(null, { status: 204 });
		}
		return Response.json(queued.body, { status: queued.status });
	}) as typeof globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("AnalyticsService request routing", () => {
	it("routes every graph endpoint with the complete filter set", async () => {
		const service = new AnalyticsService("test-key", BASE_URL);
		const params = {
			time_of_generation_min: "2026-08-01T00:00:00Z",
			time_of_generation_max: "2026-08-02T00:00:00Z",
			total_units_min: 0,
			total_units_max: 10,
			cost_min: 0,
			cost_max: 5,
			prompt_token_min: 1,
			prompt_token_max: 20,
			completion_token_min: 2,
			completion_token_max: 30,
			status_code: "200",
			weighted_feedback_min: -1,
			weighted_feedback_max: 1,
			virtual_keys: "vk-1",
			configs: "cfg-1",
			workspace_slug: "workspace",
			api_key_ids: "key-1",
			metadata: "team:platform",
			ai_org_model: "openai/gpt-5",
			trace_id: "trace-1",
			span_id: "span-1",
			prompt_slug: "support-agent",
		};

		await service.getCostAnalytics(params);
		await service.getRequestAnalytics(params);
		await service.getTokenAnalytics(params);
		await service.getLatencyAnalytics(params);
		await service.getErrorAnalytics(params);
		await service.getErrorRateAnalytics(params);
		await service.getCacheHitLatency(params);
		await service.getCacheHitRate(params);
		await service.getUsersAnalytics(params);
		await service.getErrorStacksAnalytics(params);
		await service.getErrorStatusCodesAnalytics(params);
		await service.getUserRequestsAnalytics(params);
		await service.getRescuedRequestsAnalytics(params);
		await service.getFeedbackAnalytics(params);
		await service.getFeedbackModelsAnalytics(params);
		await service.getFeedbackScoresAnalytics(params);
		await service.getFeedbackWeightedAnalytics(params);

		assert.deepEqual(
			capturedFetches.map((_, index) => capturedUrl(index).pathname),
			[
				"/v1/analytics/graphs/cost",
				"/v1/analytics/graphs/requests",
				"/v1/analytics/graphs/tokens",
				"/v1/analytics/graphs/latency",
				"/v1/analytics/graphs/errors",
				"/v1/analytics/graphs/errors/rate",
				"/v1/analytics/graphs/cache/latency",
				"/v1/analytics/graphs/cache/hit-rate",
				"/v1/analytics/graphs/users",
				"/v1/analytics/graphs/errors/stacks",
				"/v1/analytics/graphs/errors/status-codes",
				"/v1/analytics/graphs/users/requests",
				"/v1/analytics/graphs/requests/rescued",
				"/v1/analytics/graphs/feedbacks",
				"/v1/analytics/graphs/feedbacks/ai-models",
				"/v1/analytics/graphs/feedbacks/scores",
				"/v1/analytics/graphs/feedbacks/weighted",
			],
		);
		assert.equal(capturedUrl(0).searchParams.get("total_units_min"), "0");
		assert.equal(
			capturedUrl(0).searchParams.get("prompt_slug"),
			"support-agent",
		);
		const headers = capturedFetches[0]?.init?.headers as Record<string, string>;
		assert.equal(headers["x-portkey-api-key"], "test-key");
	});

	it("routes paginated groups and rejects an empty metadata key", async () => {
		const service = new AnalyticsService("test-key", BASE_URL);
		const params = {
			time_of_generation_min: "2026-08-01T00:00:00Z",
			time_of_generation_max: "2026-08-02T00:00:00Z",
			current_page: 2,
			page_size: 25,
		};

		await service.getAnalyticsGroupUsers(params);
		await service.getAnalyticsGroupModels(params);
		await service.getAnalyticsGroupMetadata("team/name", params);

		assert.deepEqual(
			capturedFetches.map((_, index) => capturedUrl(index).pathname),
			[
				"/v1/analytics/groups/users",
				"/v1/analytics/groups/ai-models",
				"/v1/analytics/groups/metadata/team%2Fname",
			],
		);
		assert.equal(capturedUrl(2).searchParams.get("current_page"), "2");
		assert.equal(capturedUrl(2).searchParams.get("page_size"), "25");
		await assert.rejects(
			service.getAnalyticsGroupMetadata("  ", params),
			/metadataKey is required/,
		);
		assert.equal(capturedFetches.length, 3);
	});

	it("routes cache summary and provider grouped analytics with current options", async () => {
		const service = new AnalyticsService("test-key", BASE_URL);
		const base = {
			workspace_slug: "workspace",
			time_of_generation_min: "2026-08-01T00:00:00Z",
			time_of_generation_max: "2026-08-02T00:00:00Z",
		};

		await service.getCacheSummary({ ...base, trace_id: "trace-1" });
		await service.getAnalyticsGroupProviders({
			...base,
			current_page: 0,
			page_size: 0,
			order_by: "requests",
			order_by_type: "desc",
			columns: "requests,cost,p95_latency",
			include_total: "false",
		});

		assert.equal(capturedUrl(0).pathname, "/v1/analytics/summary/cache");
		assert.equal(capturedUrl(0).searchParams.get("trace_id"), "trace-1");
		assert.equal(capturedUrl(1).pathname, "/v1/analytics/groups/provider");
		assert.equal(capturedUrl(1).searchParams.get("current_page"), "0");
		assert.equal(capturedUrl(1).searchParams.get("page_size"), "0");
		assert.equal(
			capturedUrl(1).searchParams.get("columns"),
			"requests,cost,p95_latency",
		);
		assert.equal(capturedUrl(1).searchParams.get("include_total"), "false");
	});
});

describe("DeploymentsService request routing", () => {
	it("uses current deployment filters, request bodies, encoded ids, and archival delete", async () => {
		const service = new DeploymentsService("test-key", BASE_URL);

		enqueue({ object: "list", total: 0, data: [] });
		await service.listDeployments({
			organisation_id: "org-1",
			status: "active",
			type: "production",
			workspace_slug: ["primary", "secondary"],
			search: "edge",
		});
		enqueue({ id: "dep-1", client_auth: "one-time-secret" });
		await service.registerDeployment({
			name: "Edge",
			type: "production",
			auth_settings: { gateway_base_url: "https://edge.example.com" },
		});
		enqueue({ id: "dep-1" });
		await service.getDeployment("dep/one", "org-1");
		enqueue({ client_auth: "rotated-secret" });
		await service.updateDeployment("dep/one", { rotate_auth: true });
		enqueue({});
		await service.archiveDeployment("dep/one");

		const listUrl = capturedUrl(0);
		assert.equal(listUrl.pathname, "/v1/deployments");
		assert.deepEqual(listUrl.searchParams.getAll("workspace_slug"), [
			"primary",
			"secondary",
		]);
		assert.equal(listUrl.searchParams.get("organisation_id"), "org-1");
		assert.equal(listUrl.searchParams.get("status"), "active");
		assert.equal(listUrl.searchParams.get("type"), "production");
		assert.equal(listUrl.searchParams.get("search"), "edge");
		assert.deepEqual(capturedBody(1), {
			name: "Edge",
			type: "production",
			auth_settings: { gateway_base_url: "https://edge.example.com" },
		});
		assert.equal(capturedUrl(2).pathname, "/v1/deployments/dep%2Fone");
		assert.equal(capturedUrl(2).searchParams.get("organisation_id"), "org-1");
		assert.equal(capturedFetches[3]?.init?.method, "PUT");
		assert.deepEqual(capturedBody(3), { rotate_auth: true });
		assert.equal(capturedFetches[4]?.init?.method, "DELETE");
	});
});

describe("PromptsService workflows", () => {
	it("maps the direct prompt API and normalizes responses", async () => {
		const service = new PromptsService("test-key", BASE_URL);
		const rawPrompt = {
			id: "prompt-1",
			name: "Support dev",
			slug: "support-dev",
			collection_id: "collection-1",
			workspace_id: "workspace-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-02T00:00:00Z",
			prompt_version_id: "version-1",
			prompt_version: 3,
			prompt_version_description: "current",
			string: "Hello {{name}}",
			parameters: { name: "Ada" },
			model: "openai/gpt-5",
			virtual_key: "vk-1",
			template_metadata: { app: "support", env: "dev" },
		};

		enqueue({ id: "prompt-1", slug: "support-dev", version_id: "version-1" });
		await service.createPrompt({
			name: "Support dev",
			collection_id: "collection-1",
			string: "Hello {{name}}",
			parameters: { name: "Ada" },
			virtual_key: "vk-1",
		} as never);
		enqueue({ object: "list", total: 0, data: [] });
		await service.listPrompts({
			search: "support",
			current_page: 1,
			page_size: 10,
		});
		enqueue(rawPrompt);
		const prompt = await service.getPrompt("prompt/one");
		assert.equal(prompt.current_version?.version_number, 3);
		enqueue({
			id: "prompt-1",
			slug: "support-dev",
			prompt_version_id: "version-2",
		});
		await service.updatePrompt("prompt/one", {
			string: "Updated",
			template_metadata: { env: "prod" },
		});
		enqueue(undefined, 204);
		assert.deepEqual(await service.deletePrompt("prompt/one"), {});
		enqueue({ deleted: true });
		assert.deepEqual(await service.deletePrompt("prompt/two"), {
			deleted: true,
		});
		enqueue({ success: true });
		await service.publishPrompt("prompt/one", {
			version_id: "version-2",
		} as never);
		enqueue(rawPrompt);
		await service.getPromptVersion("prompt/one", "version/two");
		enqueue({});
		assert.deepEqual(
			await service.updatePromptVersion("prompt/one", "version/two", {
				label_id: "label-1",
			}),
			{ success: true },
		);
		enqueue({ object: "list", total: 1, data: [{ id: "version-1" }] });
		assert.deepEqual(await service.listPromptVersions("prompt/one"), [
			{ id: "version-1" },
		]);
		enqueue({ rendered_prompt: "Hello Ada" });
		await service.renderPrompt("prompt/one", {
			variables: { name: "Ada" },
			hyperparameters: { temperature: 0 },
		} as never);
		enqueue({ id: "completion-1" });
		await service.runPromptCompletion("prompt/one", {
			variables: { name: "Ada" },
			hyperparameters: { temperature: 0 },
			metadata: { client_id: "client", app: "support", env: "test" },
		} as never);

		assert.equal(capturedUrl(2).pathname, "/v1/prompts/prompt%2Fone");
		assert.deepEqual(capturedBody(3), {
			string: "Updated",
			patch: true,
			prompt_metadata: { env: "prod" },
		});
		assert.deepEqual(capturedBody(10), {
			temperature: 0,
			variables: { name: "Ada" },
		});
		assert.deepEqual(capturedBody(11), {
			temperature: 0,
			variables: { name: "Ada" },
			metadata: { client_id: "client", app: "support", env: "test" },
			stream: false,
		});
	});

	it("rejects prompt completions without valid billing metadata", async () => {
		const service = new PromptsService("test-key", BASE_URL);
		await assert.rejects(
			service.runPromptCompletion("prompt-1", {} as never),
			/Billing metadata is required/,
		);
		await assert.rejects(
			service.runPromptCompletion("prompt-1", {
				metadata: { client_id: "client" },
			} as never),
			/Billing metadata validation failed: Missing required field: app, Missing required field: env/,
		);
		assert.equal(capturedFetches.length, 0);
	});

	it("preserves raw-template semantics across prompt writes and reads", async () => {
		const service = new PromptsService("test-key", BASE_URL);
		enqueue({ id: "prompt-1", slug: "prompt-1", version_id: "version-1" });
		await service.createPrompt({
			name: "Structural",
			collection_id: "collection-1",
			string: '{"role":"{{role}}"}',
			parameters: {},
			virtual_key: "vk-1",
			is_raw_template: true,
		} as never);
		assert.equal(
			(capturedBody(0) as Record<string, unknown>).is_raw_template,
			1,
		);

		enqueue({
			id: "prompt-1",
			name: "Structural",
			slug: "structural",
			collection_id: "collection-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-01T00:00:00Z",
			prompt_version_id: "version-1",
			prompt_version: 1,
			string: '{"role":"{{role}}"}',
			parameters: {},
			is_raw_template: 1,
		});
		assert.equal(
			(await service.getPrompt("prompt-1")).current_version?.is_raw_template,
			true,
		);

		enqueue({
			id: "prompt-1",
			slug: "structural",
			prompt_version_id: "version-2",
		});
		await service.updatePrompt("prompt-1", { is_raw_template: false } as never);
		assert.equal(
			(capturedBody(2) as Record<string, unknown>).is_raw_template,
			0,
		);
	});

	it("handles dry-run, unchanged, update, and create migrations", async () => {
		const service = new PromptsService("test-key", BASE_URL);
		const migration = {
			name: "Support dev",
			collection_id: "collection-1",
			string: "Hello",
			parameters: { locale: "en" },
			virtual_key: "vk-1",
			app: "support",
			env: "dev",
		};
		const existing = {
			id: "prompt-1",
			name: "Support dev",
			slug: "support-dev",
		};
		const rawPrompt = {
			...existing,
			collection_id: "collection-1",
			workspace_id: "workspace-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-02T00:00:00Z",
			prompt_version_id: "version-1",
			prompt_version: 1,
			string: "Hello",
			parameters: { locale: "en" },
			virtual_key: "vk-1",
			template_metadata: { app: "support", env: "dev" },
		};

		enqueue({ object: "list", total: 0, data: [] });
		assert.equal(
			(await service.migratePrompt({ ...migration, dry_run: true } as never))
				.action,
			"created",
		);
		enqueue({ object: "list", total: 1, data: [existing] });
		enqueue(rawPrompt);
		assert.equal(
			(await service.migratePrompt(migration as never)).action,
			"unchanged",
		);
		enqueue({ object: "list", total: 1, data: [existing] });
		enqueue({ ...rawPrompt, string: "Old" });
		assert.equal(
			(await service.migratePrompt({ ...migration, dry_run: true } as never))
				.action,
			"updated",
		);
		enqueue({ object: "list", total: 1, data: [existing] });
		enqueue({ ...rawPrompt, string: "Old" });
		enqueue({
			id: "prompt-1",
			slug: "support-dev",
			prompt_version_id: "version-2",
		});
		const updated = await service.migratePrompt(migration as never);
		assert.deepEqual(
			{ action: updated.action, version_id: updated.version_id },
			{ action: "updated", version_id: "version-2" },
		);
		enqueue({ object: "list", total: 0, data: [] });
		enqueue({ id: "prompt-2", slug: "support-new", version_id: "version-1" });
		const created = await service.migratePrompt({
			...migration,
			name: "Support new",
		} as never);
		assert.deepEqual(
			{ action: created.action, prompt_id: created.prompt_id },
			{ action: "created", prompt_id: "prompt-2" },
		);
		const updateBody = capturedBody(7) as Record<string, unknown>;
		assert.equal(updateBody.patch, true);
		const promptMetadata = updateBody.prompt_metadata as Record<
			string,
			unknown
		>;
		assert.equal(promptMetadata.app, "support");
		assert.equal(promptMetadata.env, "dev");
		assert.match(
			String(promptMetadata.migrated_at),
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
		);

		enqueue({ object: "list", total: 1, data: [existing] });
		enqueue({ ...rawPrompt, prompt_version_id: undefined });
		await assert.rejects(
			service.migratePrompt(migration as never),
			/exists but has no active version/,
		);
	});

	it("pages exact-name prompt migration lookups", async () => {
		const service = new PromptsService("test-key", BASE_URL);
		const filler = Array.from({ length: 100 }, (_, index) => ({
			id: `other-${index}`,
			name: `Other ${index}`,
			slug: `other-${index}`,
		}));
		enqueue({ object: "list", total: 101, data: filler });
		enqueue({
			object: "list",
			total: 101,
			data: [{ id: "prompt-1", name: "Support dev", slug: "support-dev" }],
		});
		enqueue({
			id: "prompt-1",
			name: "Support dev",
			slug: "support-dev",
			collection_id: "collection-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-02T00:00:00Z",
			prompt_version_id: "version-1",
			prompt_version: 1,
			string: "Hello",
			parameters: {},
			virtual_key: "vk-1",
			template_metadata: { app: "support", env: "dev" },
		});
		const result = await service.migratePrompt({
			name: "Support dev",
			collection_id: "collection-1",
			string: "Hello",
			parameters: {},
			virtual_key: "vk-1",
			app: "support",
			env: "dev",
		} as never);
		assert.equal(result.action, "unchanged");
		assert.equal(capturedUrl(0).searchParams.get("page_size"), "100");
		assert.equal(capturedUrl(1).searchParams.get("current_page"), "2");
		assert.equal(
			capturedFetches.some((call) => call.init?.method === "POST"),
			false,
		);
	});

	it("promotes to existing and new target prompts and enforces a virtual key", async () => {
		const service = new PromptsService("test-key", BASE_URL);
		const source = {
			id: "source-1",
			name: "support-dev",
			slug: "support-dev",
			collection_id: "collection-1",
			workspace_id: "workspace-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-02T00:00:00Z",
			prompt_version_id: "source-version",
			prompt_version: 4,
			string: "Hello",
			parameters: {},
			virtual_key: "vk-source",
			template_metadata: { app: "support", env: "dev" },
		};
		const target = {
			id: "target-1",
			name: "support-prod",
			slug: "support-prod",
		};

		enqueue(source);
		enqueue({ object: "list", total: 1, data: [target] });
		enqueue({
			id: "target-1",
			slug: "support-prod",
			prompt_version_id: "target-v2",
		});
		const updated = await service.promotePrompt({
			source_prompt_id: "source-1",
			target_collection_id: "collection-2",
			target_env: "prod",
		} as never);
		assert.equal(updated.action, "updated");

		enqueue(source);
		enqueue({ object: "list", total: 0, data: [] });
		enqueue({
			id: "target-2",
			slug: "support-staging",
			version_id: "target-v1",
		});
		const created = await service.promotePrompt({
			source_prompt_id: "source-1",
			target_collection_id: "collection-2",
			target_env: "staging",
		} as never);
		assert.equal(created.action, "created");

		enqueue({ ...source, prompt_version_id: undefined });
		await assert.rejects(
			service.promotePrompt({ source_prompt_id: "source-1" } as never),
			/Source prompt has no active version/,
		);
		enqueue({ ...source, virtual_key: undefined });
		enqueue({ object: "list", total: 0, data: [] });
		await assert.rejects(
			service.promotePrompt({
				source_prompt_id: "source-1",
				target_collection_id: "collection-2",
				target_env: "prod",
			} as never),
			/source version has no virtual_key/,
		);
	});
});

describe("deep-review service regressions", () => {
	it("translates one workspace member into the current users-array contract", async () => {
		enqueue({});
		const service = new WorkspacesService("test-key", BASE_URL);

		const result = await service.addWorkspaceMember("workspace-1", {
			user_id: "00000000-0000-0000-0000-000000000001",
			role: "member",
		});

		assert.deepEqual(capturedBody(0), {
			users: [
				{
					id: "00000000-0000-0000-0000-000000000001",
					role: "member",
				},
			],
		});
		assert.deepEqual(result, {
			success: true,
			workspace_id: "workspace-1",
			user_id: "00000000-0000-0000-0000-000000000001",
			role: "member",
		});
	});

	it("updates a migrated prompt for every supplied execution field", async () => {
		const desired = {
			name: "Support dev",
			collection_id: "collection-1",
			string: "Hello",
			parameters: { locale: "en" },
			virtual_key: "vk-new",
			model: "openai/gpt-5",
			version_description: "Desired version",
			template_metadata: { source_file: "prompts/support.json" },
			functions: [{ name: "lookup", description: "Look up a customer" }],
			tools: [
				{
					type: "function" as const,
					function: { name: "lookup", description: "Look up a customer" },
				},
			],
			tool_choice: { type: "function" as const, function: { name: "lookup" } },
			app: "support",
			env: "dev",
		};
		const existing = {
			id: "prompt-1",
			name: desired.name,
			slug: "support-dev",
		};
		const current = {
			...existing,
			collection_id: desired.collection_id,
			workspace_id: "workspace-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-02T00:00:00Z",
			prompt_version_id: "version-1",
			prompt_version: 1,
			prompt_version_description: desired.version_description,
			string: desired.string,
			parameters: desired.parameters,
			virtual_key: desired.virtual_key,
			model: desired.model,
			functions: desired.functions,
			tools: desired.tools,
			tool_choice: desired.tool_choice,
			template_metadata: {
				...desired.template_metadata,
				app: desired.app,
				env: desired.env,
				migrated_at: "2026-08-01T00:00:00Z",
			},
		};
		const cases: Array<[string, Record<string, unknown>]> = [
			["virtual_key", { virtual_key: "vk-old" }],
			["version_description", { prompt_version_description: "Old version" }],
			["functions", { functions: [{ name: "old" }] }],
			["tools", { tools: [{ type: "function", function: { name: "old" } }] }],
			["tool_choice", { tool_choice: "auto" }],
			[
				"template_metadata",
				{
					template_metadata: {
						...current.template_metadata,
						source_file: "prompts/old.json",
					},
				},
			],
			[
				"app/env metadata",
				{
					template_metadata: {
						...current.template_metadata,
						app: "old-app",
						env: "old-env",
					},
				},
			],
		];

		for (const [field, difference] of cases) {
			const start = capturedFetches.length;
			enqueue({ object: "list", total: 1, data: [existing] });
			enqueue({ ...current, ...difference });
			enqueue({
				id: "prompt-1",
				slug: "support-dev",
				prompt_version_id: "version-2",
			});

			const result = await new PromptsService(
				"test-key",
				BASE_URL,
			).migratePrompt(desired);

			assert.equal(result.action, "updated", `${field} must trigger an update`);
			assert.equal(
				(capturedBody(start + 2) as Record<string, unknown>).virtual_key,
				"vk-new",
			);
		}
	});

	it("uses an explicit virtual key while promoting to an existing target", async () => {
		enqueue({
			id: "source-1",
			name: "support-dev",
			slug: "support-dev",
			collection_id: "collection-1",
			workspace_id: "workspace-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-02T00:00:00Z",
			prompt_version_id: "source-version",
			prompt_version: 4,
			string: "Hello",
			parameters: {},
			virtual_key: "vk-staging",
			template_metadata: { app: "support", env: "dev" },
		});
		enqueue({
			object: "list",
			total: 1,
			data: [{ id: "target-1", name: "support-prod", slug: "support-prod" }],
		});
		enqueue({
			id: "target-1",
			slug: "support-prod",
			prompt_version_id: "target-v2",
		});

		await new PromptsService("test-key", BASE_URL).promotePrompt({
			source_prompt_id: "source-1",
			target_collection_id: "collection-2",
			target_env: "prod",
			virtual_key: "vk-production",
		});

		assert.equal(
			(capturedBody(2) as Record<string, unknown>).virtual_key,
			"vk-production",
		);
	});

	it("falls back to the source virtual key for an empty promotion override", async () => {
		enqueue({
			id: "source-1",
			name: "support-dev",
			slug: "support-dev",
			collection_id: "collection-1",
			workspace_id: "workspace-1",
			created_at: "2026-08-01T00:00:00Z",
			last_updated_at: "2026-08-02T00:00:00Z",
			prompt_version_id: "source-version",
			prompt_version: 4,
			string: "Hello",
			parameters: {},
			virtual_key: "vk-staging",
			template_metadata: { app: "support", env: "dev" },
		});
		enqueue({
			object: "list",
			total: 1,
			data: [{ id: "target-1", name: "support-prod", slug: "support-prod" }],
		});
		enqueue({
			id: "target-1",
			slug: "support-prod",
			prompt_version_id: "target-v2",
		});

		await new PromptsService("test-key", BASE_URL).promotePrompt({
			source_prompt_id: "source-1",
			target_collection_id: "collection-2",
			target_env: "prod",
			virtual_key: "",
		});

		assert.equal(
			(capturedBody(2) as Record<string, unknown>).virtual_key,
			"vk-staging",
		);
	});
});

describe("UsersService request contracts", () => {
	it("routes user, invite, and grouped analytics operations", async () => {
		const service = new UsersService("test-key", BASE_URL);
		await service.listUsers({
			page_size: 25,
			current_page: 0,
			role: "owner",
			email: "ada@example.com",
		});
		await service.inviteUser({
			email: "ada@example.com",
			role: "member",
			workspaces: [{ id: "workspace-1", role: "member" }],
		});
		await service.getUserGroupedData({
			time_of_generation_min: "2026-08-01T00:00:00Z",
			time_of_generation_max: "2026-08-02T00:00:00Z",
			total_units_min: 0,
			current_page: 3,
			page_size: 10,
		});
		await service.getUser("user/one");
		await service.updateUser("user/one", { first_name: "Ada" });
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteUser("user/one"), { success: true });
		await service.listUserInvites({
			page_size: 10,
			current_page: 0,
			role: "member",
			email: "grace@example.com",
			status: "pending",
		});
		await service.getUserInvite("invite/one");
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteUserInvite("invite/one"), {
			success: true,
		});
		assert.deepEqual(await service.resendUserInvite("invite/one"), {
			success: true,
		});

		assert.deepEqual(
			capturedFetches.map((_, index) => capturedUrl(index).pathname),
			[
				"/v1/admin/users",
				"/v1/admin/users/invites",
				"/v1/analytics/groups/users",
				"/v1/admin/users/user%2Fone",
				"/v1/admin/users/user%2Fone",
				"/v1/admin/users/user%2Fone",
				"/v1/admin/users/invites",
				"/v1/admin/users/invites/invite%2Fone",
				"/v1/admin/users/invites/invite%2Fone",
				"/v1/admin/users/invites/invite%2Fone/resend",
			],
		);
		assert.equal(capturedUrl(2).searchParams.get("total_units_min"), "0");
		assert.equal(capturedUrl(0).searchParams.get("pageSize"), "25");
		assert.equal(capturedUrl(0).searchParams.get("currentPage"), "0");
		assert.equal(capturedUrl(0).searchParams.has("page_size"), false);
		assert.equal(capturedUrl(0).searchParams.get("role"), "owner");
		assert.equal(capturedUrl(0).searchParams.get("email"), "ada@example.com");
		assert.equal(capturedUrl(6).searchParams.get("pageSize"), "10");
		assert.equal(capturedUrl(6).searchParams.get("currentPage"), "0");
		assert.equal(capturedUrl(6).searchParams.get("role"), "member");
		assert.equal(capturedUrl(6).searchParams.get("status"), "pending");
		assert.deepEqual(capturedBody(4), { first_name: "Ada" });
	});
});

describe("LimitsService validation and routing", () => {
	it("routes rate and usage limit lifecycles", async () => {
		const service = new LimitsService("test-key", BASE_URL);
		const condition = { key: "model", value: ["gpt-5", "gpt-5-mini"] };
		await service.listRateLimits({
			workspace_id: "workspace-1",
			status: "active",
			type: "requests",
			unit: "rpw",
			target: "mcp_tools",
			page_size: 25,
			current_page: 0,
		});
		await service.getRateLimit("rate/one", "archived");
		await service.createRateLimit({
			conditions: [condition],
			group_by: [{ key: "mcp_tool" }],
			type: "requests",
			unit: "rpw",
			value: 10,
			target: "mcp_tools",
		});
		await service.updateRateLimit("rate/one", {
			value: 20,
			conditions: [{ key: "mcp_server", value: "server-1" }],
		});
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteRateLimit("rate/one"), {
			success: true,
		});
		await service.listUsageLimits({
			workspace_id: "workspace-1",
			status: "active",
			type: "cost",
			page_size: 25,
			current_page: 0,
		});
		await service.getUsageLimit("usage/one", {
			status: "active",
			include_usage: true,
		});
		await service.createUsageLimit({
			conditions: [condition],
			group_by: [{ key: "model" }],
			type: "cost",
			credit_limit: 100,
		});
		await service.updateUsageLimit("usage/one", { credit_limit: 200 });
		enqueue({});
		assert.deepEqual(await service.deleteUsageLimit("usage/one"), {
			success: true,
		});
		await service.listUsageLimitEntities("usage/one", {
			status: "exhausted",
			search: "metadata._user:ada",
			page_size: 100,
			current_page: 0,
		});
		await service.resetUsageLimitEntity("usage/one", "entity-1");

		assert.equal(
			capturedUrl(1).pathname,
			"/v1/policies/rate-limits/rate%2Fone",
		);
		assert.equal(
			capturedUrl(10).pathname,
			"/v1/policies/usage-limits/usage%2Fone/entities",
		);
		assert.equal(capturedUrl(0).searchParams.get("target"), "mcp_tools");
		assert.equal(capturedUrl(1).searchParams.get("status"), "archived");
		assert.equal(capturedUrl(6).searchParams.get("include_usage"), "true");
		assert.equal(capturedUrl(10).searchParams.get("status"), "exhausted");
		assert.equal(
			capturedUrl(11).pathname,
			"/v1/policies/usage-limits/usage%2Fone/entities/entity-1/reset",
		);
		assert.equal(capturedFetches[11]?.init?.method, "PUT");
		assert.equal(capturedBody(11), undefined);
	});

	it("rejects blank resource identifiers before issuing a request", async () => {
		const service = new LimitsService("test-key", BASE_URL);
		await assert.rejects(
			service.getRateLimit(" "),
			/Rate limit ID is required/,
		);
		await assert.rejects(
			service.updateRateLimit("", {}),
			/Rate limit ID is required/,
		);
		await assert.rejects(
			service.deleteRateLimit(" "),
			/Rate limit ID is required/,
		);
		await assert.rejects(
			service.getUsageLimit(""),
			/Usage limit ID is required/,
		);
		await assert.rejects(
			service.updateUsageLimit(" ", {}),
			/Usage limit ID is required/,
		);
		await assert.rejects(
			service.deleteUsageLimit(""),
			/Usage limit ID is required/,
		);
		await assert.rejects(
			service.listUsageLimitEntities(" "),
			/Usage limit ID is required/,
		);
		await assert.rejects(
			service.resetUsageLimitEntity("", "entity-1"),
			/Usage limit ID is required/,
		);
		await assert.rejects(
			service.resetUsageLimitEntity("usage-1", " "),
			/Entity ID is required/,
		);
		assert.equal(capturedFetches.length, 0);
	});
});

describe("Catalog service request contracts", () => {
	it("routes collection CRUD and normalizes no-content deletion", async () => {
		const service = new CollectionsService("test-key", BASE_URL);
		await service.listCollections({ search: "support", page_size: 10 });
		await service.createCollection({
			name: "Support",
			workspace_id: "workspace-1",
		});
		await service.getCollection("collection/one");
		await service.updateCollection("collection/one", {
			description: "Production",
		});
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteCollection("collection/one"), {
			success: true,
		});
		assert.equal(capturedUrl(2).pathname, "/v1/collections/collection%2Fone");
		assert.deepEqual(capturedBody(3), { description: "Production" });
	});

	it("unwraps partial lists and remaps update descriptions", async () => {
		const service = new PartialsService("test-key", BASE_URL);
		await service.createPromptPartial({
			name: "Greeting",
			string: "Hello",
		} as never);
		enqueue({ object: "list", total: 1, data: [{ id: "partial-1" }] });
		assert.deepEqual(
			await service.listPromptPartials({ collection_id: "c-1" }),
			[{ id: "partial-1" }],
		);
		await service.getPromptPartial("partial/one");
		await service.updatePromptPartial("partial/one", {
			description: "Version two",
			string: "Hi",
		} as never);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deletePromptPartial("partial/one"), {});
		enqueue({ object: "list", total: 1, data: [{ id: "version-1" }] });
		assert.deepEqual(await service.listPartialVersions("partial/one"), [
			{ id: "version-1" },
		]);
		await service.publishPartial("partial/one", {
			version_id: "version-1",
		} as never);
		assert.deepEqual(capturedBody(3), {
			string: "Hi",
			version_description: "Version two",
		});
	});

	it("handles provider workspace scoping and deletion responses", async () => {
		const service = new ProvidersService("test-key", BASE_URL);
		await service.listProviders({ workspace_id: "workspace-1", page_size: 10 });
		await service.createProvider({ name: "OpenAI", integration_id: "int-1" });
		await service.getProvider("provider/one", "workspace-1");
		await service.updateProvider(
			"provider/one",
			{ note: "Primary" },
			"workspace/one",
		);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteProvider("provider/one"), {});
		enqueue({ deleted: true });
		assert.deepEqual(
			await service.deleteProvider("provider/one", "workspace/one"),
			{ deleted: true },
		);
		assert.equal(
			capturedUrl(2).searchParams.get("workspace_id"),
			"workspace-1",
		);
		assert.equal(
			capturedUrl(3).searchParams.get("workspace_id"),
			"workspace/one",
		);
	});
});

describe("KeysService request contracts", () => {
	it("routes virtual and API key lifecycles", async () => {
		const service = new KeysService("test-key", BASE_URL);
		await service.listVirtualKeys({ page_size: 25, current_page: 2 });
		await service.createVirtualKey({
			name: "Primary",
			provider: "azure-openai",
			deploymentConfig: [
				{
					apiVersion: "2024-10-01",
					deploymentName: "gpt-5",
					alias: "primary",
					is_default: true,
				},
			],
			expires_at: "2027-01-01T00:00:00Z",
			secret_mappings: [
				{ target_field: "key", secret_reference_id: "secret-1" },
			],
		});
		await service.getVirtualKey("virtual/key");
		await service.updateVirtualKey("virtual/key", {
			name: "Updated",
			deploymentConfig: [
				{ apiVersion: "2024-10-01", deploymentName: "gpt-5-mini" },
			],
			secret_mappings: [
				{ target_field: "key", secret_reference_id: "secret-2" },
			],
		});
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteVirtualKey("virtual/key"), {
			success: true,
		});
		await service.createApiKey("workspace", "service", {
			name: "Automation",
			workspace_id: "workspace-1",
			scopes: ["logs.read"],
			organisation_id: "org-1",
			rate_limits: [{ type: "tokens", unit: "rps", value: 5 }],
			defaults: { allow_config_override: false },
			rotation_policy: {
				rotation_period: "weekly",
				key_transition_period_ms: 1_800_000,
			},
		});
		await service.listApiKeys({ workspace_id: "workspace-1", page_size: 10 });
		await service.getApiKey("api/key");
		await service.updateApiKey("api/key", {
			name: "Renamed",
			reset_usage: 0,
			rate_limits: [{ type: "requests", unit: "rpw", value: 500 }],
			rotation_policy: null,
		});
		await service.rotateApiKey("api/key", {
			key_transition_period_ms: 1_800_000,
		});
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteApiKey("api/key"), { success: true });

		assert.equal(capturedUrl(2).pathname, "/v1/virtual-keys/virtual%2Fkey");
		assert.equal(capturedUrl(5).pathname, "/v1/api-keys/workspace/service");
		assert.equal(capturedUrl(9).pathname, "/v1/api-keys/api%2Fkey/rotate");
		assert.deepEqual(capturedBody(1), {
			name: "Primary",
			provider: "azure-openai",
			deploymentConfig: [
				{
					apiVersion: "2024-10-01",
					deploymentName: "gpt-5",
					alias: "primary",
					is_default: true,
				},
			],
			expires_at: "2027-01-01T00:00:00Z",
			secret_mappings: [
				{ target_field: "key", secret_reference_id: "secret-1" },
			],
		});
		assert.deepEqual(capturedBody(5), {
			name: "Automation",
			workspace_id: "workspace-1",
			scopes: ["logs.read"],
			organisation_id: "org-1",
			rate_limits: [{ type: "tokens", unit: "rps", value: 5 }],
			defaults: { allow_config_override: false },
			rotation_policy: {
				rotation_period: "weekly",
				key_transition_period_ms: 1_800_000,
			},
		});
		assert.deepEqual(capturedBody(8), {
			name: "Renamed",
			reset_usage: 0,
			rate_limits: [{ type: "requests", unit: "rpw", value: 500 }],
			rotation_policy: null,
		});
	});
});

describe("HealthService cache behavior", () => {
	it("caches a successful health check for the TTL window", async () => {
		const service = new HealthService("test-key", BASE_URL);
		enqueue({ object: "list", data: [] });
		const first = await service.ping();
		const second = await service.ping();

		assert.equal(first.status, "ok");
		assert.equal(first.cached, undefined);
		assert.equal(second.status, "ok");
		assert.equal(second.cached, true);
		assert.equal(capturedFetches.length, 1);
	});

	it("briefly caches upstream failures before retrying", async () => {
		const originalNow = Date.now;
		let now = 1_000;
		Date.now = () => now;
		const service = new HealthService("test-key", BASE_URL);
		try {
			enqueueError(new Error("network unavailable"));
			await assert.rejects(
				service.ping(),
				/Health check failed: network unavailable/,
			);
			enqueue({ object: "list", data: [] });
			await assert.rejects(
				service.ping(),
				/Health check failed: network unavailable/,
			);
			assert.equal(capturedFetches.length, 1);

			now += 1_001;
			assert.equal((await service.ping()).status, "ok");
			assert.equal(capturedFetches.length, 2);
		} finally {
			Date.now = originalNow;
		}
	});

	it("coalesces concurrent cache misses into one upstream probe", async () => {
		const service = new HealthService("test-key", BASE_URL);
		enqueue({ object: "list", data: [] });

		const results = await Promise.all(
			Array.from({ length: 20 }, () => service.ping()),
		);

		assert.equal(
			results.every((result) => result.status === "ok"),
			true,
		);
		assert.equal(capturedFetches.length, 1);
	});
});

describe("BaseService URL and client safety", () => {
	it("classifies literal private, local, and public hosts", () => {
		for (const host of [
			"localhost",
			"api.localhost",
			"::1",
			"::",
			"fe80::1",
			"fe9f::1",
			"febf::1",
			"fc00::1",
			"fd00::1",
			"::ffff:192.168.1.1",
			"::ffff:c0a8:101",
			"::ffff:a9fe:a9fe",
			"::ffff:7f00:1",
			"0.1.2.3",
			"10.1.2.3",
			"127.0.0.2",
			"169.254.169.254",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"100.64.0.1",
			"100.127.255.255",
		]) {
			assert.equal(isPrivateOrLocalHost(host), true, host);
		}
		for (const host of [
			"api.portkey.ai",
			"gateway.internal",
			"2001:4860:4860::8888",
			"8.8.8.8",
			"172.32.0.1",
			"100.128.0.1",
		]) {
			assert.equal(isPrivateOrLocalHost(host), false, host);
		}
	});

	it("rejects malformed, non-HTTP, private, and insecure base URLs", () => {
		const originalPrivate = process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
		const originalInsecure = process.env.PORTKEY_ALLOW_INSECURE_HTTP;
		delete process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
		delete process.env.PORTKEY_ALLOW_INSECURE_HTTP;
		try {
			assert.throws(() => validateUrl("not a URL"), /Invalid base URL/);
			assert.throws(
				() => validateUrl("ftp://api.example.com"),
				/Invalid URL protocol/,
			);
			assert.throws(
				() => validateUrl("https://127.0.0.1"),
				/loopback or private-network/,
			);
			assert.throws(
				() => validateUrl("http://api.example.com"),
				/Refusing insecure HTTP/,
			);
			process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL = "yes";
			process.env.PORTKEY_ALLOW_INSECURE_HTTP = "true";
			assert.doesNotThrow(() => validateUrl("http://127.0.0.1:8787"));
		} finally {
			if (originalPrivate === undefined) {
				delete process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
			} else {
				process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL = originalPrivate;
			}
			if (originalInsecure === undefined) {
				delete process.env.PORTKEY_ALLOW_INSECURE_HTTP;
			} else {
				process.env.PORTKEY_ALLOW_INSECURE_HTTP = originalInsecure;
			}
		}
	});

	it("does not treat a no-content read as successful JSON", async () => {
		const service = new TestBaseClient("test-key", BASE_URL);
		enqueue(undefined, 204);
		await assert.rejects(
			service.request("/configs"),
			/Unexpected end of JSON input/,
		);
	});
});

describe("Configuration and platform service contracts", () => {
	it("normalizes config responses across the full lifecycle", async () => {
		const service = new ConfigsService("test-key", BASE_URL);
		await service.listConfigs({ page_size: 10, current_page: 2 });
		enqueue({
			id: "config-1",
			slug: "config-one",
			config: '{"strategy":{"mode":"fallback"}}',
		});
		assert.deepEqual((await service.getConfig("config/one")).config, {
			strategy: { mode: "fallback" },
		});
		enqueue({ data: { id: "config-2", version_id: "version-1" } });
		assert.deepEqual(
			await service.createConfig({ name: "Config two", config: {} } as never),
			{ id: "config-2", version_id: "version-1" },
		);
		enqueue({ success: true, data: { version_id: "version-2" } });
		assert.deepEqual(
			await service.updateConfig("config/one", { name: "Renamed" } as never),
			{ success: true, version_id: "version-2" },
		);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteConfig("config/one"), {
			success: true,
		});
		enqueue({ success: false });
		assert.deepEqual(await service.deleteConfig("config/two"), {
			success: false,
		});
		enqueue({
			object: "list",
			total: 1,
			data: [
				{
					version_id: "version-2",
					config: '{"strategy":{"mode":"fallback"}}',
					created_at: "2026-08-01T00:00:00Z",
					updated_by: "user-1",
				},
			],
		});
		assert.deepEqual((await service.listConfigVersions("config/one")).data, [
			{
				version_id: "version-2",
				config: { strategy: { mode: "fallback" } },
				created_at: "2026-08-01T00:00:00Z",
				updated_by: "user-1",
			},
		]);
		assert.equal(capturedUrl(1).pathname, "/v1/configs/config%2Fone");
		assert.equal(capturedUrl(6).pathname, "/v1/configs/config%2Fone/versions");
	});

	it("routes organisation defaults, exclusions, and guardrail CRUD", async () => {
		const service = new GuardrailsService("test-key", BASE_URL);
		await service.getOrganisationDefaults();
		await service.updateOrganisationDefaults({
			input_guardrails: ["guardrail-1"],
		});
		await service.listWorkspaceExclusions("input", {
			organisation_id: "org-1",
		});
		await service.updateWorkspaceExclusions("output", {
			organisation_id: "org-1",
			workspaces: [],
		});
		await service.listGuardrails({
			workspace_id: "workspace-1",
			page_size: 10,
		});
		await service.getGuardrail("guardrail/one");
		await service.createGuardrail({ name: "PII" } as never);
		await service.updateGuardrail("guardrail/one", { name: "PII v2" } as never);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteGuardrail("guardrail/one"), {
			success: true,
		});
		assert.deepEqual(
			capturedFetches.map((captured, index) => [
				captured.init?.method ?? "GET",
				capturedUrl(index).pathname,
			]),
			[
				["GET", "/v1/admin/organisation/defaults"],
				["PUT", "/v1/admin/organisation/defaults"],
				["GET", "/v1/workspace-exclusions/input-guardrails"],
				["PUT", "/v1/workspace-exclusions/output-guardrails"],
				["GET", "/v1/guardrails"],
				["GET", "/v1/guardrails/guardrail%2Fone"],
				["POST", "/v1/guardrails"],
				["PUT", "/v1/guardrails/guardrail%2Fone"],
				["DELETE", "/v1/guardrails/guardrail%2Fone"],
			],
		);
	});

	it("routes labels and maps a no-content deletion", async () => {
		const service = new LabelsService("test-key", BASE_URL);
		await service.createLabel({ name: "Production" } as never);
		await service.listLabels({ search: "prod", page_size: 10 });
		await service.getLabel("label/one", { workspace_id: "workspace-1" });
		await service.updateLabel("label/one", { name: "Prod" } as never);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteLabel("label/one"), {});
		assert.equal(capturedUrl(2).pathname, "/v1/labels/label%2Fone");
	});
});

describe("Integration service contracts", () => {
	it("routes integrations and normalizes alternate model and workspace lists", async () => {
		const service = new IntegrationsService("test-key", BASE_URL);
		await service.listIntegrations({
			workspace_id: "workspace-1",
			page_size: 10,
		});
		await service.createIntegration({
			name: "OpenAI",
			provider: "openai",
		} as never);
		await service.getIntegration("integration/one");
		assert.deepEqual(
			await service.updateIntegration("integration/one", {
				name: "OpenAI 2",
			} as never),
			{ success: true },
		);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteIntegration("integration/one"), {
			success: true,
		});
		enqueue({ models: [{ id: "model-1" }] });
		assert.deepEqual(await service.listIntegrationModels("integration/one"), {
			object: "list",
			total: 1,
			data: [{ id: "model-1" }],
		});
		assert.deepEqual(
			await service.updateIntegrationModels("integration/one", {
				models: ["gpt-5"],
			} as never),
			{ success: true },
		);
		assert.deepEqual(
			await service.deleteIntegrationModel("integration/one", "model/one"),
			{ success: true },
		);
		enqueue({ object: "workspace-list", total: 4, data: [] });
		assert.deepEqual(
			await service.listIntegrationWorkspaces("integration/one"),
			{
				object: "workspace-list",
				total: 4,
				data: [],
			},
		);
		assert.deepEqual(
			await service.updateIntegrationWorkspaces("integration/one", {
				workspace_ids: ["workspace-1"],
			} as never),
			{ success: true },
		);
		assert.equal(capturedUrl(7).searchParams.get("slugs"), "model/one");
	});

	it("passes integration model deletion as an encoded query parameter", async () => {
		const service = new IntegrationsService("test-key", BASE_URL);
		enqueue(undefined, 204);
		await service.deleteIntegrationModel("integration/one", "model & secret");
		assert.equal(
			capturedUrl(0).pathname,
			"/v1/integrations/integration%2Fone/models",
		);
		assert.equal(capturedUrl(0).searchParams.get("slugs"), "model & secret");
	});
});

describe("MCP administration service contracts", () => {
	it("routes MCP integration lifecycle and access configuration", async () => {
		const service = new McpIntegrationsService("test-key", BASE_URL);
		await service.listMcpIntegrations({
			workspace_id: "workspace-1",
			page_size: 10,
			current_page: 0,
			organisation_id: "org-1",
			type: "all",
			search: "github",
		});
		await service.createMcpIntegration({ name: "GitHub" } as never);
		await service.getMcpIntegration("integration/one");
		assert.deepEqual(
			await service.updateMcpIntegration("integration/one", {
				name: "GitHub 2",
			} as never),
			{ success: true },
		);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteMcpIntegration("integration/one"), {
			success: true,
		});
		await service.getMcpIntegrationMetadata("integration/one");
		await service.listMcpIntegrationCapabilities("integration/one");
		assert.deepEqual(
			await service.updateMcpIntegrationCapabilities("integration/one", {
				capability_ids: ["tools"],
			} as never),
			{ success: true },
		);
		await service.listMcpIntegrationWorkspaces("integration/one");
		assert.deepEqual(
			await service.updateMcpIntegrationWorkspaces("integration/one", {
				workspace_ids: ["workspace-1"],
			} as never),
			{ success: true },
		);
		assert.equal(
			capturedUrl(9).pathname,
			"/v1/mcp-integrations/integration%2Fone/workspaces",
		);
		assert.equal(capturedUrl(0).searchParams.get("organisation_id"), "org-1");
		assert.equal(capturedUrl(0).searchParams.get("type"), "all");
		assert.equal(capturedUrl(0).searchParams.get("search"), "github");
	});

	it("routes MCP server lifecycle, connections, capabilities, and access", async () => {
		const service = new McpServersService("test-key", BASE_URL);
		await service.listMcpServerConnections("server/one", { page_size: 10 });
		assert.deepEqual(
			await service.disconnectMcpServerConnection("server/one", {
				user_id: "user-1",
			}),
			{ success: true },
		);
		await service.listMcpServers({
			workspace_id: "workspace-1",
			page_size: 10,
		});
		await service.createMcpServer({ name: "GitHub" } as never);
		await service.getMcpServer("server/one");
		assert.deepEqual(
			await service.updateMcpServer("server/one", {
				name: "GitHub 2",
			} as never),
			{ success: true },
		);
		enqueue(undefined, 204);
		assert.deepEqual(await service.deleteMcpServer("server/one"), {
			success: true,
		});
		await service.testMcpServer("server/one");
		await service.listMcpServerCapabilities("server/one", {
			current_page: 2,
			page_size: 25,
		});
		assert.deepEqual(
			await service.updateMcpServerCapabilities("server/one", {
				capability_ids: ["tools"],
			} as never),
			{ success: true },
		);
		await service.listMcpServerUserAccess("server/one", {
			current_page: 1,
			page_size: 10,
		});
		assert.deepEqual(
			await service.updateMcpServerUserAccess("server/one", {
				user_ids: ["user-1"],
			} as never),
			{ success: true },
		);
		assert.equal(
			capturedUrl(0).pathname,
			"/v1/mcp-servers/server%2Fone/connections",
		);
		assert.equal(capturedUrl(8).searchParams.get("current_page"), "2");
	});
});

describe("Observability and workspace service contracts", () => {
	it("routes log ingestion and export lifecycle operations", async () => {
		const service = new LoggingService("test-key", BASE_URL);
		await service.getLog("log/one", { path_format: "v2" });
		await service.getLogExportFieldRestrictions({
			workspace_id: "workspace-1",
		});
		await service.insertLog({ request: { method: "POST" } } as never);
		await service.createLogExport({ workspace_id: "workspace-1" } as never);
		await service.listLogExports({ workspace_id: "workspace-1" } as never);
		await service.getLogExport("export/one");
		await service.startLogExport("export/one");
		await service.cancelLogExport("export/one");
		await service.downloadLogExport("export/one");
		await service.updateLogExport("export/one", { name: "August" } as never);
		assert.equal(capturedUrl(0).pathname, "/v1/logs/log%2Fone");
		assert.equal(capturedUrl(9).pathname, "/v1/logs/exports/export%2Fone");
	});

	it("routes SCIM, workspace, and membership lifecycles", async () => {
		const service = new WorkspacesService("test-key", BASE_URL);
		await service.listScimWorkspaceMappings({ page_size: 10 });
		await service.createScimWorkspaceMapping({
			scim_group_id: "group-1",
			workspace_id: "workspace-1",
		} as never);
		assert.deepEqual(await service.deleteScimWorkspaceMapping("mapping/one"), {
			success: true,
		});
		await service.listScimGroups({ page_size: 10 });
		await service.listWorkspaces({
			page_size: 10,
			current_page: 0,
			name: "Platform",
			exact_name: "Platform Production",
			status: "active",
		});
		await service.getWorkspace("workspace/one");
		await service.createWorkspace({
			name: "Platform",
			users: ["user-1"],
			usage_limits: [
				{ type: "cost", credit_limit: 100, periodic_reset: "monthly" },
			],
			rate_limits: [{ type: "requests", unit: "rpm", value: 50 }],
		});
		await service.updateWorkspace("workspace/one", {
			name: "Platform 2",
			defaults: {
				input_guardrails: ["guardrail-in"],
				output_guardrails: ["guardrail-out"],
				user_api_key_config: "pc-default",
			},
			usage_limits: [],
			rate_limits: [],
		});
		assert.deepEqual(await service.deleteWorkspace("workspace/one"), {
			success: true,
		});
		await service.addWorkspaceMember("workspace/one", {
			user_id: "user-1",
			role: "member",
		});
		await service.listWorkspaceMembers("workspace/one", {
			current_page: 0,
			page_size: 50,
			role: "manager",
			email: "ada@example.com",
		});
		await service.getWorkspaceMember("workspace/one", "user/one");
		await service.updateWorkspaceMember("workspace/one", "user/one", {
			role: "admin",
		});
		assert.deepEqual(
			await service.removeWorkspaceMember("workspace/one", "user/one"),
			{ success: true },
		);
		assert.equal(
			capturedUrl(5).pathname,
			"/v1/admin/workspaces/workspace%2Fone",
		);
		assert.equal(
			capturedUrl(11).pathname,
			"/v1/admin/workspaces/workspace%2Fone/users/user%2Fone",
		);
		assert.equal(
			capturedUrl(4).searchParams.get("exact_name"),
			"Platform Production",
		);
		assert.equal(capturedUrl(4).searchParams.get("status"), "active");
		assert.equal(capturedUrl(10).searchParams.get("role"), "manager");
		assert.deepEqual(capturedBody(6), {
			name: "Platform",
			users: ["user-1"],
			usage_limits: [
				{ type: "cost", credit_limit: 100, periodic_reset: "monthly" },
			],
			rate_limits: [{ type: "requests", unit: "rpm", value: 50 }],
		});
	});

	it("routes secret references and trace feedback", async () => {
		const secrets = new SecretReferencesService("test-key", BASE_URL);
		await secrets.createSecretReference({
			name: "OpenAI",
			secret: "value",
		} as never);
		await secrets.listSecretReferences({ search: "openai", page_size: 10 });
		await secrets.getSecretReference("secret/one");
		await secrets.updateSecretReference("secret/one", {
			name: "OpenAI 2",
		} as never);
		assert.deepEqual(await secrets.deleteSecretReference("secret/one"), {
			success: true,
		});

		const tracing = new TracingService("test-key", BASE_URL);
		await tracing.createFeedback({ trace_id: "trace-1", value: 1 });
		await tracing.updateFeedback("feedback/one", { value: -1 });
		assert.equal(capturedUrl(2).pathname, "/v1/secret-references/secret%2Fone");
		assert.equal(capturedUrl(6).pathname, "/v1/feedback/feedback%2Fone");
	});
});
