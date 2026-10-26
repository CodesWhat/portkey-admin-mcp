import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/lib/mcp-server.js";
import { getSharedPortkeyService } from "../src/services/index.js";

// The SDK turns its InvalidParams budget rejection into an isError tool result
// whose text is this message (see McpServer.validateToolInput).
const BUDGET_MESSAGE =
	"Invalid arguments for tool list_configs: arguments contain more than the maximum of 10000 elements";

async function callListConfigs(padding: unknown[]) {
	const service = getSharedPortkeyService();
	const listConfigs = mock.method(service.configs, "listConfigs", async () => ({
		success: true,
		data: [],
		total: 0,
	}));
	const { server } = createMcpServer({ toolDomains: ["configs"] });
	const client = new Client({ name: "input-budget-test", version: "1.0.0" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	try {
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		// The budget runs before schema validation, so the extra field does not
		// need to be one the schema declares.
		const result = await client.callTool({
			name: "list_configs",
			arguments: { current_page: 1, padding },
		});
		return { result, calls: listConfigs.mock.callCount() };
	} finally {
		await Promise.allSettled([client.close(), server.close()]);
		listConfigs.mock.restore();
	}
}

describe("tool input element budget (maxToolInputElements: 10_000)", () => {
	it("rejects a real tool call over the budget before the service runs", async () => {
		// 2 keys + 10_001 array items = 10_003 elements.
		const { result, calls } = await callListConfigs(Array(10_001).fill(0));
		assert.equal(result.isError, true);
		assert.deepEqual(result.content, [{ type: "text", text: BUDGET_MESSAGE }]);
		assert.equal(calls, 0);
	});

	it("rejects an input that is exactly one element over the budget", async () => {
		// 2 keys + 9_999 array items = 10_001 elements.
		const { result, calls } = await callListConfigs(Array(9_999).fill(0));
		assert.equal(result.isError, true);
		assert.deepEqual(result.content, [{ type: "text", text: BUDGET_MESSAGE }]);
		assert.equal(calls, 0);
	});

	it("does not apply the budget to an input at the limit", async () => {
		// 2 keys + 9_998 array items = 10_000 elements.
		const { result, calls } = await callListConfigs(Array(9_998).fill(0));
		assert.notEqual(result.isError, true, JSON.stringify(result.content));
		assert.equal(calls, 1);
	});
});
