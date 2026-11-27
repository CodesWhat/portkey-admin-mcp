import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerIntegrationsTools } from "../src/tools/integrations.tools.js";
import { registerToolCallbacks } from "./helpers/tool-registry.js";

// One representative per oneOf variant of the spec's integration
// `configurations` object (CreateIntegrationRequest / UpdateIntegrationRequest).
const variants: Array<{
	name: string;
	ai_provider_id: string;
	configurations: Record<string, unknown>;
}> = [
	{
		name: "openai",
		ai_provider_id: "openai",
		configurations: { openai_organization: "org-1", openai_project: "proj-1" },
	},
	{
		name: "anthropic oauth",
		ai_provider_id: "anthropic",
		configurations: {
			provider_auth_type: "oauth_client_credentials",
			oauth_token_endpoint: "https://idp.example.com/token",
			oauth_client_id: "cid",
			is_key_required: false,
		},
	},
	{
		name: "azure-openai",
		ai_provider_id: "azure-openai",
		configurations: {
			azure_auth_mode: "default",
			azure_resource_name: "res",
			azure_deployment_config: [
				{
					azure_api_version: "2024-02-01",
					azure_deployment_name: "gpt4",
					azure_model_slug: "gpt-4",
					is_default: true,
				},
			],
		},
	},
	{
		name: "bedrock",
		ai_provider_id: "bedrock",
		configurations: {
			aws_auth_type: "assumedRole",
			aws_region: "us-east-1",
			aws_role_arn: "arn:aws:iam::1:role/x",
			aws_external_id: "ext",
		},
	},
	{
		name: "vertex-ai",
		ai_provider_id: "vertex-ai",
		configurations: {
			vertex_auth_type: "default",
			vertex_region: "us-central1",
		},
	},
	{
		name: "azure-ai",
		ai_provider_id: "azure-ai",
		configurations: {
			azure_auth_mode: "default",
			azure_foundry_url: "https://x.services.ai.azure.com",
		},
	},
	{
		name: "workers-ai",
		ai_provider_id: "workers-ai",
		configurations: { workers_ai_account_id: "acct" },
	},
	{
		name: "huggingface",
		ai_provider_id: "huggingface",
		configurations: { huggingface_base_url: "https://hf.example.com" },
	},
	{
		name: "cortex",
		ai_provider_id: "cortex",
		configurations: { snowflake_account: "acme-xy123" },
	},
	{
		name: "custom host",
		ai_provider_id: "openai",
		configurations: {
			custom_host: "https://llm.example.com",
			custom_headers: { "x-team": "a" },
		},
	},
];

function setup() {
	const createCalls: Array<{ configurations?: unknown }> = [];
	const updateCalls: Array<{ configurations?: unknown }> = [];
	const callbacks = registerToolCallbacks((server) => {
		registerIntegrationsTools(
			server as never,
			{
				integrations: {
					createIntegration: async (payload: { configurations?: unknown }) => {
						createCalls.push(payload);
						return { id: "i", slug: "s" };
					},
					updateIntegration: async (
						_slug: string,
						body: { configurations?: unknown },
					) => {
						updateCalls.push(body);
						return { success: true };
					},
				},
			} as never,
		);
	});
	return { callbacks, createCalls, updateCalls };
}

describe("integration configurations oneOf variants", () => {
	for (const variant of variants) {
		it(`forwards the ${variant.name} variant on create and update`, async () => {
			const { callbacks, createCalls, updateCalls } = setup();

			await callbacks.get("create_integration")?.({
				name: "n",
				ai_provider_id: variant.ai_provider_id,
				configurations: variant.configurations,
			});
			await callbacks.get("update_integration")?.({
				slug: "s",
				configurations: variant.configurations,
			});

			assert.deepEqual(createCalls[0]?.configurations, variant.configurations);
			assert.deepEqual(updateCalls[0]?.configurations, variant.configurations);
		});
	}

	it("merges flat legacy fields over the configurations object", async () => {
		const { callbacks, createCalls } = setup();

		await callbacks.get("create_integration")?.({
			name: "n",
			ai_provider_id: "bedrock",
			aws_region: "eu-west-1",
			configurations: { aws_auth_type: "accessKey", aws_region: "us-east-1" },
		});

		assert.deepEqual(createCalls[0]?.configurations, {
			aws_auth_type: "accessKey",
			aws_region: "eu-west-1",
		});
	});
});
