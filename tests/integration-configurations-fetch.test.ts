import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { IntegrationsService } from "../src/services/integrations.service.js";
import { registerIntegrationsTools } from "../src/tools/integrations.tools.js";
import { registerToolCallbacks } from "./helpers/tool-registry.js";

const BASE_URL = "https://api.portkey.test/v1";

let originalFetch: typeof globalThis.fetch;
let sent: Array<{ url: string; method?: string; body: unknown }> = [];

beforeEach(() => {
	originalFetch = globalThis.fetch;
	sent = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		sent.push({
			url: String(input),
			method: init?.method,
			body:
				init?.body === undefined ? undefined : JSON.parse(String(init.body)),
		});
		return Response.json({ id: "i", slug: "s" });
	}) as typeof globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function bodyConfigurations(index: number): unknown {
	return (sent[index]?.body as { configurations?: unknown } | undefined)
		?.configurations;
}

function callbacks() {
	return registerToolCallbacks((server) => {
		registerIntegrationsTools(
			server as never,
			{
				integrations: new IntegrationsService("test-key", BASE_URL),
			} as never,
		);
	});
}

describe("integration configurations reach the request body", () => {
	it("sends nested configurations intact on create_integration", async () => {
		const configurations = {
			aws_auth_type: "assumedRole",
			aws_region: "us-east-1",
			aws_role_arn: "arn:aws:iam::1:role/x",
			amzn_sagemaker_target_model: "m",
		};
		await callbacks().get("create_integration")?.({
			name: "n",
			ai_provider_id: "sagemaker",
			configurations,
		});

		assert.equal(sent.length, 1);
		assert.equal(sent[0]?.method, "POST");
		assert.match(sent[0]?.url ?? "", /\/integrations$/);
		assert.deepEqual(bodyConfigurations(0), configurations);
	});

	it("sends nested configurations intact on update_integration", async () => {
		const configurations = {
			custom_host: "https://llm.example.com",
			custom_headers: { "x-team": "a" },
		};
		await callbacks().get("update_integration")?.({
			slug: "s",
			configurations,
		});

		assert.equal(sent.length, 1);
		assert.equal(sent[0]?.method, "PUT");
		assert.deepEqual(bodyConfigurations(0), configurations);
	});

	it("lets flat fields override matching configurations keys in the sent JSON", async () => {
		const callbackMap = callbacks();
		await callbackMap.get("create_integration")?.({
			name: "n",
			ai_provider_id: "bedrock",
			aws_region: "eu-west-1",
			configurations: { aws_auth_type: "accessKey", aws_region: "us-east-1" },
		});
		await callbackMap.get("update_integration")?.({
			slug: "s",
			aws_region: "eu-west-1",
			configurations: { aws_auth_type: "accessKey", aws_region: "us-east-1" },
		});

		const expected = { aws_auth_type: "accessKey", aws_region: "eu-west-1" };
		assert.deepEqual(bodyConfigurations(0), expected);
		assert.deepEqual(bodyConfigurations(1), expected);
	});
});
