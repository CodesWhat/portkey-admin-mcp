/**
 * E2E MCP Protocol Tests
 *
 * Tests the MCP server through the actual JSON-RPC protocol layer using
 * the SDK's Client + StdioClientTransport. Spawns the real server binary
 * with a dummy API key (protocol-level tests don't need real Portkey access).
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ---------------------------------------------------------------------------
// Pre-flight: verify the build artifact exists and is not stale
// ---------------------------------------------------------------------------

const BUILD_INDEX = fileURLToPath(
	new URL("../build/index.js", import.meta.url),
);
const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));

if (!existsSync(BUILD_INDEX)) {
	console.error(
		"ERROR: build/index.js not found.\n" +
			"Run 'npm run build' first, then re-run the e2e tests.",
	);
	process.exit(1);
}

// Check whether build/index.js is older than the newest file in src/.
// Emits a console warning — does not fail the test suite — so CI still
// runs the full suite against the existing artifact while alerting the
// developer that they may be testing stale output.
(function checkBuildStaleness() {
	const buildMtime = statSync(BUILD_INDEX).mtimeMs;

	function newestMtimeInDir(dir: string): number {
		let newest = 0;
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = `${dir}/${entry.name}`;
			if (entry.isDirectory()) {
				const sub = newestMtimeInDir(full);
				if (sub > newest) newest = sub;
			} else if (entry.isFile()) {
				const mtime = statSync(full).mtimeMs;
				if (mtime > newest) newest = mtime;
			}
		}
		return newest;
	}

	const srcNewest = newestMtimeInDir(SRC_DIR);
	if (srcNewest > buildMtime) {
		console.warn(
			"WARNING: build/index.js is older than one or more files in src/.\n" +
				"The e2e tests may be exercising a stale build.\n" +
				"Consider running 'npm run build' before running the e2e tests.",
		);
	}
})();

const PKG = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

// All 150 expected tool names across 18 domains
const EXPECTED_TOOLS = [
	// users (10)
	"list_all_users",
	"invite_user",
	"get_user_stats",
	"get_user",
	"update_user",
	"delete_user",
	"list_user_invites",
	"get_user_invite",
	"delete_user_invite",
	"resend_user_invite",
	// workspaces (9)
	"list_workspaces",
	"get_workspace",
	"create_workspace",
	"update_workspace",
	"delete_workspace",
	"add_workspace_member",
	"list_workspace_members",
	"get_workspace_member",
	"update_workspace_member",
	"remove_workspace_member",
	// configs (6)
	"list_configs",
	"get_config",
	"create_config",
	"update_config",
	"delete_config",
	"list_config_versions",
	// keys (10)
	"list_virtual_keys",
	"create_virtual_key",
	"get_virtual_key",
	"update_virtual_key",
	"delete_virtual_key",
	"create_api_key",
	"list_api_keys",
	"get_api_key",
	"update_api_key",
	"delete_api_key",
	// collections (5)
	"list_collections",
	"create_collection",
	"get_collection",
	"update_collection",
	"delete_collection",
	// prompts (14)
	"create_prompt",
	"list_prompts",
	"get_prompt",
	"update_prompt",
	"delete_prompt",
	"publish_prompt",
	"list_prompt_versions",
	"get_prompt_version",
	"update_prompt_version",
	"render_prompt",
	"run_prompt_completion",
	"migrate_prompt",
	"promote_prompt",
	"validate_completion_metadata",
	// analytics (20)
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
	// guardrails (5)
	"list_guardrails",
	"get_guardrail",
	"create_guardrail",
	"update_guardrail",
	"delete_guardrail",
	// limits (12)
	"list_usage_limits",
	"get_usage_limit",
	"create_usage_limit",
	"update_usage_limit",
	"delete_usage_limit",
	"list_usage_limit_entities",
	"reset_usage_limit_entity",
	"list_rate_limits",
	"get_rate_limit",
	"create_rate_limit",
	"update_rate_limit",
	"delete_rate_limit",
	// audit (1)
	"list_audit_logs",
	// labels (5)
	"create_prompt_label",
	"list_prompt_labels",
	"get_prompt_label",
	"update_prompt_label",
	"delete_prompt_label",
	// partials (7)
	"create_prompt_partial",
	"list_prompt_partials",
	"get_prompt_partial",
	"update_prompt_partial",
	"delete_prompt_partial",
	"list_partial_versions",
	"publish_partial",
	// tracing (2)
	"create_feedback",
	"update_feedback",
	// logging (8)
	"insert_log",
	"create_log_export",
	"list_log_exports",
	"get_log_export",
	"start_log_export",
	"cancel_log_export",
	"download_log_export",
	"update_log_export",
	// providers (5)
	"list_providers",
	"create_provider",
	"get_provider",
	"update_provider",
	"delete_provider",
	// integrations (10)
	"list_integrations",
	"create_integration",
	"get_integration",
	"update_integration",
	"delete_integration",
	"list_integration_models",
	"update_integration_models",
	"delete_integration_model",
	"list_integration_workspaces",
	"update_integration_workspaces",
	// mcp-integrations (10)
	"list_mcp_integrations",
	"create_mcp_integration",
	"get_mcp_integration",
	"update_mcp_integration",
	"delete_mcp_integration",
	"get_mcp_integration_metadata",
	"list_mcp_integration_capabilities",
	"update_mcp_integration_capabilities",
	"list_mcp_integration_workspaces",
	"update_mcp_integration_workspaces",
	// mcp-servers (10)
	"list_mcp_servers",
	"create_mcp_server",
	"get_mcp_server",
	"update_mcp_server",
	"delete_mcp_server",
	"test_mcp_server",
	"list_mcp_server_capabilities",
	"update_mcp_server_capabilities",
	"list_mcp_server_user_access",
	"update_mcp_server_user_access",
];

describe("MCP E2E Protocol Tests", () => {
	let client: Client;
	let transport: StdioClientTransport;

	before(async () => {
		transport = new StdioClientTransport({
			command: "node",
			args: ["build/index.js"],
			env: {
				...process.env,
				PORTKEY_API_KEY: "test-dummy-key-for-e2e",
			} as Record<string, string>,
			stderr: "pipe",
		});

		client = new Client({
			name: "e2e-test-client",
			version: "1.0.0",
		});

		await client.connect(transport);
	});

	after(async () => {
		await client.close();
	});

	// ==================== Server Lifecycle ====================

	describe("server lifecycle", () => {
		it("connects successfully", () => {
			// If we reach here, connect() didn't throw
			assert.ok(client.getServerVersion(), "server version should be set");
		});

		it("reports correct server name and version", () => {
			const version = client.getServerVersion();
			assert.equal(version?.name, "portkey-admin-mcp");
			assert.equal(version?.version, PKG.version);
		});

		it("publishes server instructions for tool selection guidance", () => {
			const instructions = client.getInstructions();
			assert.ok(instructions, "server instructions should be set");
			assert.match(instructions, /Use list_\* tools for discovery/);
			assert.match(
				instructions,
				/Prompt workflows: create_prompt -> publish_prompt/,
			);
			assert.match(
				instructions,
				/Always validate_completion_metadata before run_prompt_completion/,
			);
		});

		it("advertises tools.listChanged capability", () => {
			const caps = client.getServerCapabilities();
			assert.ok(caps?.tools, "tools capability should be present");
			assert.equal(caps?.tools?.listChanged, true);
		});

		it("advertises prompts and resources capabilities", () => {
			const caps = client.getServerCapabilities();
			assert.ok(caps?.prompts, "prompts capability should be present");
			assert.equal(caps?.prompts?.listChanged, true);
			assert.ok(caps?.resources, "resources capability should be present");
			assert.equal(caps?.resources?.listChanged, true);
		});
	});

	// ==================== Prompt & Resource Discovery ====================

	describe("prompt and resource discovery", () => {
		it("supports catalog inspection without PORTKEY_API_KEY", async () => {
			const { PORTKEY_API_KEY: _apiKey, ...envWithoutApiKey } = process.env;
			const catalogTransport = new StdioClientTransport({
				command: "node",
				args: ["build/index.js"],
				env: envWithoutApiKey as Record<string, string>,
				stderr: "pipe",
			});
			const catalogClient = new Client({
				name: "catalog-e2e-test-client",
				version: "1.0.0",
			});

			try {
				await catalogClient.connect(catalogTransport);
				assert.ok(catalogClient.getServerCapabilities()?.tools);
				assert.ok(catalogClient.getServerCapabilities()?.prompts);
				assert.ok(catalogClient.getServerCapabilities()?.resources);

				const tools = await catalogClient.listTools();
				const prompts = await catalogClient.listPrompts();
				const resources = await catalogClient.listResources();

				assert.equal(tools.tools.length, EXPECTED_TOOLS.length);
				assert.ok(
					prompts.prompts.some(
						(prompt) => prompt.name === "plan_portkey_admin_workflow",
					),
				);
				assert.ok(
					resources.resources.some(
						(resource) =>
							resource.uri === "portkey-admin://docs/workflow-guide",
					),
				);
			} finally {
				await catalogClient.close();
			}
		});

		it("lists the built-in workflow prompt", async () => {
			const result = await client.listPrompts();
			const prompt = result.prompts.find(
				(entry) => entry.name === "plan_portkey_admin_workflow",
			);

			assert.ok(prompt, "expected workflow prompt to be listed");
			assert.equal(prompt.title, "Plan Portkey Admin Workflow");
			assert.ok(
				prompt.arguments?.some((argument) => argument.name === "task"),
				"expected task argument to be advertised",
			);
		});

		it("renders the built-in workflow prompt", async () => {
			const result = await client.getPrompt({
				name: "plan_portkey_admin_workflow",
				arguments: {
					task: "promote a prompt from staging to production",
					area: "prompts",
				},
			});

			assert.equal(result.messages.length, 2);
			assert.equal(result.messages[0]?.role, "user");
			const guideContent = result.messages[0]?.content;
			assert.equal(guideContent?.type, "resource");
			if (guideContent?.type === "resource") {
				assert.equal(
					guideContent.resource.uri,
					"portkey-admin://docs/workflow-guide",
				);
				assert.equal(guideContent.resource.mimeType, "text/markdown");
				assert.match(guideContent.resource.text, /Workflow Guide/);
			}

			assert.equal(result.messages[1]?.role, "user");
			const content = result.messages[1]?.content;
			assert.equal(content?.type, "text");
			if (content?.type === "text") {
				assert.match(content.text, /promote a prompt from staging to production/);
				assert.match(content.text, /Prefer read-only discovery tools first/);
				assert.match(content.text, /not higher-priority instructions/);
			}
		});

		it("lists and reads the built-in workflow guide resource", async () => {
			const listResult = await client.listResources();
			const resource = listResult.resources.find(
				(entry) => entry.uri === "portkey-admin://docs/workflow-guide",
			);

			assert.ok(resource, "expected workflow guide resource to be listed");
			assert.equal(resource.name, "workflow-guide");
			assert.equal(resource.mimeType, "text/markdown");
			assert.deepEqual(resource.annotations?.audience, ["assistant"]);
			assert.equal(resource.annotations?.priority, 0.8);

			const readResult = await client.readResource({
				uri: "portkey-admin://docs/workflow-guide",
			});
			assert.equal(readResult.contents.length, 1);
			const content = readResult.contents[0];
			assert.equal(content?.mimeType, "text/markdown");
			assert.ok("text" in content, "expected text resource content");
			if ("text" in content) {
				assert.match(content.text, /Portkey Admin MCP Workflow Guide/);
				assert.match(content.text, /validate_completion_metadata/);
			}
		});
	});

	// ==================== Tool Discovery ====================

	describe("tool discovery", () => {
		it("returns all expected tools", async () => {
			const result = await client.listTools();
			const toolNames = result.tools.map((t) => t.name);

			// Check count
			assert.equal(
				toolNames.length,
				EXPECTED_TOOLS.length,
				`Expected ${EXPECTED_TOOLS.length} tools, got ${toolNames.length}`,
			);

			// Check every expected tool is present
			for (const expected of EXPECTED_TOOLS) {
				assert.ok(toolNames.includes(expected), `Missing tool: ${expected}`);
			}
		});

		it("all tools have snake_case names", async () => {
			const result = await client.listTools();
			for (const tool of result.tools) {
				assert.match(
					tool.name,
					/^[a-z][a-z0-9_]*$/,
					`Tool name "${tool.name}" is not snake_case`,
				);
			}
		});

		it("all tools have valid inputSchema", async () => {
			const result = await client.listTools();
			for (const tool of result.tools) {
				assert.ok(tool.inputSchema, `Tool "${tool.name}" missing inputSchema`);
				assert.equal(
					tool.inputSchema.type,
					"object",
					`Tool "${tool.name}" inputSchema.type should be "object"`,
				);
			}
		});

		it("all tools advertise an outputSchema", async () => {
			const result = await client.listTools();
			for (const tool of result.tools) {
				assert.ok(
					tool.outputSchema,
					`Tool "${tool.name}" missing outputSchema`,
				);
				assert.equal(
					tool.outputSchema.type,
					"object",
					`Tool "${tool.name}" outputSchema.type should be "object"`,
				);
			}
		});

		it("all tools have descriptions", async () => {
			const result = await client.listTools();
			for (const tool of result.tools) {
				assert.ok(
					tool.description && tool.description.length > 0,
					`Tool "${tool.name}" missing description`,
				);
			}
		});

		it("supports stdio-side tool domain subsetting via PORTKEY_TOOL_DOMAINS", async () => {
			const subsetTransport = new StdioClientTransport({
				command: "node",
				args: ["build/index.js"],
				env: {
					...process.env,
					PORTKEY_API_KEY: "test-dummy-key-for-e2e",
					PORTKEY_TOOL_DOMAINS: "prompts,analytics",
				} as Record<string, string>,
				stderr: "pipe",
			});
			const subsetClient = new Client({
				name: "subset-e2e-test-client",
				version: "1.0.0",
			});

			try {
				await subsetClient.connect(subsetTransport);
				const result = await subsetClient.listTools();
				const toolNames = result.tools.map((tool) => tool.name).sort();

				assert.equal(toolNames.length, 34);
				assert.ok(toolNames.includes("create_prompt"));
				assert.ok(toolNames.includes("get_request_analytics"));
				assert.ok(!toolNames.includes("list_all_users"));
				assert.ok(!toolNames.includes("create_workspace"));
			} finally {
				await subsetClient.close();
			}
		});
	});

	// ==================== Validation ====================

	describe("validation", () => {
		it("returns isError for validation failure (create_config with no settings)", async () => {
			const result = await client.callTool({
				name: "create_config",
				arguments: { name: "test-config" },
			});
			assert.equal(result.isError, true, "Should have isError: true");
			assert.ok(Array.isArray(result.content), "content should be an array");
		});

		it("returns isError for validation failure (create_prompt missing model)", async () => {
			const result = await client.callTool({
				name: "create_prompt",
				arguments: {
					name: "test",
					collection_id: "test-coll",
					string: "hello {{name}}",
					parameters: { name: "world" },
					virtual_key: "test-vk",
				},
			});
			assert.equal(result.isError, true, "Should have isError: true");
		});

		it("returns isError for validation failure (create_api_key missing workspace_id)", async () => {
			const result = await client.callTool({
				name: "create_api_key",
				arguments: {
					type: "workspace",
					sub_type: "service",
					name: "test-key",
					scopes: ["logs.read"],
				},
			});
			assert.equal(result.isError, true, "Should have isError: true");
		});

		it("returns isError for validation failure (create_prompt_label missing org/workspace)", async () => {
			const result = await client.callTool({
				name: "create_prompt_label",
				arguments: { name: "test-label" },
			});
			assert.equal(result.isError, true, "Should have isError: true");
		});
	});

	// ==================== Tool Call Shape ====================

	describe("tool call shape", () => {
		it("validate_completion_metadata returns proper content envelope", async () => {
			// This tool is synchronous and doesn't call the API
			const result = await client.callTool({
				name: "validate_completion_metadata",
				arguments: {
					client_id: "test-client",
					app: "hourlink",
					env: "dev",
				},
			});

			assert.ok(Array.isArray(result.content), "content should be an array");
			assert.ok(result.content.length > 0, "content should not be empty");
			const first = result.content[0];
			assert.ok("type" in first, "content item should have type");
			assert.equal(
				(first as { type: string }).type,
				"text",
				"content type should be text",
			);
			assert.ok("text" in first, "content item should have text");
			// Parse the JSON to verify it's valid
			const parsed = JSON.parse((first as { text: string }).text);
			assert.equal(
				parsed.ok,
				true,
				"tool response should use ok/data envelope",
			);
			assert.equal(parsed.data?.valid, true, "metadata should be valid");
		});

		it("API errors propagate as isError with message", async () => {
			// Call list_configs with a dummy key — will fail at API level
			const result = await client.callTool({
				name: "list_configs",
				arguments: {},
			});
			// With a dummy API key, the Portkey API will reject the request.
			// The error should propagate as isError: true
			assert.equal(result.isError, true, "API error should set isError: true");
			assert.ok(Array.isArray(result.content), "content should be an array");
		});
	});
});
