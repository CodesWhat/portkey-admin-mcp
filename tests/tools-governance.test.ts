import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { z } from "zod";
import {
	AccessPolicySchema,
	ListAccessPoliciesResponseSchema,
} from "../src/schemas/contracts/access-policies.contract.js";
import {
	EgressAllowlistEntrySchema,
	ListEgressAllowlistResponseSchema,
} from "../src/schemas/contracts/egress-allowlist.contract.js";
import { PortkeyService } from "../src/services/index.js";
import { registerAllTools, TOOL_DOMAIN_NAMES } from "../src/tools/index.js";
import { parseToolResult } from "./helpers/tool-registry.js";

const ID = "49b9b38d-c9c8-453d-bd93-a4717168ea32";
const subjects = [{ type: "user", id: "user-id" }];
const targets = [{ type: "mcp_server", server_id: "github", tools: "ALL" }];

describe("published governance response contracts", () => {
	for (const [name, schema] of [
		["access-policies-list", ListAccessPoliciesResponseSchema],
		["access-policies-get", AccessPolicySchema],
		["egress-allowlist-list", ListEgressAllowlistResponseSchema],
		["egress-allowlist-get", EgressAllowlistEntrySchema],
	] as const) {
		it(`parses the documentation-derived ${name} fixture`, () => {
			const data = JSON.parse(
				readFileSync(
					new URL(`./fixtures/responses/${name}.json`, import.meta.url),
					"utf8",
				),
			);
			assert.ok(schema.safeParse(data).success);
			assert.equal(
				schema.safeParse({ ...data, object: "incorrect-resource" }).success,
				false,
			);
		});
	}
});

function governanceTools() {
	const tools = new Map<
		string,
		{
			schema: z.ZodType;
			call: (args: never) => Promise<unknown>;
			annotations?: Record<string, unknown>;
		}
	>();
	registerAllTools(
		{
			tool() {},
			registerTool(
				name: string,
				config: {
					inputSchema: z.ZodType | z.ZodRawShape;
					annotations?: Record<string, unknown>;
				},
				call: (args: never) => Promise<unknown>,
			) {
				tools.set(name, {
					schema:
						config.inputSchema instanceof z.ZodType
							? config.inputSchema
							: z.object(config.inputSchema),
					call,
					annotations: config.annotations,
				});
			},
		} as never,
		new PortkeyService("governance-test-key"),
	);
	return (name: string) => {
		const tool = tools.get(name);
		assert.ok(tool, `expected ${name} to be registered`);
		return tool;
	};
}

describe("governance tool discovery", () => {
	it("marks permission and trusted-destination replacements as destructive", () => {
		for (const name of [
			"update_access_policy",
			"update_egress_allowlist_entry",
		]) {
			const { annotations } = governanceTools()(name);
			assert.equal(annotations?.readOnlyHint, false);
			assert.equal(annotations?.destructiveHint, true);
		}
	});
	it("exposes access policies and egress allowlists as selectable domains", () => {
		assert.ok(TOOL_DOMAIN_NAMES.includes("access-policies" as never));
		assert.ok(TOOL_DOMAIN_NAMES.includes("egress-allowlist" as never));
	});
});

describe("integration custom-model compatibility", () => {
	it("normalizes numeric custom-model markers while preserving booleans and null", async () => {
		const { call } = governanceTools()("list_integration_models");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					models: [0, 1, false, true, null].map((is_custom, index) => ({
						slug: `model-${index}`,
						name: "Example",
						enabled: true,
						is_custom,
					})),
				}),
				{ status: 200 },
			);
		try {
			const result = parseToolResult(await call({ slug: "example" } as never));
			const data = result.data as {
				models: Array<{ is_custom: boolean | null }>;
			};
			assert.deepEqual(
				data.models.map((model) => model.is_custom),
				[false, true, false, true, null],
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("access policy validation", () => {
	it("coerces pagination consistently while preserving zero and integer bounds", () => {
		const { schema } = governanceTools()("list_access_policies");
		const parsed = schema.safeParse({ current_page: "0", page_size: "0" });
		assert.ok(parsed.success);
		assert.deepEqual(parsed.data, { current_page: 0, page_size: 0 });
		for (const page_size of ["-1", "1.5", "invalid"])
			assert.equal(schema.safeParse({ page_size }).success, false);
	});
	it("normalizes hosted numeric flags and object spelling without exposing compiler internals", async () => {
		const originalFetch = globalThis.fetch;
		const raw = {
			id: ID,
			object: "acces",
			version: 1,
			enabled: 0,
			allow_all_users: 1,
			allow_all_agents: 0,
			compiled_rego: "internal-policy",
			compiled_hash: "internal-hash",
		};
		try {
			for (const [name, args] of [
				["create_access_policy", { name: "Policy", subjects, targets }],
				["get_access_policy", { id: ID }],
				["list_access_policies", {}],
			] as const) {
				globalThis.fetch = async () =>
					new Response(
						JSON.stringify(
							name === "list_access_policies"
								? { object: "list", total: 1, data: [raw] }
								: raw,
						),
						{ status: 200 },
					);
				const { schema, call } = governanceTools()(name);
				const result = parseToolResult(await call(schema.parse(args) as never));
				const data = result.data as Record<string, unknown>;
				const policy =
					name === "list_access_policies"
						? (data.data as Array<Record<string, unknown>>)[0]
						: data;
				assert.equal(policy.object, "access");
				if (name !== "create_access_policy")
					assert.equal(policy.enabled, false);
				if (name === "list_access_policies") {
					assert.equal(policy.allow_all_users, true);
					assert.equal(policy.allow_all_agents, false);
				}
				assert.equal(policy.compiled_rego, undefined);
				assert.equal(policy.compiled_hash, undefined);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
	it("requires replacement subjects, targets, and a positive integer version on updates", () => {
		const { schema } = governanceTools()("update_access_policy");
		for (const args of [
			{ id: ID },
			{ id: ID, subjects, targets },
			{ id: ID, subjects, targets, version: 0 },
			{ id: ID, subjects, targets, version: 1.5 },
			{ id: ID, subjects: [], targets, version: 1 },
			{ id: ID, subjects, targets: [], version: 1 },
		]) {
			assert.equal(schema.safeParse(args).success, false, JSON.stringify(args));
		}
		assert.equal(
			schema.safeParse({ id: ID, subjects, targets, version: 1 }).success,
			true,
		);
	});
	it("keeps an omitted update effect and permits clearing descriptions and disabling policies", () => {
		const { schema } = governanceTools()("update_access_policy");
		const parsed = schema.parse({
			id: ID,
			version: 2,
			subjects: [
				{ type: "user", id: "ANY" },
				{ type: "agent", id: "ANY" },
			],
			targets,
			description: null,
			enabled: false,
		}) as Record<string, unknown>;
		assert.equal(parsed.effect, undefined);
		assert.equal(parsed.description, null);
		assert.equal(parsed.enabled, false);
	});
	it("enforces subject and target variants without requiring provider models", () => {
		const { schema } = governanceTools()("create_access_policy");
		const base = { name: "Policy", subjects, targets };
		assert.equal(
			schema.safeParse({
				...base,
				targets: [{ type: "provider", provider_id: "openai" }],
			}).success,
			true,
		);
		for (const change of [
			{ name: "" },
			{ name: "x".repeat(65) },
			{ subjects: [{ type: "group", id: "ANY" }] },
			{ effect: "allow", subjects: [{ type: "user", id: "ANY" }] },
			{ targets: [{ type: "mcp_server", server_id: "github" }] },
			{ targets: [{ type: "provider", provider_id: "openai", models: [] }] },
			{ targets: [{ type: "mcp_server", server_id: "github", tools: [""] }] },
		]) {
			assert.equal(
				schema.safeParse({ ...base, ...change }).success,
				false,
				JSON.stringify(change),
			);
		}
		assert.equal(
			schema.safeParse({
				...base,
				subjects: [
					{ type: "user", id: "ANY" },
					{ type: "agent", id: "ANY" },
				],
			}).success,
			true,
		);
	});
});

describe("egress allowlist validation", () => {
	it("returns declared response fields without passing through upstream extras", async () => {
		const originalFetch = globalThis.fetch;
		const raw = {
			id: ID,
			domain: "example.com",
			object: "egress-allowlist",
			internal_notes: "not part of the published response",
		};
		try {
			for (const [name, args] of [
				["create_egress_allowlist_entry", { domain: "example.com" }],
				["get_egress_allowlist_entry", { id: ID }],
				["list_egress_allowlist", {}],
			] as const) {
				globalThis.fetch = async () =>
					new Response(
						JSON.stringify(
							name === "list_egress_allowlist"
								? { object: "list", total: 1, data: [raw] }
								: raw,
						),
						{ status: 200 },
					);
				const { schema, call } = governanceTools()(name);
				const result = parseToolResult(await call(schema.parse(args) as never));
				const data = result.data as Record<string, unknown>;
				const entry =
					name === "list_egress_allowlist"
						? (data.data as Array<Record<string, unknown>>)[0]
						: data;
				assert.equal(entry.domain, "example.com");
				assert.equal(entry.internal_notes, undefined);
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
	it("accepts hostnames, IP literals, and wildcard hosts with server-side normalization", () => {
		const { schema } = governanceTools()("create_egress_allowlist_entry");
		for (const domain of [
			"example.com",
			"*.internal.example.com",
			"10.2.3.4",
			"2001:db8::1",
			"[2001:db8::1]",
			" EXAMPLE.COM ",
		]) {
			assert.equal(schema.safeParse({ domain }).success, true, domain);
		}
	});
	it("rejects URL components, empty hosts, and overlong descriptions", () => {
		const { schema } = governanceTools()("create_egress_allowlist_entry");
		for (const domain of [
			"",
			"   ",
			"https://example.com",
			"example.com/path",
			"user@example.com",
			"example.com:443",
			"example.com?x=1",
			"example.com#fragment",
			"a..example.com",
			"-bad.example.com",
			"bad-.example.com",
		]) {
			assert.equal(schema.safeParse({ domain }).success, false, domain);
		}
		assert.equal(
			schema.safeParse({ domain: "example.com", description: "x".repeat(501) })
				.success,
			false,
		);
	});
	it("requires a recognized update while preserving explicit null", () => {
		const { schema } = governanceTools()("update_egress_allowlist_entry");
		assert.equal(schema.safeParse({ id: ID }).success, false);
		assert.equal(schema.safeParse({ id: ID, unknown: true }).success, false);
		assert.deepEqual(schema.parse({ id: ID, description: null }), {
			id: ID,
			description: null,
		});
		assert.equal(
			schema.safeParse({ id: "not-a-uuid", description: null }).success,
			false,
		);
	});
});

describe("governance API requests", () => {
	const cases = [
		{
			name: "create_access_policy",
			method: "POST",
			path: "/policies/access",
			args: { name: "Policy", subjects, targets },
			body: { name: "Policy", subjects, targets },
			response: { id: ID, object: "access" },
		},
		{
			name: "list_access_policies",
			method: "GET",
			path: "/policies/access",
			args: {
				workspace_id: "ws-main",
				enabled: false,
				page_size: 20,
				current_page: 0,
				search: "A & B",
			},
			response: { object: "list", total: 0, data: [] },
		},
		{
			name: "get_access_policy",
			method: "GET",
			path: `/policies/access/${ID}`,
			args: { id: ID },
			response: { id: ID, version: 2, subjects, targets, object: "access" },
		},
		{
			name: "update_access_policy",
			method: "PUT",
			path: `/policies/access/${ID}`,
			args: {
				id: ID,
				version: 2,
				subjects,
				targets,
				description: null,
				enabled: false,
			},
			body: {
				version: 2,
				subjects,
				targets,
				description: null,
				enabled: false,
			},
			response: {},
		},
		{
			name: "delete_access_policy",
			method: "DELETE",
			path: `/policies/access/${ID}`,
			args: { id: ID },
			response: {},
		},
		{
			name: "create_egress_allowlist_entry",
			method: "POST",
			path: "/egress-allowlist",
			args: { domain: "*.example.com", description: null },
			body: { domain: "*.example.com", description: null },
			response: { id: ID, domain: "*.example.com", object: "egress-allowlist" },
		},
		{
			name: "list_egress_allowlist",
			method: "GET",
			path: "/egress-allowlist",
			args: { current_page: 0, page_size: 20, search: "example.com" },
			response: { object: "list", total: 0, data: [] },
		},
		{
			name: "get_egress_allowlist_entry",
			method: "GET",
			path: `/egress-allowlist/${ID}`,
			args: { id: ID },
			response: {
				id: ID,
				domain: "example.com",
				description: null,
				object: "egress-allowlist",
			},
		},
		{
			name: "update_egress_allowlist_entry",
			method: "PUT",
			path: `/egress-allowlist/${ID}`,
			args: { id: ID, description: null },
			body: { description: null },
			response: {},
		},
		{
			name: "delete_egress_allowlist_entry",
			method: "DELETE",
			path: `/egress-allowlist/${ID}`,
			args: { id: ID },
			response: {},
		},
	];
	for (const scenario of cases) {
		it(`${scenario.name} uses the management route and forwards the exact request`, async () => {
			const { schema, call } = governanceTools()(scenario.name);
			const originalFetch = globalThis.fetch;
			const requests: Array<{ url: URL; init?: RequestInit }> = [];
			globalThis.fetch = async (url, init) => {
				requests.push({ url: new URL(String(url)), init });
				return new Response(JSON.stringify(scenario.response), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			};
			try {
				const result = parseToolResult(
					await call(schema.parse(scenario.args) as never),
				);
				assert.equal(result.ok, true);
				assert.deepEqual(result.data, scenario.response);
				assert.equal(requests.length, 1);
				const { url, init } = requests[0];
				assert.equal(
					url.pathname,
					`/${scenario.path.startsWith("/egress-allowlist") ? "v2" : "v1"}${scenario.path}`,
				);
				assert.equal(init?.method, scenario.method);
				assert.equal(
					new Headers(init?.headers).get("x-portkey-api-key"),
					"governance-test-key",
				);
				if ("body" in scenario)
					assert.deepEqual(JSON.parse(String(init?.body)), scenario.body);
				if (scenario.method === "GET" && !scenario.path.endsWith(ID)) {
					for (const [key, value] of Object.entries(scenario.args))
						assert.equal(url.searchParams.get(key), String(value));
				}
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	}
	it("returns a version conflict without retrying or claiming the update succeeded", async () => {
		const { schema, call } = governanceTools()("update_access_policy");
		const originalFetch = globalThis.fetch;
		let calls = 0;
		globalThis.fetch = async () => {
			calls += 1;
			return new Response(JSON.stringify({ message: "Version conflict" }), {
				status: 409,
			});
		};
		try {
			const result = await call(
				schema.parse({ id: ID, version: 1, subjects, targets }) as never,
			);
			assert.equal((result as { isError?: boolean }).isError, true);
			assert.match(JSON.stringify(result), /Version conflict/);
			assert.equal(calls, 1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
