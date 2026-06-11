/**
 * Unit tests for tool modules that previously had zero coverage:
 * - collections.tools.ts
 * - labels.tools.ts
 * - partials.tools.ts
 * - providers.tools.ts
 * - integrations.tools.ts
 *
 * Each module is exercised against a stubbed service following the same
 * stub-service pattern as unit.test.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BaseService } from "../src/services/base.service.js";
import { CollectionsService } from "../src/services/collections.service.js";
import { IntegrationsService } from "../src/services/integrations.service.js";
import { LabelsService } from "../src/services/labels.service.js";
import { PartialsService } from "../src/services/partials.service.js";
import { ProvidersService } from "../src/services/providers.service.js";
import { registerCollectionsTools } from "../src/tools/collections.tools.js";
import { registerIntegrationsTools } from "../src/tools/integrations.tools.js";
import { registerLabelsTools } from "../src/tools/labels.tools.js";
import { registerPartialsTools } from "../src/tools/partials.tools.js";
import { registerProvidersTools } from "../src/tools/providers.tools.js";

// ---------------------------------------------------------------------------
// Shared test helpers (mirrors the pattern in unit.test.ts)
// ---------------------------------------------------------------------------

type CapturedRequest = {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	params?: object;
	body?: unknown;
};

async function captureServiceRequest(
	invoke: () => Promise<unknown>,
): Promise<CapturedRequest> {
	const basePrototype = BaseService.prototype as {
		get: (path: string, params?: object) => Promise<unknown>;
		post: (path: string, body?: unknown) => Promise<unknown>;
		put: (path: string, body?: unknown) => Promise<unknown>;
		delete: (path: string) => Promise<unknown>;
	};
	const originalMethods = {
		get: basePrototype.get,
		post: basePrototype.post,
		put: basePrototype.put,
		delete: basePrototype.delete,
	};
	let captured: CapturedRequest | undefined;

	basePrototype.get = async (path: string, params?: object) => {
		captured = { method: "GET", path, params };
		return {};
	};
	basePrototype.post = async (path: string, body?: unknown) => {
		captured = { method: "POST", path, body };
		return {};
	};
	basePrototype.put = async (path: string, body?: unknown) => {
		captured = { method: "PUT", path, body };
		return {};
	};
	basePrototype.delete = async (path: string) => {
		captured = { method: "DELETE", path };
		return {};
	};

	try {
		await invoke();
		assert.ok(captured, "expected a service request to be captured");
		return captured;
	} finally {
		basePrototype.get = originalMethods.get;
		basePrototype.post = originalMethods.post;
		basePrototype.put = originalMethods.put;
		basePrototype.delete = originalMethods.delete;
	}
}

function registerToolCallbacks(
	register: (server: { tool(name: string, ...rest: unknown[]): never }) => void,
): Map<string, (...args: unknown[]) => Promise<unknown>> {
	const callbacks = new Map<string, (...args: unknown[]) => Promise<unknown>>();

	register({
		tool(name: string, ...rest: unknown[]) {
			callbacks.set(
				name,
				rest[rest.length - 1] as (...args: unknown[]) => Promise<unknown>,
			);
			return {} as never;
		},
	});

	return callbacks;
}

// ---------------------------------------------------------------------------
// collections.tools.ts
// ---------------------------------------------------------------------------

describe("collections tools — request payload assembly", () => {
	it("create_collection sends name and workspace_id to the service", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerCollectionsTools(
				server as never,
				{
					collections: {
						createCollection: async (payload: unknown) => {
							createCalls.push(payload);
							return {
								id: "col_abc",
								slug: "my-collection",
								object: "collection",
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_collection");
		assert.ok(cb, "create_collection should be registered");

		await cb({ name: "my-collection", workspace_id: "ws_123" });

		assert.deepEqual(createCalls, [
			{ name: "my-collection", workspace_id: "ws_123" },
		]);
	});

	it("update_collection forwards only the provided fields", async () => {
		const updateCalls: Array<{ id: string; body: unknown }> = [];
		const callbacks = registerToolCallbacks((server) => {
			registerCollectionsTools(
				server as never,
				{
					collections: {
						updateCollection: async (id: string, body: unknown) => {
							updateCalls.push({ id, body });
							return {};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("update_collection");
		assert.ok(cb, "update_collection should be registered");

		await cb({ collection_id: "col_abc", name: "renamed" });

		assert.equal(updateCalls.length, 1);
		assert.equal(updateCalls[0]?.id, "col_abc");
		assert.deepEqual(updateCalls[0]?.body, {
			name: "renamed",
			description: undefined,
		});
	});
});

describe("collections tools — curated list_collections response", () => {
	it("returns only curated fields (no raw object wrapper)", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerCollectionsTools(
				server as never,
				{
					collections: {
						listCollections: async () => ({
							object: "list",
							total: 1,
							data: [
								{
									id: "col_1",
									name: "Hourlink",
									slug: "hourlink",
									workspace_id: "ws_1",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
									description: "hourlink prompts",
									object: "collection",
								},
							],
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_collections");
		assert.ok(cb, "list_collections should be registered");

		const result = (await cb({})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			total?: number;
			object?: string;
			collections?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.total, 1);
		assert.equal(payload.object, undefined);
		assert.deepEqual(payload.collections, [
			{
				id: "col_1",
				name: "Hourlink",
				slug: "hourlink",
				workspace_id: "ws_1",
				created_at: "2026-01-01T00:00:00.000Z",
				last_updated_at: "2026-01-02T00:00:00.000Z",
			},
		]);
	});
});

describe("collections tools — get_collection curated response", () => {
	it("returns the curated collection fields", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerCollectionsTools(
				server as never,
				{
					collections: {
						getCollection: async (_id: string) => ({
							id: "col_1",
							name: "Hourlink",
							slug: "hourlink",
							workspace_id: "ws_1",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							description: "hidden",
							object: "collection",
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_collection");
		assert.ok(cb, "get_collection should be registered");

		const result = (await cb({ collection_id: "col_1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			id?: string;
			name?: string;
			object?: string;
			description?: string;
		};

		assert.equal(payload.id, "col_1");
		assert.equal(payload.name, "Hourlink");
		assert.equal(payload.object, undefined);
		assert.equal(payload.description, undefined);
	});
});

describe("collections tools — path encoding", () => {
	it("encodes collection_id with slashes and spaces in getCollection path", async () => {
		const req = await captureServiceRequest(() =>
			new CollectionsService("test-key").getCollection("col/one two"),
		);
		assert.equal(req.method, "GET");
		assert.equal(req.path, "/collections/col%2Fone%20two");
	});

	it("encodes collection_id with slashes and spaces in deleteCollection path", async () => {
		const req = await captureServiceRequest(() =>
			new CollectionsService("test-key").deleteCollection("col/one two"),
		);
		assert.equal(req.method, "DELETE");
		assert.equal(req.path, "/collections/col%2Fone%20two");
	});
});

// ---------------------------------------------------------------------------
// labels.tools.ts
// ---------------------------------------------------------------------------

describe("labels tools — create_prompt_label payload assembly", () => {
	it("sends all fields to the service when both scope ids provided", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerLabelsTools(
				server as never,
				{
					labels: {
						createLabel: async (payload: unknown) => {
							createCalls.push(payload);
							return { id: "lbl_1" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_prompt_label");
		assert.ok(cb, "create_prompt_label should be registered");

		await cb({
			name: "production",
			organisation_id: "org_1",
			workspace_id: "ws_1",
			description: "live traffic",
			color_code: "#FF5733",
		});

		assert.deepEqual(createCalls, [
			{
				name: "production",
				organisation_id: "org_1",
				workspace_id: "ws_1",
				description: "live traffic",
				color_code: "#FF5733",
			},
		]);
	});

	it("returns an error result when neither organisation_id nor workspace_id is provided", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerLabelsTools(
				server as never,
				{
					labels: {
						createLabel: async () => {
							throw new Error("should not be called");
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_prompt_label");
		assert.ok(cb, "create_prompt_label should be registered");

		const result = (await cb({ name: "missing-scope" })) as {
			isError?: boolean;
			content: Array<{ text: string }>;
		};

		assert.equal(result.isError, true);
		assert.match(result.content[0]?.text ?? "", /organisation_id|workspace_id/);
	});
});

describe("labels tools — curated list_prompt_labels response", () => {
	it("returns curated label fields with pagination total", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerLabelsTools(
				server as never,
				{
					labels: {
						listLabels: async () => ({
							total: 2,
							data: [
								{
									id: "lbl_1",
									name: "production",
									description: "live",
									color_code: "#FF5733",
									is_universal: true,
									status: "active",
									organisation_id: "org_1",
									workspace_id: "ws_1",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
								},
								{
									id: "lbl_2",
									name: "staging",
									description: undefined,
									color_code: undefined,
									is_universal: false,
									status: "active",
									organisation_id: "org_1",
									workspace_id: undefined,
									created_at: "2026-01-03T00:00:00.000Z",
									last_updated_at: "2026-01-04T00:00:00.000Z",
								},
							],
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_prompt_labels");
		assert.ok(cb, "list_prompt_labels should be registered");

		const result = (await cb({})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			total?: number;
			labels?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.total, 2);
		assert.equal(payload.labels?.length, 2);
		assert.equal(payload.labels?.[0]?.id, "lbl_1");
		assert.equal(payload.labels?.[0]?.name, "production");
		assert.equal(payload.labels?.[0]?.is_universal, true);
		assert.equal(payload.labels?.[1]?.id, "lbl_2");
	});
});

describe("labels tools — path encoding", () => {
	it("encodes label_id with slashes and spaces in getLabel path", async () => {
		const req = await captureServiceRequest(() =>
			new LabelsService("test-key").getLabel("lbl/one two", {}),
		);
		assert.equal(req.method, "GET");
		assert.equal(req.path, "/labels/lbl%2Fone%20two");
	});

	it("encodes label_id with slashes and spaces in deleteLabel path", async () => {
		const req = await captureServiceRequest(() =>
			new LabelsService("test-key").deleteLabel("lbl/one two"),
		);
		assert.equal(req.method, "DELETE");
		assert.equal(req.path, "/labels/lbl%2Fone%20two");
	});
});

// ---------------------------------------------------------------------------
// partials.tools.ts
// ---------------------------------------------------------------------------

describe("partials tools — create_prompt_partial payload assembly", () => {
	it("sends all fields including optional workspace_id and version_description", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerPartialsTools(
				server as never,
				{
					partials: {
						createPromptPartial: async (payload: unknown) => {
							createCalls.push(payload);
							return {
								id: "par_1",
								slug: "system-prompt",
								version_id: "pv_1",
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_prompt_partial");
		assert.ok(cb, "create_prompt_partial should be registered");

		await cb({
			name: "system-prompt",
			string: "You are a helpful assistant.",
			workspace_id: "ws_1",
			version_description: "initial draft",
		});

		assert.deepEqual(createCalls, [
			{
				name: "system-prompt",
				string: "You are a helpful assistant.",
				workspace_id: "ws_1",
				version_description: "initial draft",
			},
		]);
	});
});

describe("partials tools — curated list_prompt_partials response", () => {
	it("returns total count and curated partial fields without raw object wrapper", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerPartialsTools(
				server as never,
				{
					partials: {
						listPromptPartials: async () => [
							{
								id: "par_1",
								slug: "sys-prompt",
								name: "System Prompt",
								collection_id: "col_1",
								status: "active",
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-02T00:00:00.000Z",
								object: "partial" as const,
							},
						],
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_prompt_partials");
		assert.ok(cb, "list_prompt_partials should be registered");

		const result = (await cb({})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			total?: number;
			partials?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.total, 1);
		assert.deepEqual(payload.partials, [
			{
				id: "par_1",
				slug: "sys-prompt",
				name: "System Prompt",
				collection_id: "col_1",
				status: "active",
				created_at: "2026-01-01T00:00:00.000Z",
				last_updated_at: "2026-01-02T00:00:00.000Z",
			},
		]);
	});
});

describe("partials tools — get_prompt_partial curated response", () => {
	it("returns the full partial detail including string and version metadata", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerPartialsTools(
				server as never,
				{
					partials: {
						getPromptPartial: async (_id: string) => ({
							id: "par_1",
							slug: "sys-prompt",
							name: "System Prompt",
							collection_id: "col_1",
							string: "You are a helpful assistant.",
							version: 2,
							version_description: "refined",
							prompt_partial_version_id: "pv_2",
							status: "active",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_prompt_partial");
		assert.ok(cb, "get_prompt_partial should be registered");

		const result = (await cb({
			prompt_partial_id: "par_1",
		})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			id?: string;
			slug?: string;
			string?: string;
			version?: number;
			prompt_partial_version_id?: string;
		};

		assert.equal(payload.id, "par_1");
		assert.equal(payload.slug, "sys-prompt");
		assert.equal(payload.string, "You are a helpful assistant.");
		assert.equal(payload.version, 2);
		assert.equal(payload.prompt_partial_version_id, "pv_2");
	});
});

describe("partials tools — list_partial_versions content preview truncation", () => {
	it("truncates strings longer than 200 characters in content_preview", async () => {
		const longString = "x".repeat(300);
		const callbacks = registerToolCallbacks((server) => {
			registerPartialsTools(
				server as never,
				{
					partials: {
						listPartialVersions: async (_id: string) => [
							{
								prompt_partial_id: "par_1",
								prompt_partial_version_id: "pv_1",
								slug: "sys-prompt",
								version: "1",
								string: longString,
								description: "first",
								created_at: "2026-01-01T00:00:00.000Z",
								prompt_version_status: "active",
								object: "partial" as const,
							},
						],
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_partial_versions");
		assert.ok(cb, "list_partial_versions should be registered");

		const result = (await cb({
			prompt_partial_id: "par_1",
		})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			versions?: Array<{ content_preview?: string }>;
		};

		const preview = payload.versions?.[0]?.content_preview ?? "";
		assert.equal(preview.length, 203); // 200 chars + "..."
		assert.ok(preview.endsWith("..."));
	});

	it("does not truncate strings at or under 200 characters", async () => {
		const shortString = "short content";
		const callbacks = registerToolCallbacks((server) => {
			registerPartialsTools(
				server as never,
				{
					partials: {
						listPartialVersions: async (_id: string) => [
							{
								prompt_partial_id: "par_1",
								prompt_partial_version_id: "pv_1",
								slug: "sys-prompt",
								version: "1",
								string: shortString,
								description: "first",
								created_at: "2026-01-01T00:00:00.000Z",
								prompt_version_status: "active",
								object: "partial" as const,
							},
						],
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_partial_versions");
		assert.ok(cb, "list_partial_versions should be registered");

		const result = (await cb({
			prompt_partial_id: "par_1",
		})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			versions?: Array<{ content_preview?: string }>;
		};

		assert.equal(payload.versions?.[0]?.content_preview, shortString);
	});
});

describe("partials tools — path encoding", () => {
	it("encodes prompt_partial_id with slashes and spaces in getPromptPartial path", async () => {
		const req = await captureServiceRequest(() =>
			new PartialsService("test-key").getPromptPartial("par/one two"),
		);
		assert.equal(req.method, "GET");
		assert.equal(req.path, "/prompts/partials/par%2Fone%20two");
	});

	it("encodes prompt_partial_id with slashes and spaces in deletePromptPartial path", async () => {
		const req = await captureServiceRequest(() =>
			new PartialsService("test-key").deletePromptPartial("par/one two"),
		);
		assert.equal(req.method, "DELETE");
		assert.equal(req.path, "/prompts/partials/par%2Fone%20two");
	});
});

// ---------------------------------------------------------------------------
// providers.tools.ts
// ---------------------------------------------------------------------------

describe("providers tools — create_provider payload assembly", () => {
	it("sends name, integration_id, and usage/rate limits to the service", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerProvidersTools(
				server as never,
				{
					providers: {
						createProvider: async (payload: unknown) => {
							createCalls.push(payload);
							return { id: "prov_1", slug: "my-openai" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_provider");
		assert.ok(cb, "create_provider should be registered");

		await cb({
			name: "My OpenAI",
			integration_id: "openai",
			workspace_id: "ws_1",
			slug: "my-openai",
			note: "primary key",
			credit_limit: 100,
			alert_threshold: 80,
			usage_limit_type: "cost",
			periodic_reset: "monthly",
			rate_limit_value: 60,
			rate_limit_unit: "rpm",
			expires_at: "2027-01-01T00:00:00.000Z",
		});

		assert.deepEqual(createCalls, [
			{
				name: "My OpenAI",
				integration_id: "openai",
				workspace_id: "ws_1",
				slug: "my-openai",
				note: "primary key",
				usage_limits: {
					type: "cost",
					credit_limit: 100,
					alert_threshold: 80,
					periodic_reset: "monthly",
				},
				rate_limits: [
					{
						type: "requests",
						unit: "rpm",
						value: 60,
					},
				],
				expires_at: "2027-01-01T00:00:00.000Z",
			},
		]);
	});

	it("omits rate_limits when only one of value/unit is provided", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerProvidersTools(
				server as never,
				{
					providers: {
						createProvider: async (payload: unknown) => {
							createCalls.push(payload);
							return { id: "prov_2", slug: "no-rl" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_provider");
		assert.ok(cb, "create_provider should be registered");

		// Provide rate_limit_value but not rate_limit_unit — should omit rate_limits
		await cb({
			name: "No Rate Limit",
			integration_id: "openai",
			rate_limit_value: 60,
		});

		const payload = createCalls[0] as { rate_limits?: unknown };
		assert.equal(payload.rate_limits, undefined);
	});
});

describe("providers tools — curated get_provider response", () => {
	it("returns provider fields with usage and rate limits, omits raw API wrapper", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerProvidersTools(
				server as never,
				{
					providers: {
						getProvider: async (_slug: string, _wsId?: string) => ({
							name: "My OpenAI",
							slug: "my-openai",
							integration_id: "openai",
							status: "active" as const,
							note: "primary",
							usage_limits: {
								credit_limit: 100,
								alert_threshold: 80,
								periodic_reset: "monthly" as const,
								type: "cost" as const,
							},
							rate_limits: [
								{
									type: "requests" as const,
									unit: "rpm" as const,
									value: 60,
								},
							],
							reset_usage: null,
							expires_at: null,
							created_at: "2026-01-01T00:00:00.000Z",
							object: "provider" as const,
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_provider");
		assert.ok(cb, "get_provider should be registered");

		const result = (await cb({ slug: "my-openai" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			name?: string;
			slug?: string;
			object?: string;
			usage_limits?: Record<string, unknown>;
			rate_limits?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.name, "My OpenAI");
		assert.equal(payload.slug, "my-openai");
		assert.equal(payload.object, undefined);
		assert.deepEqual(payload.usage_limits, {
			credit_limit: 100,
			alert_threshold: 80,
			periodic_reset: "monthly",
		});
		assert.deepEqual(payload.rate_limits, [
			{ type: "requests", unit: "rpm", value: 60 },
		]);
	});
});

describe("providers tools — update_provider path encoding", () => {
	it("encodes slug with slashes and spaces in updateProvider path", async () => {
		const req = await captureServiceRequest(() =>
			new ProvidersService("test-key").updateProvider(
				"prov/one two",
				{},
				undefined,
			),
		);
		assert.equal(req.method, "PUT");
		assert.equal(req.path, "/providers/prov%2Fone%20two");
	});
});

// ---------------------------------------------------------------------------
// integrations.tools.ts
// ---------------------------------------------------------------------------

describe("integrations tools — create_integration payload assembly", () => {
	it("sends all required and optional fields including configurations object", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(
				server as never,
				{
					integrations: {
						createIntegration: async (payload: unknown) => {
							createCalls.push(payload);
							return { id: "int_1", slug: "my-azure" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_integration");
		assert.ok(cb, "create_integration should be registered");

		await cb({
			name: "My Azure",
			ai_provider_id: "azure-openai",
			slug: "my-azure",
			key: "secret-key",
			description: "Azure integration",
			workspace_id: "ws_1",
			api_version: "2024-02-01",
			resource_name: "my-resource",
			deployment_name: "gpt4",
		});

		assert.deepEqual(createCalls, [
			{
				name: "My Azure",
				ai_provider_id: "azure-openai",
				slug: "my-azure",
				key: "secret-key",
				description: "Azure integration",
				workspace_id: "ws_1",
				configurations: {
					api_version: "2024-02-01",
					resource_name: "my-resource",
					deployment_name: "gpt4",
				},
			},
		]);
	});

	it("preserves empty-string custom_host in configurations (not dropped as falsy)", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(
				server as never,
				{
					integrations: {
						createIntegration: async (payload: unknown) => {
							createCalls.push(payload);
							return { id: "int_2", slug: "custom-host-int" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_integration");
		assert.ok(cb, "create_integration should be registered");

		// Passing empty string for custom_host — should be preserved (recent fix:
		// the check was changed from truthy to !== undefined)
		await cb({
			name: "Custom Host Integration",
			ai_provider_id: "openai",
			custom_host: "",
		});

		const payload = createCalls[0] as {
			configurations?: Record<string, unknown>;
		};
		assert.ok(
			payload.configurations !== undefined,
			"configurations should be present even when custom_host is empty string",
		);
		assert.equal(
			payload.configurations?.custom_host,
			"",
			"empty-string custom_host must be preserved in configurations",
		);
	});

	it("omits configurations when no provider-specific fields are given", async () => {
		const createCalls: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(
				server as never,
				{
					integrations: {
						createIntegration: async (payload: unknown) => {
							createCalls.push(payload);
							return { id: "int_3", slug: "bare-int" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_integration");
		assert.ok(cb, "create_integration should be registered");

		await cb({ name: "Bare Integration", ai_provider_id: "openai" });

		const payload = createCalls[0] as { configurations?: unknown };
		assert.equal(
			payload.configurations,
			undefined,
			"configurations should be omitted when no provider-specific fields are given",
		);
	});
});

describe("integrations tools — update_integration preserves empty-string custom_host", () => {
	it("includes empty-string custom_host in update configurations", async () => {
		const updateCalls: Array<{ slug: string; body: unknown }> = [];
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(
				server as never,
				{
					integrations: {
						updateIntegration: async (slug: string, body: unknown) => {
							updateCalls.push({ slug, body });
							return { success: true };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("update_integration");
		assert.ok(cb, "update_integration should be registered");

		await cb({ slug: "my-int", custom_host: "" });

		assert.equal(updateCalls.length, 1);
		const body = updateCalls[0]?.body as {
			configurations?: Record<string, unknown>;
		};
		assert.ok(
			body.configurations !== undefined,
			"configurations should be present",
		);
		assert.equal(body.configurations?.custom_host, "");
	});
});

describe("integrations tools — curated list_integrations response", () => {
	it("returns curated integration fields without raw API wrapper", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(
				server as never,
				{
					integrations: {
						listIntegrations: async () => ({
							object: "list",
							total: 1,
							data: [
								{
									id: "int_1",
									name: "My OpenAI",
									slug: "my-openai",
									ai_provider_id: "openai",
									status: "active" as const,
									description: "primary openai",
									organisation_id: "org_1",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
									masked_key: "sk-...xxxx",
									object: "integration" as const,
								},
							],
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_integrations");
		assert.ok(cb, "list_integrations should be registered");

		const result = (await cb({})) as { content: Array<{ text: string }> };
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			total?: number;
			object?: string;
			integrations?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.total, 1);
		assert.equal(payload.object, undefined);
		assert.equal(payload.integrations?.length, 1);
		const integration = payload.integrations?.[0];
		assert.equal(integration?.id, "int_1");
		assert.equal(integration?.slug, "my-openai");
		assert.equal(integration?.ai_provider_id, "openai");
		// masked_key should not leak into the list response
		assert.equal(integration?.masked_key, undefined);
	});
});

describe("integrations tools — curated get_integration response", () => {
	it("returns integration detail including masked_key and configurations", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(
				server as never,
				{
					integrations: {
						getIntegration: async (_slug: string) => ({
							id: "int_1",
							name: "My Azure",
							slug: "my-azure",
							ai_provider_id: "azure-openai",
							status: "active" as const,
							description: "azure integration",
							organisation_id: "org_1",
							masked_key: "sk-...xxxx",
							configurations: {
								api_version: "2024-02-01",
								resource_name: "my-resource",
								deployment_name: "gpt4",
							},
							global_workspace_access_settings: null,
							allow_all_models: true,
							workspace_count: 3,
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							object: "integration" as const,
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_integration");
		assert.ok(cb, "get_integration should be registered");

		const result = (await cb({ slug: "my-azure" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			id?: string;
			masked_key?: string;
			configurations?: Record<string, unknown>;
			workspace_count?: number;
			object?: string;
		};

		assert.equal(payload.id, "int_1");
		assert.equal(payload.masked_key, "sk-...xxxx");
		assert.deepEqual(payload.configurations, {
			api_version: "2024-02-01",
			resource_name: "my-resource",
			deployment_name: "gpt4",
		});
		assert.equal(payload.workspace_count, 3);
		assert.equal(payload.object, undefined);
	});
});

describe("integrations tools — path encoding", () => {
	it("encodes integration slug in deleteIntegrationModel path", async () => {
		const req = await captureServiceRequest(() =>
			new IntegrationsService("test-key").deleteIntegrationModel(
				"int/one two",
				"model-slug",
			),
		);
		assert.equal(req.method, "DELETE");
		assert.equal(
			req.path,
			"/integrations/int%2Fone%20two/models?slugs=model-slug",
		);
	});

	it("encodes model slug with special characters in deleteIntegrationModel path", async () => {
		const req = await captureServiceRequest(() =>
			new IntegrationsService("test-key").deleteIntegrationModel(
				"my-integration",
				"model/three?",
			),
		);
		assert.equal(req.method, "DELETE");
		assert.equal(
			req.path,
			"/integrations/my-integration/models?slugs=model%2Fthree%3F",
		);
	});
});
