import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerAllTools, type ToolDomain } from "../src/tools/index.js";
import {
	parseToolResult,
	registerToolCallbacks,
} from "./helpers/tool-registry.js";

function callbacksForDomain(
	domain: ToolDomain,
	service: Record<string, unknown>,
) {
	return registerToolCallbacks((server) => {
		registerAllTools(server as never, service as never, { domains: [domain] });
	});
}

function parseEnvelope(result: unknown): Record<string, unknown> {
	const envelope = parseToolResult(result) as {
		ok?: boolean;
		data?: Record<string, unknown>;
	};
	assert.equal(envelope.ok, true);
	assert.ok(envelope.data);
	return envelope.data;
}

const GUARDRAIL = {
	id: "guardrail-1",
	name: "PII filter",
	slug: "pii-filter",
	status: "active",
	workspace_id: "workspace-1",
	organisation_id: "organisation-1",
	created_at: "2026-01-01T00:00:00.000Z",
	last_updated_at: "2026-01-02T00:00:00.000Z",
	owner_id: "user-1",
	updated_by: "user-2",
};

describe("guardrail lifecycle through the safe tool server", () => {
	it("reads organisation defaults and both exclusion directions", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksForDomain("guardrails", {
			guardrails: {
				getOrganisationDefaults: async () => ({
					input_guardrails: [{ id: "guardrail-1", slug: "pii-filter" }],
					output_guardrails: [],
				}),
				listWorkspaceExclusions: async (direction: string, params: unknown) => {
					calls.push(["list", direction, params]);
					return {
						organisation_id: "organisation-1",
						workspaces: [{ workspace_id: "workspace-1", excluded: true }],
					};
				},
			},
		});
		const getDefaults = callbacks.get("get_organisation_defaults");
		const listInput = callbacks.get(
			"list_input_guardrail_workspace_exclusions",
		);
		const listOutput = callbacks.get(
			"list_output_guardrail_workspace_exclusions",
		);
		assert.ok(getDefaults && listInput && listOutput);

		const defaults = parseEnvelope(await getDefaults({}));
		const input = parseEnvelope(
			await listInput({ organisation_id: "organisation-1" }),
		);
		const output = parseEnvelope(
			await listOutput({ organisation_id: "organisation-1" }),
		);

		assert.deepEqual(defaults.input_guardrails, [
			{ id: "guardrail-1", slug: "pii-filter" },
		]);
		assert.deepEqual(input.workspaces, [
			{ workspace_id: "workspace-1", excluded: true },
		]);
		assert.deepEqual(output.workspaces, input.workspaces);
		assert.deepEqual(calls, [
			["list", "input", { organisation_id: "organisation-1" }],
			["list", "output", { organisation_id: "organisation-1" }],
		]);
	});

	it("updates organisation defaults and both exclusion directions", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksForDomain("guardrails", {
			guardrails: {
				updateOrganisationDefaults: async (params: unknown) => {
					calls.push(["defaults", params]);
					return {
						input_guardrails: [{ id: "guardrail-1", slug: "pii-filter" }],
						output_guardrails: [{ id: "guardrail-2", slug: "toxicity" }],
					};
				},
				updateWorkspaceExclusions: async (
					direction: string,
					params: unknown,
				) => {
					calls.push(["exclusions", direction, params]);
					return {
						organisation_id: "organisation-1",
						workspaces: [{ workspace_id: "workspace-1", excluded: false }],
					};
				},
			},
		});
		const updateDefaults = callbacks.get("update_organisation_defaults");
		const updateInput = callbacks.get(
			"update_input_guardrail_workspace_exclusions",
		);
		const updateOutput = callbacks.get(
			"update_output_guardrail_workspace_exclusions",
		);
		assert.ok(updateDefaults && updateInput && updateOutput);

		const defaultUpdate = {
			input_guardrails: ["pii-filter"],
			output_guardrails: ["toxicity"],
		};
		const exclusionUpdate = {
			organisation_id: "organisation-1",
			workspaces: [{ workspace_id: "workspace-1", excluded: false }],
			override_existing: true,
		};
		const defaults = parseEnvelope(await updateDefaults(defaultUpdate));
		const input = parseEnvelope(await updateInput(exclusionUpdate));
		const output = parseEnvelope(await updateOutput(exclusionUpdate));

		assert.equal(
			(defaults.output_guardrails as Array<Record<string, unknown>>)[0]?.slug,
			"toxicity",
		);
		assert.equal(
			(input.workspaces as Array<Record<string, unknown>>)[0]?.excluded,
			false,
		);
		assert.deepEqual(output.workspaces, input.workspaces);
		assert.deepEqual(calls, [
			["defaults", defaultUpdate],
			["exclusions", "input", exclusionUpdate],
			["exclusions", "output", exclusionUpdate],
		]);
	});

	it("lists and gets curated guardrail records", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksForDomain("guardrails", {
			guardrails: {
				listGuardrails: async (params: unknown) => {
					calls.push(["list", params]);
					return { total: 1, data: [{ ...GUARDRAIL, internal: "hidden" }] };
				},
				getGuardrail: async (id: string) => {
					calls.push(["get", id]);
					return {
						...GUARDRAIL,
						checks: [
							{
								id: "default.pii",
								name: "PII",
								is_enabled: true,
								parameters: { categories: ["email"] },
							},
						],
						actions: { deny: true, message: "PII detected" },
						internal: "hidden",
					};
				},
			},
		});
		const list = callbacks.get("list_guardrails");
		const get = callbacks.get("get_guardrail");
		assert.ok(list && get);

		const listParams = {
			workspace_id: "workspace-1",
			organisation_id: "organisation-1",
			current_page: 2,
			page_size: 20,
		};
		const listed = parseEnvelope(await list(listParams));
		const detail = parseEnvelope(await get({ guardrail_id: "pii-filter" }));

		assert.equal(listed.total, 1);
		assert.equal(
			(listed.guardrails as Array<Record<string, unknown>>)[0]?.internal,
			undefined,
		);
		assert.deepEqual(detail.actions, { deny: true, message: "PII detected" });
		assert.equal(detail.internal, undefined);
		assert.deepEqual(calls, [
			["list", listParams],
			["get", "pii-filter"],
		]);
	});

	it("creates, fully updates, minimally updates, and deletes guardrails", async () => {
		const calls: unknown[] = [];
		const mutationResult = {
			id: "guardrail-1",
			slug: "pii-filter",
			version_id: "version-2",
		};
		const callbacks = callbacksForDomain("guardrails", {
			guardrails: {
				createGuardrail: async (params: unknown) => {
					calls.push(["create", params]);
					return mutationResult;
				},
				updateGuardrail: async (id: string, params: unknown) => {
					calls.push(["update", id, params]);
					return mutationResult;
				},
				deleteGuardrail: async (id: string) => {
					calls.push(["delete", id]);
					return { success: true };
				},
			},
		});
		const create = callbacks.get("create_guardrail");
		const update = callbacks.get("update_guardrail");
		const remove = callbacks.get("delete_guardrail");
		assert.ok(create && update && remove);

		const checks = [
			{
				id: "default.pii",
				name: "PII",
				is_enabled: true,
				parameters: { categories: ["email"] },
			},
		];
		const actions = {
			deny: true,
			async: false,
			on_success: { value: 1, weight: 0.5, metadata: { result: "clean" } },
			on_fail: { value: -1, weight: 1, metadata: { result: "blocked" } },
			on_fail_action: "block",
			message: "PII detected",
		};
		const created = parseEnvelope(
			await create({
				name: "PII filter",
				checks,
				actions,
				workspace_id: "workspace-1",
				organisation_id: "organisation-1",
			}),
		);
		const fullyUpdated = parseEnvelope(
			await update({
				guardrail_id: "pii-filter",
				name: "PII filter v2",
				checks,
				actions,
			}),
		);
		await update({ guardrail_id: "pii-filter" });
		const deleted = parseEnvelope(await remove({ guardrail_id: "pii-filter" }));

		assert.equal(created.version_id, "version-2");
		assert.equal(fullyUpdated.slug, "pii-filter");
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			[
				"create",
				{
					name: "PII filter",
					checks,
					actions,
					workspace_id: "workspace-1",
					organisation_id: "organisation-1",
				},
			],
			["update", "pii-filter", { name: "PII filter v2", checks, actions }],
			["update", "pii-filter", {}],
			["delete", "pii-filter"],
		]);
	});
});

describe("remaining collection behavior", () => {
	it("deletes a collection and preserves the service success result", async () => {
		const calls: unknown[] = [];
		const callback = callbacksForDomain("collections", {
			collections: {
				deleteCollection: async (id: string) => {
					calls.push(id);
					return { success: true };
				},
			},
		}).get("delete_collection");
		assert.ok(callback);

		const payload = parseEnvelope(
			await callback({ collection_id: "collection-1" }),
		);
		assert.equal(payload.success, true);
		assert.match(String(payload.message), /collection-1/);
		assert.deepEqual(calls, ["collection-1"]);
	});
});

describe("remaining API key behavior", () => {
	it("deletes an API key and returns the revocation result", async () => {
		const calls: unknown[] = [];
		const callback = callbacksForDomain("keys", {
			keys: {
				deleteApiKey: async (id: string) => {
					calls.push(id);
					return { success: true };
				},
			},
		}).get("delete_api_key");
		assert.ok(callback);

		const payload = parseEnvelope(
			await callback({ id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" }),
		);
		assert.equal(payload.success, true);
		assert.match(String(payload.message), /6ba7b810/);
		assert.deepEqual(calls, ["6ba7b810-9dad-11d1-80b4-00c04fd430c8"]);
	});
});

const SECRET_REFERENCE = {
	id: "3c90c3cc-0d44-4b50-8888-8dd25736052a",
	organisation_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	name: "Production OpenAI",
	slug: "production-openai",
	description: "Production key",
	manager_type: "aws_sm",
	secret_path: "production/openai",
	secret_key: "api-key",
	allow_all_workspaces: false,
	tags: { environment: "production" },
	status: "ACTIVE",
	created_by: "user-1",
	created_at: "2026-01-01T00:00:00.000Z",
	last_updated_at: "2026-01-02T00:00:00.000Z",
	object: "secret-reference",
};

describe("Secret Reference lifecycle and redaction", () => {
	it("creates a manager-matched reference with scoped workspace access", async () => {
		let received: unknown;
		const callback = callbacksForDomain("secret-references", {
			secretReferences: {
				createSecretReference: async (params: unknown) => {
					received = params;
					return {
						id: SECRET_REFERENCE.id,
						slug: SECRET_REFERENCE.slug,
						object: "secret-reference",
					};
				},
			},
		}).get("create_secret_reference");
		assert.ok(callback);

		const request = {
			organisation_id: SECRET_REFERENCE.organisation_id,
			name: SECRET_REFERENCE.name,
			slug: SECRET_REFERENCE.slug,
			description: SECRET_REFERENCE.description,
			manager_type: "aws_sm",
			auth_config: {
				aws_auth_type: "accessKey",
				aws_access_key_id: "AKIA-example",
				aws_secret_access_key: "secret",
				aws_region: "us-east-1",
			},
			secret_path: SECRET_REFERENCE.secret_path,
			secret_key: SECRET_REFERENCE.secret_key,
			allow_all_workspaces: false,
			allowed_workspaces: ["workspace-1"],
			tags: SECRET_REFERENCE.tags,
		};
		const payload = parseEnvelope(await callback(request));

		assert.equal(payload.id, SECRET_REFERENCE.id);
		assert.equal(payload.slug, SECRET_REFERENCE.slug);
		assert.deepEqual(received, request);
	});

	it("serializes list tags before querying and curates returned references", async () => {
		let received: unknown;
		const callback = callbacksForDomain("secret-references", {
			secretReferences: {
				listSecretReferences: async (params: unknown) => {
					received = params;
					return {
						object: "list",
						total: 1,
						data: [
							{
								...SECRET_REFERENCE,
								auth_config: { aws_secret_access_key: "must-not-leak" },
							},
						],
					};
				},
			},
		}).get("list_secret_references");
		assert.ok(callback);

		const payload = parseEnvelope(
			await callback({
				manager_type: "aws_sm",
				tags: SECRET_REFERENCE.tags,
				search: "OpenAI",
				current_page: 0,
				page_size: 20,
			}),
		);
		assert.deepEqual(received, {
			manager_type: "aws_sm",
			tags: JSON.stringify(SECRET_REFERENCE.tags),
			search: "OpenAI",
			current_page: 0,
			page_size: 20,
		});
		assert.equal(payload.total, 1);
		assert.equal(
			(payload.secret_references as Array<Record<string, unknown>>)[0]
				?.auth_config,
			undefined,
		);
	});

	it("recursively redacts sensitive authentication fields without rewriting arrays", async () => {
		const callback = callbacksForDomain("secret-references", {
			secretReferences: {
				getSecretReference: async () => ({
					...SECRET_REFERENCE,
					auth_config: {
						aws_auth_type: "accessKey",
						aws_region: "us-east-1",
						credentials: {
							access_key_id: "AKIA-example",
							secret_access_key: "secret",
							role: "runtime",
						},
						fallback_regions: ["us-east-1", "us-west-2"],
					},
				}),
			},
		}).get("get_secret_reference");
		assert.ok(callback);

		const payload = parseEnvelope(
			await callback({ id: SECRET_REFERENCE.slug }),
		);
		assert.deepEqual(payload.auth_config, {
			aws_auth_type: "accessKey",
			aws_region: "us-east-1",
			credentials: "[REDACTED]",
			fallback_regions: ["us-east-1", "us-west-2"],
		});
	});

	it("updates one authentication family and deletes the reference", async () => {
		const calls: unknown[] = [];
		const callbacks = callbacksForDomain("secret-references", {
			secretReferences: {
				updateSecretReference: async (id: string, params: unknown) => {
					calls.push(["update", id, params]);
					return { object: "secret-reference" };
				},
				deleteSecretReference: async (id: string) => {
					calls.push(["delete", id]);
					return { success: true };
				},
			},
		});
		const update = callbacks.get("update_secret_reference");
		const remove = callbacks.get("delete_secret_reference");
		assert.ok(update && remove);

		const updates = {
			description: null,
			auth_config: {
				aws_access_key_id: "AKIA-replacement",
				aws_secret_access_key: "replacement",
			},
			secret_path: "production/openai-v2",
			secret_key: null,
			allow_all_workspaces: false,
			allowed_workspaces: ["workspace-2"],
			tags: null,
		};
		const updated = parseEnvelope(
			await update({ id: SECRET_REFERENCE.slug, ...updates }),
		);
		const deleted = parseEnvelope(await remove({ id: SECRET_REFERENCE.slug }));

		assert.equal(updated.success, true);
		assert.equal(deleted.success, true);
		assert.deepEqual(calls, [
			["update", SECRET_REFERENCE.slug, updates],
			["delete", SECRET_REFERENCE.slug],
		]);
	});
});

describe("MCP integration Secret Reference authentication", () => {
	it("accepts headers auth supplied by a runtime Secret Reference mapping", async () => {
		let received: unknown;
		const callback = callbacksForDomain("mcp-integrations", {
			mcpIntegrations: {
				createMcpIntegration: async (params: unknown) => {
					received = params;
					return { id: "mcp-integration-1", slug: "search-mcp" };
				},
			},
		}).get("create_mcp_integration");
		assert.ok(callback);

		const secretMappings = [
			{
				target_field: "configurations.custom_headers",
				secret_reference_id: SECRET_REFERENCE.id,
				secret_key: "headers",
				value_format: "json",
			},
		];
		const payload = parseEnvelope(
			await callback({
				name: "Search MCP",
				slug: "search-mcp",
				description: "Search production data",
				url: "https://mcp.example.com",
				auth_type: "headers",
				transport: "http",
				workspace_id: "workspace-1",
				secret_mappings: secretMappings,
			}),
		);

		assert.equal(payload.id, "mcp-integration-1");
		assert.deepEqual(received, {
			name: "Search MCP",
			slug: "search-mcp",
			description: "Search production data",
			url: "https://mcp.example.com",
			auth_type: "headers",
			transport: "http",
			workspace_id: "workspace-1",
			secret_mappings: secretMappings,
		});
	});
});

describe("prompt history and dry-run edge cases", () => {
	it("formats version history entries returned with a prompt", async () => {
		const callback = callbacksForDomain("prompts", {
			prompts: {
				getPrompt: async () => ({
					id: "prompt-1",
					name: "Support Prompt",
					slug: "support-prompt",
					collection_id: "collection-1",
					created_at: "2026-01-01T00:00:00.000Z",
					last_updated_at: "2026-01-03T00:00:00.000Z",
					current_version: {
						id: "version-2",
						version_number: 2,
						version_description: "Current",
						model: "gpt-5",
						string: "Hello {{name}}",
						parameters: { name: "Ada" },
						template_metadata: { app: "support", env: "production" },
						tools: [],
						functions: [],
						created_at: "2026-01-02T00:00:00.000Z",
					},
					versions: [
						{
							id: "version-1",
							version_number: 1,
							version_description: "Initial",
							created_at: "2026-01-01T00:00:00.000Z",
						},
					],
					object: "prompt",
				}),
			},
		}).get("get_prompt");
		assert.ok(callback);

		const payload = parseEnvelope(await callback({ prompt_id: "prompt-1" }));
		assert.equal(payload.version_count, 1);
		assert.deepEqual(payload.versions, [
			{
				id: "version-1",
				version_number: 1,
				description: "Initial",
				created_at: "2026-01-01T00:00:00.000Z",
			},
		]);
	});

	it("reports each supplied update field during a dry run", async () => {
		let updateCalled = false;
		const callback = callbacksForDomain("prompts", {
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
						string: "Old template",
						parameters: {},
						created_at: "2026-01-01T00:00:00.000Z",
					},
					versions: [],
					object: "prompt",
				}),
				updatePrompt: async () => {
					updateCalled = true;
					return {
						id: "prompt-1",
						slug: "support-prompt",
						prompt_version_id: "version-2",
						object: "prompt",
					};
				},
			},
		}).get("update_prompt");
		assert.ok(callback);

		const payload = parseEnvelope(
			await callback({
				prompt_id: "prompt-1",
				dry_run: true,
				name: "Support Prompt v2",
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "Hello {{name}}" }],
					},
				],
			}),
		);

		assert.deepEqual(payload.changes, ["name", "string"]);
		assert.equal(updateCalled, false);
	});
});

describe("integration workspace access edge cases", () => {
	it("builds per-workspace limits while leaving global access unchanged", async () => {
		let received: unknown;
		const callback = callbacksForDomain("integrations", {
			integrations: {
				updateIntegrationWorkspaces: async (slug: string, params: unknown) => {
					received = [slug, params];
					return { success: true };
				},
			},
		}).get("update_integration_workspaces");
		assert.ok(callback);

		const payload = parseEnvelope(
			await callback({
				slug: "openai-production",
				workspaces: [
					{
						id: "workspace-1",
						enabled: true,
						credit_limit: 200,
						alert_threshold: 75,
						rate_limit_rpm: 600,
						reset_usage: false,
						create_default_provider: true,
						default_provider_slug: "openai-workspace-1",
					},
				],
				override_existing_workspace_access: false,
				create_default_provider: false,
				default_provider_slug: "openai-default",
			}),
		);

		assert.equal(payload.success, true);
		assert.equal(payload.workspaces_updated, 1);
		assert.deepEqual(received, [
			"openai-production",
			{
				workspaces: [
					{
						id: "workspace-1",
						enabled: true,
						usage_limits: [
							{
								type: "cost",
								credit_limit: 200,
								alert_threshold: 75,
								periodic_reset: "monthly",
							},
						],
						rate_limits: [{ type: "requests", unit: "rpm", value: 600 }],
						reset_usage: false,
						create_default_provider: true,
						default_provider_slug: "openai-workspace-1",
					},
				],
				global_workspace_access: undefined,
				override_existing_workspace_access: false,
				create_default_provider: false,
				default_provider_slug: "openai-default",
			},
		]);
	});
});

describe("workspace detail edge cases", () => {
	it("formats null defaults and a member with only a first name", async () => {
		const callback = callbacksForDomain("workspaces", {
			workspaces: {
				getWorkspace: async () => ({
					id: "workspace-1",
					name: "Production",
					slug: "production",
					description: null,
					created_at: "2026-01-01T00:00:00.000Z",
					last_updated_at: "2026-01-02T00:00:00.000Z",
					defaults: null,
					users: [
						{
							id: "user-1",
							first_name: "Ada",
							last_name: "",
							org_role: "member",
							role: "manager",
							status: "active",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							object: "workspace-user",
						},
					],
					object: "workspace",
				}),
			},
		}).get("get_workspace");
		assert.ok(callback);

		const payload = parseEnvelope(
			await callback({ workspace_id: "workspace-1" }),
		);
		assert.equal(payload.defaults, null);
		assert.deepEqual(payload.users, [
			{
				id: "user-1",
				name: "Ada",
				organization_role: "member",
				workspace_role: "manager",
				status: "active",
				created_at: "2026-01-01T00:00:00.000Z",
				last_updated_at: "2026-01-02T00:00:00.000Z",
			},
		]);
	});
});
