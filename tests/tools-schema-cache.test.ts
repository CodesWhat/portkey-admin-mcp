import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import {
	type CreateMcpServerOptions,
	createMcpServer,
} from "../src/lib/mcp-server.js";
import { getJsonSchemaConversionCount } from "../src/tools/index.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
	process.env.PORTKEY_API_KEY = "test-key-schema-cache";
});

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

async function withClient<T>(
	toolDomains: CreateMcpServerOptions["toolDomains"],
	run: (client: Client) => Promise<T>,
): Promise<T> {
	const { server } = createMcpServer(toolDomains ? { toolDomains } : {});
	const client = new Client({ name: "schema-cache-test", version: "1.0.0" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	try {
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		return await run(client);
	} finally {
		await Promise.allSettled([client.close(), server.close()]);
	}
}

describe("JSON Schema conversion cache", () => {
	it("converts each schema once across fresh servers", async () => {
		const first = await withClient(["configs"], (c) => c.listTools());
		const afterFirst = getJsonSchemaConversionCount();
		assert.ok(afterFirst > 0);

		const second = await withClient(["configs"], (c) => c.listTools());
		assert.equal(getJsonSchemaConversionCount(), afterFirst);
		assert.deepEqual(second.tools, first.tools);

		await withClient(["configs"], async (c) => {
			await c.listTools();
			await c.listTools();
		});
		assert.equal(getJsonSchemaConversionCount(), afterFirst);
	});

	it("serves identical catalogs for a domain subset and the full set", async () => {
		const full = await withClient(undefined, (c) => c.listTools());
		const afterFull = getJsonSchemaConversionCount();
		const subset = await withClient(["configs"], (c) => c.listTools());
		assert.equal(getJsonSchemaConversionCount(), afterFull);

		const subsetNames = new Set(subset.tools.map((tool) => tool.name));
		assert.ok(subsetNames.size > 0);
		assert.deepEqual(
			full.tools.filter((tool) => subsetNames.has(tool.name)),
			subset.tools,
		);
	});

	it("advertises an output schema for every tool", async () => {
		const { tools } = await withClient(undefined, (c) => c.listTools());
		for (const tool of tools) {
			assert.ok(tool.outputSchema, `${tool.name} has no outputSchema`);
		}
	});

	it("still rejects invalid arguments", async () => {
		await withClient(["configs"], async (client) => {
			await client.listTools();
			const result = await client.callTool({
				name: "list_configs",
				arguments: { current_page: "not-a-number" },
			});
			assert.equal(result.isError, true);
		});
	});

	it("uses the short generic output schema descriptions", async () => {
		const { tools } = await withClient(["configs"], (c) => c.listTools());
		type Described = {
			description?: string;
			properties?: Record<string, Described>;
		};
		const properties = tools
			.map((tool) => tool.outputSchema?.properties as Record<string, Described>)
			.find((props) => props?.ok?.description === "Call succeeded");
		assert.ok(properties, "no tool uses the generic output schema");
		assert.equal(properties.data?.description, "Success payload");
		assert.equal(properties.error?.description, "Failure details");
		assert.equal(
			properties.error?.properties?.message?.description,
			"Error message",
		);
		assert.equal(
			properties.error?.properties?.details?.description,
			"Extra error details",
		);
	});
});
