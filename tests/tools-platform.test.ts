/**
 * Unit tests for platform tool modules with zero coverage:
 * - src/tools/mcp-integrations.tools.ts
 * - src/tools/mcp-servers.tools.ts
 * - src/tools/workspaces.tools.ts
 *
 * Follows the stub-service pattern established in tests/unit.test.ts:
 *   - captureServiceRequest() stubs BaseService HTTP methods and captures the request
 *   - registerToolCallbacks() harvests the final callback from each tool() registration
 *   - Stub responses are injected via the service facade argument to register*Tools()
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BaseService } from "../src/services/base.service.js";
import { McpIntegrationsService } from "../src/services/mcp-integrations.service.js";
import { McpServersService } from "../src/services/mcp-servers.service.js";
import { WorkspacesService } from "../src/services/workspaces.service.js";
import { registerMcpIntegrationsTools } from "../src/tools/mcp-integrations.tools.js";
import { registerMcpServersTools } from "../src/tools/mcp-servers.tools.js";
import { registerWorkspacesTools } from "../src/tools/workspaces.tools.js";

// ---------------------------------------------------------------------------
// Shared helpers (mirrors unit.test.ts pattern exactly)
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
// MCP Integrations — service path encoding
// ---------------------------------------------------------------------------

describe("McpIntegrationsService path encoding", () => {
	it("encodes id with slash and space when calling getMcpIntegration", async () => {
		const request = await captureServiceRequest(() =>
			new McpIntegrationsService("test-dummy-key").getMcpIntegration(
				"int/slug one",
			),
		);

		assert.equal(request.method, "GET");
		assert.equal(request.path, "/mcp-integrations/int%2Fslug%20one");
	});

	it("encodes id when calling deleteMcpIntegration", async () => {
		const request = await captureServiceRequest(() =>
			new McpIntegrationsService("test-dummy-key").deleteMcpIntegration(
				"int/id with space",
			),
		);

		assert.equal(request.method, "DELETE");
		assert.equal(request.path, "/mcp-integrations/int%2Fid%20with%20space");
	});

	it("encodes id when calling getMcpIntegrationMetadata", async () => {
		const request = await captureServiceRequest(() =>
			new McpIntegrationsService("test-dummy-key").getMcpIntegrationMetadata(
				"int/meta id",
			),
		);

		assert.equal(request.method, "GET");
		assert.equal(request.path, "/mcp-integrations/int%2Fmeta%20id/metadata");
	});
});

// ---------------------------------------------------------------------------
// MCP Servers — service path encoding
// ---------------------------------------------------------------------------

describe("McpServersService path encoding", () => {
	it("encodes id containing a slash and space in getMcpServer", async () => {
		const request = await captureServiceRequest(() =>
			new McpServersService("test-dummy-key").getMcpServer("srv/slug one"),
		);

		assert.equal(request.method, "GET");
		assert.equal(request.path, "/mcp-servers/srv%2Fslug%20one");
	});

	it("encodes id in listMcpServerCapabilities nested path", async () => {
		const request = await captureServiceRequest(() =>
			new McpServersService("test-dummy-key").listMcpServerCapabilities(
				"srv/cap id",
			),
		);

		assert.equal(request.method, "GET");
		assert.equal(request.path, "/mcp-servers/srv%2Fcap%20id/capabilities");
	});

	it("encodes id in testMcpServer nested path", async () => {
		const request = await captureServiceRequest(() =>
			new McpServersService("test-dummy-key").testMcpServer("srv/test id"),
		);

		assert.equal(request.method, "POST");
		assert.equal(request.path, "/mcp-servers/srv%2Ftest%20id/test");
	});

	it("encodes id in listMcpServerUserAccess nested path", async () => {
		const request = await captureServiceRequest(() =>
			new McpServersService("test-dummy-key").listMcpServerUserAccess(
				"srv/user id",
			),
		);

		assert.equal(request.method, "GET");
		assert.equal(request.path, "/mcp-servers/srv%2Fuser%20id/user-access");
	});
});

// ---------------------------------------------------------------------------
// create_mcp_integration — request payload assembly
// ---------------------------------------------------------------------------

describe("create_mcp_integration tool payload assembly", () => {
	it("sends full payload with custom_headers mapped to configurations", async () => {
		const request = await captureServiceRequest(() =>
			new McpIntegrationsService("test-dummy-key").createMcpIntegration({
				name: "My Integration",
				url: "https://mcp.example.com/v1",
				auth_type: "headers",
				transport: "http",
				slug: "my-integration",
				description: "Test integration",
				workspace_id: "ws-1",
				configurations: {
					custom_headers: { Authorization: "Bearer secret" },
				},
			}),
		);

		assert.equal(request.method, "POST");
		assert.equal(request.path, "/mcp-integrations");
		assert.deepEqual(request.body, {
			name: "My Integration",
			url: "https://mcp.example.com/v1",
			auth_type: "headers",
			transport: "http",
			slug: "my-integration",
			description: "Test integration",
			workspace_id: "ws-1",
			configurations: {
				custom_headers: { Authorization: "Bearer secret" },
			},
		});
	});

	it("maps custom_headers to configurations.custom_headers via tool callback", async () => {
		let capturedPayload: unknown;

		const callbacks = registerToolCallbacks((server) => {
			registerMcpIntegrationsTools(
				server as never,
				{
					mcpIntegrations: {
						createMcpIntegration: async (payload: unknown) => {
							capturedPayload = payload;
							return { id: "int-1", slug: "my-integration" };
						},
					},
				} as never,
			);
		});

		const createCallback = callbacks.get("create_mcp_integration");
		assert.ok(
			createCallback,
			"expected create_mcp_integration to be registered",
		);

		await createCallback({
			name: "My Integration",
			url: "https://mcp.example.com/v1",
			auth_type: "headers",
			transport: "http",
			custom_headers: { Authorization: "Bearer secret" },
		});

		// Optional fields with undefined values are spread-omitted by the tool callback
		assert.deepEqual(capturedPayload, {
			name: "My Integration",
			url: "https://mcp.example.com/v1",
			auth_type: "headers",
			transport: "http",
			configurations: { custom_headers: { Authorization: "Bearer secret" } },
		});
	});

	it("returns an isError result when auth_type is headers but custom_headers are missing", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpIntegrationsTools(server as never, {} as never);
		});

		const createCallback = callbacks.get("create_mcp_integration");
		assert.ok(
			createCallback,
			"expected create_mcp_integration to be registered",
		);

		const result = (await createCallback({
			name: "Bad Integration",
			url: "https://mcp.example.com/v1",
			auth_type: "headers",
			transport: "http",
		})) as { isError?: boolean; content: Array<{ text: string }> };

		assert.equal(result.isError, true);
		assert.match(result.content[0]?.text || "", /custom_headers/);
	});
});

// ---------------------------------------------------------------------------
// get_mcp_integration — curated response shape
// ---------------------------------------------------------------------------

describe("get_mcp_integration curated response shape", () => {
	it("omits raw object field and surfaces configuration_keys and custom_header_names", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpIntegrationsTools(
				server as never,
				{
					mcpIntegrations: {
						getMcpIntegration: async () => ({
							id: "int-1",
							name: "My Integration",
							slug: "my-integration",
							description: "Test",
							owner_id: "user-1",
							workspace_id: "ws-1",
							status: "active" as const,
							url: "https://mcp.example.com/v1",
							auth_type: "headers",
							transport: "http",
							type: "workspace" as const,
							global_workspace_access: true,
							configurations: {
								custom_headers: { Authorization: "Bearer xxx" },
								some_other_key: "value",
							},
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							object: "mcp-integration" as const,
						}),
					},
				} as never,
			);
		});

		const getCallback = callbacks.get("get_mcp_integration");
		assert.ok(getCallback, "expected get_mcp_integration to be registered");

		const result = (await getCallback({ id: "int-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			name?: string;
			object?: string;
			configurations?: unknown;
			configuration_keys?: string[];
			custom_header_names?: string[];
		};

		assert.equal(payload.id, "int-1");
		assert.equal(payload.name, "My Integration");
		// raw object and configurations must be stripped
		assert.equal(payload.object, undefined);
		assert.equal(payload.configurations, undefined);
		// derived fields must be present
		assert.deepEqual(payload.configuration_keys?.sort(), [
			"custom_headers",
			"some_other_key",
		]);
		assert.deepEqual(payload.custom_header_names, ["Authorization"]);
	});
});

// ---------------------------------------------------------------------------
// list_mcp_integrations — curated response shape
// ---------------------------------------------------------------------------

describe("list_mcp_integrations curated response shape", () => {
	it("returns total, has_more, and formatted integration list", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpIntegrationsTools(
				server as never,
				{
					mcpIntegrations: {
						listMcpIntegrations: async () => ({
							object: "list" as const,
							total: 3,
							has_more: true,
							data: [
								{
									id: "int-1",
									name: "Integration One",
									slug: "integration-one",
									owner_id: "user-1",
									status: "active" as const,
									url: "https://mcp1.example.com",
									auth_type: "none",
									transport: "http",
									configurations: undefined,
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: null,
									object: "mcp-integration" as const,
								},
							],
						}),
					},
				} as never,
			);
		});

		const listCallback = callbacks.get("list_mcp_integrations");
		assert.ok(listCallback, "expected list_mcp_integrations to be registered");

		const result = (await listCallback({})) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			has_more?: boolean;
			integrations?: Array<{ id: string; object?: string }>;
		};

		assert.equal(payload.total, 3);
		assert.equal(payload.has_more, true);
		assert.equal(payload.integrations?.length, 1);
		assert.equal(payload.integrations?.[0]?.id, "int-1");
		// raw 'object' field must not leak through
		assert.equal(payload.integrations?.[0]?.object, undefined);
	});
});

// ---------------------------------------------------------------------------
// update_mcp_integration — request payload assembly
// ---------------------------------------------------------------------------

describe("update_mcp_integration tool payload assembly", () => {
	it("sends only provided fields and maps custom_headers into configurations", async () => {
		let capturedId: string | undefined;
		let capturedPayload: unknown;

		const callbacks = registerToolCallbacks((server) => {
			registerMcpIntegrationsTools(
				server as never,
				{
					mcpIntegrations: {
						updateMcpIntegration: async (
							id: string,
							payload: unknown,
						): Promise<{ success: boolean }> => {
							capturedId = id;
							capturedPayload = payload;
							return { success: true };
						},
					},
				} as never,
			);
		});

		const updateCallback = callbacks.get("update_mcp_integration");
		assert.ok(
			updateCallback,
			"expected update_mcp_integration to be registered",
		);

		await updateCallback({
			id: "int-1",
			name: "Renamed Integration",
			custom_headers: { "X-Api-Key": "new-key" },
		});

		assert.equal(capturedId, "int-1");
		assert.deepEqual(capturedPayload, {
			name: "Renamed Integration",
			configurations: { custom_headers: { "X-Api-Key": "new-key" } },
		});
	});
});

// ---------------------------------------------------------------------------
// get_mcp_integration_metadata — curated response shape
// ---------------------------------------------------------------------------

describe("get_mcp_integration_metadata curated response shape", () => {
	it("surfaces sync_status, icon_count and capability_flags while dropping raw fields", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpIntegrationsTools(
				server as never,
				{
					mcpIntegrations: {
						getMcpIntegrationMetadata: async () => ({
							server_name: "My Server",
							server_version: "1.2.3",
							title: "My Server Title",
							description: "A description",
							website_url: "https://example.com",
							icons: [
								{ url: "https://icon.example.com/icon.png" },
								{ url: "x" },
							],
							protocol_version: "2025-03",
							capability_flags: { tools: true, prompts: false },
							instructions: "Use this integration for X",
							sync_status: "synced" as const,
							last_synced_at: "2026-01-01T00:00:00.000Z",
							sync_error: null,
							object: "metadata" as const,
						}),
					},
				} as never,
			);
		});

		const metadataCallback = callbacks.get("get_mcp_integration_metadata");
		assert.ok(
			metadataCallback,
			"expected get_mcp_integration_metadata to be registered",
		);

		const result = (await metadataCallback({ id: "int-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			server_name?: string;
			icon_count?: number;
			capability_flags?: unknown;
			sync_status?: string;
			object?: string;
			icons?: unknown;
		};

		assert.equal(payload.server_name, "My Server");
		assert.equal(payload.icon_count, 2);
		assert.deepEqual(payload.capability_flags, { tools: true, prompts: false });
		assert.equal(payload.sync_status, "synced");
		// raw fields must be stripped
		assert.equal(payload.object, undefined);
		assert.equal(payload.icons, undefined);
	});
});

// ---------------------------------------------------------------------------
// create_mcp_server — request payload assembly
// ---------------------------------------------------------------------------

describe("create_mcp_server tool payload assembly", () => {
	it("sends full payload via tool callback and returns id and slug", async () => {
		let capturedPayload: unknown;

		const callbacks = registerToolCallbacks((server) => {
			registerMcpServersTools(
				server as never,
				{
					mcpServers: {
						createMcpServer: async (payload: unknown) => {
							capturedPayload = payload;
							return { id: "srv-1", slug: "my-server" };
						},
					},
				} as never,
			);
		});

		const createCallback = callbacks.get("create_mcp_server");
		assert.ok(createCallback, "expected create_mcp_server to be registered");

		const result = (await createCallback({
			name: "My Server",
			mcp_integration_id: "int-1",
			slug: "my-server",
			description: "A test server",
		})) as { content: Array<{ text: string }> };

		assert.deepEqual(capturedPayload, {
			name: "My Server",
			mcp_integration_id: "int-1",
			slug: "my-server",
			description: "A test server",
		});

		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			slug?: string;
		};
		assert.equal(payload.id, "srv-1");
		assert.equal(payload.slug, "my-server");
	});

	it("sends the correct POST request to /mcp-servers at the service layer", async () => {
		const request = await captureServiceRequest(() =>
			new McpServersService("test-dummy-key").createMcpServer({
				name: "My Server",
				mcp_integration_id: "int-1",
			}),
		);

		assert.equal(request.method, "POST");
		assert.equal(request.path, "/mcp-servers");
		assert.deepEqual(request.body, {
			name: "My Server",
			mcp_integration_id: "int-1",
		});
	});
});

// ---------------------------------------------------------------------------
// get_mcp_server — curated response shape
// ---------------------------------------------------------------------------

describe("get_mcp_server curated response shape", () => {
	it("returns formatted server record and drops the raw object field", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpServersTools(
				server as never,
				{
					mcpServers: {
						getMcpServer: async () => ({
							id: "srv-1",
							name: "My Server",
							slug: "my-server",
							description: "A server",
							mcp_integration_id: "int-1",
							status: "active" as const,
							created_at: "2026-01-01T00:00:00.000Z",
							object: "mcp-server" as const,
						}),
					},
				} as never,
			);
		});

		const getCallback = callbacks.get("get_mcp_server");
		assert.ok(getCallback, "expected get_mcp_server to be registered");

		const result = (await getCallback({ id: "srv-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			name?: string;
			slug?: string;
			mcp_integration_id?: string;
			status?: string;
			created_at?: string;
			object?: string;
		};

		assert.equal(payload.id, "srv-1");
		assert.equal(payload.name, "My Server");
		assert.equal(payload.slug, "my-server");
		assert.equal(payload.mcp_integration_id, "int-1");
		assert.equal(payload.status, "active");
		assert.equal(payload.created_at, "2026-01-01T00:00:00.000Z");
		// raw object field must be stripped
		assert.equal(payload.object, undefined);
	});
});

// ---------------------------------------------------------------------------
// list_mcp_server_capabilities — has_more surfaced in tool output
// ---------------------------------------------------------------------------

describe("list_mcp_server_capabilities has_more in tool output", () => {
	it("surfaces has_more from the stubbed response", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpServersTools(
				server as never,
				{
					mcpServers: {
						listMcpServerCapabilities: async () => ({
							object: "list" as const,
							counts: {
								tools: { total: 5, enabled: 3 },
								prompts: { total: 1, enabled: 1 },
								resources: { total: 0, enabled: 0 },
								resource_templates: { total: 0, enabled: 0 },
							},
							total: 6,
							has_more: true,
							data: [
								{
									name: "search",
									type: "tool" as const,
									enabled: true,
									description: "Search tool",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: null,
								},
							],
						}),
					},
				} as never,
			);
		});

		const capabilitiesCallback = callbacks.get("list_mcp_server_capabilities");
		assert.ok(
			capabilitiesCallback,
			"expected list_mcp_server_capabilities to be registered",
		);

		const result = (await capabilitiesCallback({ id: "srv-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			has_more?: boolean;
			capabilities?: Array<{ name: string }>;
		};

		assert.equal(payload.total, 6);
		assert.equal(payload.has_more, true);
		assert.equal(payload.capabilities?.length, 1);
		assert.equal(payload.capabilities?.[0]?.name, "search");
	});

	it("surfaces has_more: false when there are no more pages", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpServersTools(
				server as never,
				{
					mcpServers: {
						listMcpServerCapabilities: async () => ({
							object: "list" as const,
							counts: {
								tools: { total: 2, enabled: 2 },
								prompts: { total: 0, enabled: 0 },
								resources: { total: 0, enabled: 0 },
								resource_templates: { total: 0, enabled: 0 },
							},
							total: 2,
							has_more: false,
							data: [],
						}),
					},
				} as never,
			);
		});

		const capabilitiesCallback = callbacks.get("list_mcp_server_capabilities");
		assert.ok(capabilitiesCallback);

		const result = (await capabilitiesCallback({ id: "srv-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			has_more?: boolean;
		};

		assert.equal(payload.has_more, false);
	});
});

// ---------------------------------------------------------------------------
// list_mcp_server_user_access — curated response shape
// ---------------------------------------------------------------------------

describe("list_mcp_server_user_access curated response shape", () => {
	it("formats user access records with full name and drops raw object field", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerMcpServersTools(
				server as never,
				{
					mcpServers: {
						listMcpServerUserAccess: async () => ({
							object: "list" as const,
							default_user_access: "enabled",
							total: 2,
							has_more: false,
							data: [
								{
									user_id: "user-1",
									first_name: "Ada",
									last_name: "Lovelace",
									enabled: true,
									has_override: false,
									connection_status: "connected",
									object: "user-acces" as const,
								},
								{
									user_id: "user-2",
									first_name: "Grace",
									last_name: "Hopper",
									enabled: false,
									has_override: true,
									connection_status: "disconnected",
									object: "user-acces" as const,
								},
							],
						}),
					},
				} as never,
			);
		});

		const userAccessCallback = callbacks.get("list_mcp_server_user_access");
		assert.ok(
			userAccessCallback,
			"expected list_mcp_server_user_access to be registered",
		);

		const result = (await userAccessCallback({ id: "srv-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			default_user_access?: string;
			total?: number;
			has_more?: boolean;
			users?: Array<{
				user_id: string;
				name: string;
				enabled: boolean;
				has_override: boolean;
				connection_status: string;
				object?: string;
			}>;
		};

		assert.equal(payload.default_user_access, "enabled");
		assert.equal(payload.total, 2);
		assert.equal(payload.has_more, false);
		assert.equal(payload.users?.length, 2);

		assert.deepEqual(payload.users?.[0], {
			user_id: "user-1",
			name: "Ada Lovelace",
			enabled: true,
			has_override: false,
			connection_status: "connected",
		});
		assert.deepEqual(payload.users?.[1], {
			user_id: "user-2",
			name: "Grace Hopper",
			enabled: false,
			has_override: true,
			connection_status: "disconnected",
		});

		// raw object field must not appear on user records
		assert.equal(payload.users?.[0]?.object, undefined);
	});
});

// ---------------------------------------------------------------------------
// create_workspace — request payload assembly
// ---------------------------------------------------------------------------

describe("create_workspace tool payload assembly", () => {
	it("sends name and defaults object when is_default and metadata are provided", async () => {
		let capturedPayload: unknown;

		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						createWorkspace: async (payload: unknown) => {
							capturedPayload = payload;
							return {
								id: "ws-1",
								name: "Eng Workspace",
								slug: "eng-workspace",
								description: "Engineering",
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-01T00:00:00.000Z",
								defaults: {
									is_default: 1,
									metadata: { team: "eng" },
									object: "workspace" as const,
								},
								object: "workspace" as const,
							};
						},
					},
				} as never,
			);
		});

		const createCallback = callbacks.get("create_workspace");
		assert.ok(createCallback, "expected create_workspace to be registered");

		await createCallback({
			name: "Eng Workspace",
			slug: "eng-workspace",
			description: "Engineering",
			is_default: 1,
			metadata: { team: "eng" },
		});

		assert.deepEqual(capturedPayload, {
			name: "Eng Workspace",
			slug: "eng-workspace",
			description: "Engineering",
			defaults: {
				is_default: 1,
				metadata: { team: "eng" },
			},
		});
	});

	it("omits defaults object when neither is_default nor metadata are provided", async () => {
		let capturedPayload: unknown;

		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						createWorkspace: async (payload: unknown) => {
							capturedPayload = payload;
							return {
								id: "ws-2",
								name: "Bare Workspace",
								slug: "bare-workspace",
								description: null,
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-01T00:00:00.000Z",
								defaults: null,
								object: "workspace" as const,
							};
						},
					},
				} as never,
			);
		});

		const createCallback = callbacks.get("create_workspace");
		assert.ok(createCallback);

		await createCallback({ name: "Bare Workspace" });

		assert.deepEqual(capturedPayload, {
			name: "Bare Workspace",
			slug: undefined,
			description: undefined,
			defaults: undefined,
		});
	});
});

// ---------------------------------------------------------------------------
// list_workspaces — curated response shape
// ---------------------------------------------------------------------------

describe("list_workspaces curated response shape", () => {
	it("returns total and formatted workspace summaries without raw object wrappers", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						listWorkspaces: async () => ({
							total: 2,
							object: "list" as const,
							data: [
								{
									id: "ws-1",
									name: "Eng Workspace",
									slug: "eng-workspace",
									description: "Engineering",
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
									defaults: {
										is_default: 1,
										metadata: { team: "eng" },
										object: "workspace" as const,
									},
									object: "workspace" as const,
								},
								{
									id: "ws-2",
									name: "Sales Workspace",
									slug: "sales-workspace",
									description: null,
									created_at: "2026-01-03T00:00:00.000Z",
									last_updated_at: "2026-01-04T00:00:00.000Z",
									defaults: null,
									object: "workspace" as const,
								},
							],
						}),
					},
				} as never,
			);
		});

		const listCallback = callbacks.get("list_workspaces");
		assert.ok(listCallback, "expected list_workspaces to be registered");

		const result = (await listCallback({})) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			workspaces?: Array<{
				id: string;
				name: string;
				slug: string;
				defaults: {
					is_default?: number;
					metadata?: Record<string, string>;
				} | null;
				object?: string;
			}>;
			object?: string;
			data?: unknown;
		};

		assert.equal(payload.total, 2);
		// raw envelope fields must be stripped
		assert.equal(payload.object, undefined);
		assert.equal(payload.data, undefined);
		assert.equal(payload.workspaces?.length, 2);
		assert.equal(payload.workspaces?.[0]?.id, "ws-1");
		assert.equal(payload.workspaces?.[0]?.name, "Eng Workspace");
		// raw workspace object field must not leak through
		assert.equal(payload.workspaces?.[0]?.object, undefined);
		// defaults should be formatted (object key stripped)
		assert.deepEqual(payload.workspaces?.[0]?.defaults, {
			is_default: 1,
			metadata: { team: "eng" },
		});
		assert.equal(payload.workspaces?.[1]?.defaults, null);
	});
});

// ---------------------------------------------------------------------------
// get_workspace — curated response shape
// ---------------------------------------------------------------------------

describe("get_workspace curated response shape", () => {
	it("returns workspace detail with formatted member list including full names", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						getWorkspace: async () => ({
							id: "ws-1",
							name: "Eng Workspace",
							slug: "eng-workspace",
							description: "Engineering",
							created_at: "2026-01-01T00:00:00.000Z",
							last_updated_at: "2026-01-02T00:00:00.000Z",
							defaults: null,
							users: [
								{
									object: "workspace-user" as const,
									id: "user-1",
									first_name: "Ada",
									last_name: "Lovelace",
									org_role: "admin" as const,
									role: "admin" as const,
									status: "active" as const,
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
								},
							],
						}),
					},
				} as never,
			);
		});

		const getCallback = callbacks.get("get_workspace");
		assert.ok(getCallback, "expected get_workspace to be registered");

		const result = (await getCallback({ workspace_id: "ws-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			id?: string;
			users?: Array<{
				id: string;
				name: string;
				organization_role: string;
				workspace_role: string;
				status: string;
			}>;
		};

		assert.equal(payload.id, "ws-1");
		assert.equal(payload.users?.length, 1);
		assert.deepEqual(payload.users?.[0], {
			id: "user-1",
			name: "Ada Lovelace",
			organization_role: "admin",
			workspace_role: "admin",
			status: "active",
			created_at: "2026-01-01T00:00:00.000Z",
			last_updated_at: "2026-01-02T00:00:00.000Z",
		});
	});
});

// ---------------------------------------------------------------------------
// Workspace membership tools — add, list, update, remove
// ---------------------------------------------------------------------------

describe("Workspace membership tool payloads", () => {
	it("add_workspace_member sends user_id and role to the service", async () => {
		let capturedWorkspaceId: string | undefined;
		let capturedPayload: unknown;

		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						addWorkspaceMember: async (
							workspaceId: string,
							payload: unknown,
						) => {
							capturedWorkspaceId = workspaceId;
							capturedPayload = payload;
							return {
								object: "workspace-user" as const,
								id: "user-1",
								first_name: "Ada",
								last_name: "Lovelace",
								org_role: "admin" as const,
								role: "admin" as const,
								status: "active" as const,
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-01T00:00:00.000Z",
							};
						},
					},
				} as never,
			);
		});

		const addCallback = callbacks.get("add_workspace_member");
		assert.ok(addCallback, "expected add_workspace_member to be registered");

		await addCallback({
			workspace_id: "ws-1",
			user_id: "00000000-0000-0000-0000-000000000001",
			role: "admin",
		});

		assert.equal(capturedWorkspaceId, "ws-1");
		assert.deepEqual(capturedPayload, {
			user_id: "00000000-0000-0000-0000-000000000001",
			role: "admin",
		});
	});

	it("update_workspace_member sends role to the service", async () => {
		let capturedRole: string | undefined;

		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						updateWorkspaceMember: async (
							_workspaceId: string,
							_userId: string,
							data: { role: string },
						) => {
							capturedRole = data.role;
							return {
								object: "workspace-user" as const,
								id: "user-1",
								first_name: "Ada",
								last_name: "Lovelace",
								org_role: "admin" as const,
								role: "manager" as const,
								status: "active" as const,
								created_at: "2026-01-01T00:00:00.000Z",
								last_updated_at: "2026-01-02T00:00:00.000Z",
							};
						},
					},
				} as never,
			);
		});

		const updateCallback = callbacks.get("update_workspace_member");
		assert.ok(
			updateCallback,
			"expected update_workspace_member to be registered",
		);

		await updateCallback({
			workspace_id: "ws-1",
			user_id: "user-1",
			role: "manager",
		});

		assert.equal(capturedRole, "manager");
	});

	it("list_workspace_members returns formatted member list with full names", async () => {
		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						listWorkspaceMembers: async () => ({
							total: 1,
							object: "list",
							data: [
								{
									object: "workspace-user" as const,
									id: "user-1",
									first_name: "Grace",
									last_name: "Hopper",
									org_role: "member" as const,
									role: "member" as const,
									status: "active" as const,
									created_at: "2026-01-01T00:00:00.000Z",
									last_updated_at: "2026-01-02T00:00:00.000Z",
								},
							],
						}),
					},
				} as never,
			);
		});

		const listCallback = callbacks.get("list_workspace_members");
		assert.ok(listCallback, "expected list_workspace_members to be registered");

		const result = (await listCallback({ workspace_id: "ws-1" })) as {
			content: Array<{ text: string }>;
		};
		const payload = JSON.parse(result.content[0]?.text || "{}") as {
			total?: number;
			members?: Array<{ name: string }>;
		};

		assert.equal(payload.total, 1);
		assert.equal(payload.members?.[0]?.name, "Grace Hopper");
	});
});

// ---------------------------------------------------------------------------
// WorkspacesService path encoding
// ---------------------------------------------------------------------------

describe("WorkspacesService path encoding", () => {
	it("encodes workspace_id with slash and space in getWorkspace", async () => {
		const request = await captureServiceRequest(() =>
			new WorkspacesService("test-dummy-key").getWorkspace("ws/slug one"),
		);

		assert.equal(request.method, "GET");
		assert.equal(request.path, "/admin/workspaces/ws%2Fslug%20one");
	});

	it("encodes workspace_id and user_id in getWorkspaceMember", async () => {
		const request = await captureServiceRequest(() =>
			new WorkspacesService("test-dummy-key").getWorkspaceMember(
				"ws/slug one",
				"user/id two",
			),
		);

		assert.equal(request.method, "GET");
		assert.equal(
			request.path,
			"/admin/workspaces/ws%2Fslug%20one/users/user%2Fid%20two",
		);
	});

	it("encodes workspace_id in deleteWorkspace", async () => {
		const request = await captureServiceRequest(() =>
			new WorkspacesService("test-dummy-key").deleteWorkspace("ws/del id"),
		);

		assert.equal(request.method, "DELETE");
		assert.equal(request.path, "/admin/workspaces/ws%2Fdel%20id");
	});
});
