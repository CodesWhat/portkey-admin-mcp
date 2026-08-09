/**
 * Behavioral unit tests for src/tools/keys.tools.ts.
 *
 * The generic schema/annotation sweeps (tools-catalog / contract tests) only
 * confirm every keys tool is registered with a valid schema. They never
 * invoke a callback, so payload assembly and response curation bugs in
 * formatVirtualKey/formatApiKeySummary/formatApiKey were invisible. This
 * file exercises each callback against a stubbed PortkeyService.keys and
 * asserts:
 *   - the exact outbound payload sent to the service method
 *   - the curated response shape (fields kept vs dropped)
 *   - the deliberate list/get asymmetry: list_api_keys omits reset_usage,
 *     get_api_key includes it between expires_at and created_at.
 *
 * rotate_api_key already has coverage in tests/tools-platform.test.ts and is
 * not duplicated here.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerKeysTools } from "../src/tools/keys.tools.js";
import { registerToolCallbacks } from "./helpers/tool-registry.js";

// ---------------------------------------------------------------------------
// list_virtual_keys
// ---------------------------------------------------------------------------

describe("list_virtual_keys", () => {
	it("forwards pagination params and returns curated virtual key summaries", async () => {
		let capturedParams: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						listVirtualKeys: async (params: unknown) => {
							capturedParams = params;
							return {
								object: "list" as const,
								total: 1,
								data: [
									{
										name: "OpenAI Prod",
										slug: "openai-prod",
										status: "active" as const,
										note: "primary",
										usage_limits: {
											type: "cost" as const,
											credit_limit: 100,
											alert_threshold: 80,
											periodic_reset: "monthly" as const,
										},
										rate_limits: [
											{
												type: "requests" as const,
												unit: "rpm" as const,
												value: 60,
											},
										],
										reset_usage: null,
										created_at: "2026-01-01T00:00:00.000Z",
										slug_extra: "should-not-leak",
										model_config: { foo: "bar" },
										object: "virtual-key" as const,
									},
								],
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_virtual_keys");
		assert.ok(cb, "list_virtual_keys should be registered");

		const result = (await cb({ current_page: 2, page_size: 10 })) as {
			content: Array<{ text: string }>;
		};

		assert.deepEqual(capturedParams, { current_page: 2, page_size: 10 });

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			total?: number;
			virtual_keys?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.total, 1);
		// raw/unknown fields must not leak through
		assert.equal(payload.virtual_keys?.[0]?.object, undefined);
		assert.equal(payload.virtual_keys?.[0]?.slug_extra, undefined);
		assert.deepEqual(payload.virtual_keys, [
			{
				name: "OpenAI Prod",
				slug: "openai-prod",
				status: "active",
				note: "primary",
				usage_limits: {
					credit_limit: 100,
					alert_threshold: 80,
					periodic_reset: "monthly",
				},
				rate_limits: [{ type: "requests", unit: "rpm", value: 60 }],
				reset_usage: null,
				created_at: "2026-01-01T00:00:00.000Z",
				model_config: { foo: "bar" },
			},
		]);
	});
});

// ---------------------------------------------------------------------------
// create_virtual_key
// ---------------------------------------------------------------------------

describe("create_virtual_key", () => {
	it("maps azure fields, builds usage/rate limits, and extracts slug from result.data.slug", async () => {
		let capturedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						createVirtualKey: async (payload: unknown) => {
							capturedPayload = payload;
							return { success: true, data: { slug: "azure-prod" } };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_virtual_key");
		assert.ok(cb, "create_virtual_key should be registered");

		const result = (await cb({
			name: "Azure Prod",
			provider: "azure-openai",
			key: "raw-provider-key",
			note: "prod key",
			workspace_id: "ws_1",
			api_version: "2024-02-01",
			resource_name: "my-resource",
			deployment_name: "gpt4",
			credit_limit: 500,
			alert_threshold: 90,
			rate_limit_rpm: 120,
		})) as { content: Array<{ text: string }> };

		assert.deepEqual(capturedPayload, {
			name: "Azure Prod",
			provider: "azure-openai",
			key: "raw-provider-key",
			note: "prod key",
			workspace_id: "ws_1",
			apiVersion: "2024-02-01",
			resourceName: "my-resource",
			deploymentName: "gpt4",
			usage_limits: {
				type: "cost",
				periodic_reset: "monthly",
				credit_limit: 500,
				alert_threshold: 90,
			},
			rate_limits: [{ type: "requests", unit: "rpm", value: 120 }],
		});

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			message?: string;
			success?: boolean;
			slug?: string;
		};
		assert.equal(payload.success, true);
		assert.equal(payload.slug, "azure-prod");
		assert.match(payload.message ?? "", /Azure Prod/);
	});

	it("falls back to a top-level result.slug when data.slug is absent", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						createVirtualKey: async () => ({
							success: true,
							slug: "flat-response-slug",
						}),
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_virtual_key");
		assert.ok(cb);

		const result = (await cb({
			name: "Flat",
			provider: "openai",
			key: "k",
		})) as { content: Array<{ text: string }> };

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			slug?: string;
		};
		assert.equal(payload.slug, "flat-response-slug");
	});

	it("omits usage_limits and rate_limits when no limit params are given", async () => {
		let capturedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						createVirtualKey: async (payload: unknown) => {
							capturedPayload = payload;
							return { success: true, data: { slug: "bare" } };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_virtual_key");
		assert.ok(cb);
		await cb({ name: "Bare", provider: "openai", key: "k" });

		const payload = capturedPayload as {
			usage_limits?: unknown;
			rate_limits?: unknown;
		};
		assert.equal(payload.usage_limits, undefined);
		assert.equal(payload.rate_limits, undefined);
	});
});

// ---------------------------------------------------------------------------
// get_virtual_key
// ---------------------------------------------------------------------------

describe("get_virtual_key", () => {
	it("fetches by slug and returns the curated virtual key shape", async () => {
		let capturedSlug: string | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						getVirtualKey: async (slug: string) => {
							capturedSlug = slug;
							return {
								name: "OpenAI Prod",
								slug: "openai-prod",
								status: "active" as const,
								note: null,
								usage_limits: null,
								rate_limits: null,
								reset_usage: null,
								created_at: "2026-01-01T00:00:00.000Z",
								model_config: {},
								object: "virtual-key" as const,
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_virtual_key");
		assert.ok(cb, "get_virtual_key should be registered");

		const result = (await cb({ slug: "openai-prod" })) as {
			content: Array<{ text: string }>;
		};

		assert.equal(capturedSlug, "openai-prod");
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			name?: string;
			slug?: string;
			object?: string;
		};
		assert.equal(payload.name, "OpenAI Prod");
		assert.equal(payload.slug, "openai-prod");
		assert.equal(payload.object, undefined);
	});
});

// ---------------------------------------------------------------------------
// update_virtual_key
// ---------------------------------------------------------------------------

describe("update_virtual_key", () => {
	it("sends slug-addressed update payload and returns the updated summary", async () => {
		let capturedSlug: string | undefined;
		let capturedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						updateVirtualKey: async (slug: string, payload: unknown) => {
							capturedSlug = slug;
							capturedPayload = payload;
							return {
								name: "Renamed",
								slug: "openai-prod",
								status: "active" as const,
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("update_virtual_key");
		assert.ok(cb, "update_virtual_key should be registered");

		const result = (await cb({
			slug: "openai-prod",
			name: "Renamed",
			credit_limit: 200,
			alert_threshold: 75,
			rate_limit_rpm: 30,
		})) as { content: Array<{ text: string }> };

		assert.equal(capturedSlug, "openai-prod");
		assert.deepEqual(capturedPayload, {
			name: "Renamed",
			key: undefined,
			note: undefined,
			usage_limits: {
				type: "cost",
				periodic_reset: "monthly",
				credit_limit: 200,
				alert_threshold: 75,
			},
			rate_limits: [{ type: "requests", unit: "rpm", value: 30 }],
		});

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			name?: string;
			slug?: string;
			status?: string;
		};
		assert.equal(payload.name, "Renamed");
		assert.equal(payload.slug, "openai-prod");
		assert.equal(payload.status, "active");
	});
});

// ---------------------------------------------------------------------------
// delete_virtual_key
// ---------------------------------------------------------------------------

describe("delete_virtual_key", () => {
	it("deletes by slug and returns a success confirmation", async () => {
		let capturedSlug: string | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						deleteVirtualKey: async (slug: string) => {
							capturedSlug = slug;
							return { success: true };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("delete_virtual_key");
		assert.ok(cb, "delete_virtual_key should be registered");

		const result = (await cb({ slug: "openai-prod" })) as {
			content: Array<{ text: string }>;
		};

		assert.equal(capturedSlug, "openai-prod");
		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			message?: string;
			success?: boolean;
		};
		assert.equal(payload.success, true);
		assert.match(payload.message ?? "", /openai-prod/);
	});
});

// ---------------------------------------------------------------------------
// create_api_key
// ---------------------------------------------------------------------------

describe("create_api_key", () => {
	it("sends assembled defaults and limits, keyed by type/sub_type", async () => {
		let capturedArgs: unknown[] = [];
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						createApiKey: async (
							type: unknown,
							subType: unknown,
							payload: unknown,
						) => {
							capturedArgs = [type, subType, payload];
							return { id: "key_1", key: "secret-value" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_api_key");
		assert.ok(cb, "create_api_key should be registered");

		const result = (await cb({
			type: "workspace",
			sub_type: "user",
			name: "My Key",
			workspace_id: "ws_1",
			user_id: "user_1",
			scopes: ["logs.read"],
			credit_limit: 50,
			alert_threshold: 90,
			rate_limit_rpm: 10,
			default_config_id: "cfg_1",
			default_metadata: { env: "prod" },
			alert_emails: ["ops@example.com"],
			expires_at: "2027-01-01T00:00:00.000Z",
		})) as { content: Array<{ text: string }> };

		assert.deepEqual(capturedArgs[0], "workspace");
		assert.deepEqual(capturedArgs[1], "user");
		assert.deepEqual(capturedArgs[2], {
			name: "My Key",
			description: undefined,
			workspace_id: "ws_1",
			user_id: "user_1",
			scopes: ["logs.read"],
			usage_limits: {
				type: "cost",
				periodic_reset: "monthly",
				credit_limit: 50,
				alert_threshold: 90,
			},
			rate_limits: [{ type: "requests", unit: "rpm", value: 10 }],
			defaults: { config_id: "cfg_1", metadata: { env: "prod" } },
			alert_emails: ["ops@example.com"],
			expires_at: "2027-01-01T00:00:00.000Z",
		});

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			id?: string;
			key?: string;
		};
		assert.equal(payload.id, "key_1");
		assert.equal(payload.key, "secret-value");
	});

	it("omits defaults when neither default_config_id nor default_metadata is given", async () => {
		let capturedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						createApiKey: async (
							_type: unknown,
							_subType: unknown,
							payload: unknown,
						) => {
							capturedPayload = payload;
							return { id: "key_2", key: "secret" };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_api_key");
		assert.ok(cb);
		await cb({
			type: "organisation",
			sub_type: "service",
			name: "Service Key",
			scopes: [],
		});

		const payload = capturedPayload as { defaults?: unknown };
		assert.equal(payload.defaults, undefined);
	});

	it("rejects a workspace-type key without workspace_id", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						createApiKey: async () => {
							throw new Error("should not be called");
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_api_key");
		assert.ok(cb);
		await assert.rejects(
			() =>
				cb({
					type: "workspace",
					sub_type: "service",
					name: "Missing workspace",
					scopes: [],
				}),
			(error: Error) => {
				// Without this the stub's own throw would satisfy assert.rejects,
				// so the test would still pass if validation stopped rejecting.
				assert.doesNotMatch(error.message, /should not be called/);
				assert.match(error.message, /workspace_id/i);
				return true;
			},
		);
	});

	it("rejects a user sub_type key without user_id", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						createApiKey: async () => {
							throw new Error("should not be called");
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("create_api_key");
		assert.ok(cb);
		await assert.rejects(
			() =>
				cb({
					type: "organisation",
					sub_type: "user",
					name: "Missing user",
					scopes: [],
				}),
			(error: Error) => {
				assert.doesNotMatch(error.message, /should not be called/);
				assert.match(error.message, /user_id/i);
				return true;
			},
		);
	});
});

// ---------------------------------------------------------------------------
// list_api_keys / get_api_key — the deliberate reset_usage asymmetry
// ---------------------------------------------------------------------------

describe("list_api_keys", () => {
	it("forwards pagination/workspace filter and omits reset_usage from summaries", async () => {
		let capturedParams: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						listApiKeys: async (params: unknown) => {
							capturedParams = params;
							return {
								total: 1,
								object: "list" as const,
								data: [
									{
										id: "key_1",
										name: "My Key",
										description: "desc",
										type: "workspace-user" as const,
										status: "active" as const,
										organisation_id: "org_1",
										workspace_id: "ws_1",
										user_id: "user_1",
										scopes: ["logs.read"],
										usage_limits: null,
										rate_limits: null,
										defaults: null,
										alert_emails: [],
										expires_at: null,
										reset_usage: 12345,
										created_at: "2026-01-01T00:00:00.000Z",
										last_updated_at: "2026-01-02T00:00:00.000Z",
										creation_mode: "api" as const,
										key: "must-not-leak",
										object: "api-key" as const,
									},
								],
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("list_api_keys");
		assert.ok(cb, "list_api_keys should be registered");

		const result = (await cb({
			page_size: 25,
			current_page: 1,
			workspace_id: "ws_1",
		})) as { content: Array<{ text: string }> };

		assert.deepEqual(capturedParams, {
			page_size: 25,
			current_page: 1,
			workspace_id: "ws_1",
		});

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			total?: number;
			api_keys?: Array<Record<string, unknown>>;
		};

		assert.equal(payload.total, 1);
		const summary = payload.api_keys?.[0];
		assert.ok(summary);
		// The asymmetry this refactor deliberately preserves: list summaries
		// never include reset_usage, unlike the single-key get_api_key shape.
		assert.equal("reset_usage" in summary, false);
		assert.equal(summary.key, undefined);
		assert.equal(summary.object, undefined);
		assert.deepEqual(summary, {
			id: "key_1",
			name: "My Key",
			description: "desc",
			type: "workspace-user",
			status: "active",
			organisation_id: "org_1",
			workspace_id: "ws_1",
			user_id: "user_1",
			scopes: ["logs.read"],
			usage_limits: null,
			rate_limits: null,
			defaults: null,
			alert_emails: [],
			expires_at: null,
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
			creation_mode: "api",
		});
	});
});

describe("get_api_key", () => {
	it("returns the single-key shape including reset_usage between expires_at and created_at", async () => {
		let capturedId: string | undefined;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						getApiKey: async (id: string) => {
							capturedId = id;
							return {
								id: "key_1",
								name: "My Key",
								description: "desc",
								type: "workspace-user" as const,
								status: "active" as const,
								organisation_id: "org_1",
								workspace_id: "ws_1",
								user_id: "user_1",
								scopes: ["logs.read"],
								usage_limits: null,
								rate_limits: null,
								defaults: null,
								alert_emails: [],
								expires_at: null,
								reset_usage: 999,
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-02T00:00:00.000Z",
								creation_mode: "api" as const,
								key: "must-not-leak",
								object: "api-key" as const,
							};
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("get_api_key");
		assert.ok(cb, "get_api_key should be registered");

		const result = (await cb({
			id: "550e8400-e29b-41d4-a716-446655440000",
		})) as { content: Array<{ text: string }> };

		assert.equal(capturedId, "550e8400-e29b-41d4-a716-446655440000");

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as Record<
			string,
			unknown
		>;
		assert.equal("reset_usage" in payload, true);
		assert.equal(payload.reset_usage, 999);
		assert.equal(payload.key, undefined);
		assert.equal(payload.object, undefined);

		// reset_usage sits between expires_at and created_at in JSON field order,
		// per formatApiKey's literal — this is the counterpart assertion to the
		// list_api_keys omission above.
		const keys = Object.keys(payload);
		const expiresAtIndex = keys.indexOf("expires_at");
		const resetUsageIndex = keys.indexOf("reset_usage");
		const createdAtIndex = keys.indexOf("created_at");
		assert.ok(expiresAtIndex < resetUsageIndex);
		assert.ok(resetUsageIndex < createdAtIndex);
	});
});

// ---------------------------------------------------------------------------
// update_api_key
// ---------------------------------------------------------------------------

describe("update_api_key", () => {
	it("sends id-addressed update payload with assembled defaults and limits", async () => {
		let capturedId: string | undefined;
		let capturedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						updateApiKey: async (id: string, payload: unknown) => {
							capturedId = id;
							capturedPayload = payload;
							return { success: true };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("update_api_key");
		assert.ok(cb, "update_api_key should be registered");

		const result = (await cb({
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Renamed Key",
			scopes: ["logs.read", "analytics.read"],
			credit_limit: 300,
			alert_threshold: 85,
			rate_limit_rpm: 45,
			default_config_id: "cfg_2",
			expires_at: null,
		})) as { content: Array<{ text: string }> };

		assert.equal(capturedId, "550e8400-e29b-41d4-a716-446655440000");
		assert.deepEqual(capturedPayload, {
			name: "Renamed Key",
			description: undefined,
			scopes: ["logs.read", "analytics.read"],
			usage_limits: {
				type: "cost",
				periodic_reset: "monthly",
				credit_limit: 300,
				alert_threshold: 85,
			},
			rate_limits: [{ type: "requests", unit: "rpm", value: 45 }],
			defaults: { config_id: "cfg_2", metadata: undefined },
			alert_emails: undefined,
			expires_at: null,
		});

		const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
			message?: string;
			success?: boolean;
		};
		assert.equal(payload.success, true);
		assert.match(payload.message ?? "", /550e8400-e29b-41d4-a716-446655440000/);
	});

	it("omits defaults when neither default_config_id nor default_metadata is provided", async () => {
		let capturedPayload: unknown;
		const callbacks = registerToolCallbacks((server) => {
			registerKeysTools(
				server as never,
				{
					keys: {
						updateApiKey: async (_id: string, payload: unknown) => {
							capturedPayload = payload;
							return { success: true };
						},
					},
				} as never,
			);
		});

		const cb = callbacks.get("update_api_key");
		assert.ok(cb);
		await cb({
			id: "550e8400-e29b-41d4-a716-446655440000",
			name: "Just rename",
		});

		const payload = capturedPayload as { defaults?: unknown };
		assert.equal(payload.defaults, undefined);
	});
});
