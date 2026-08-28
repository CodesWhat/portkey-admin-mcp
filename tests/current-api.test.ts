/**
 * Contract-first coverage for Portkey API surfaces added after the original
 * 156-tool inventory was declared complete.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { BaseService } from "../src/services/base.service.js";
import { GuardrailsService } from "../src/services/guardrails.service.js";
import { IntegrationsService } from "../src/services/integrations.service.js";
import { LoggingService } from "../src/services/logging.service.js";
import { McpServersService } from "../src/services/mcp-servers.service.js";
import { WorkspacesService } from "../src/services/workspaces.service.js";
import { registerGuardrailsTools } from "../src/tools/guardrails.tools.js";
import { registerIntegrationsTools } from "../src/tools/integrations.tools.js";
import { registerKeysTools } from "../src/tools/keys.tools.js";
import { registerLoggingTools } from "../src/tools/logging.tools.js";
import { registerMcpIntegrationsTools } from "../src/tools/mcp-integrations.tools.js";
import { registerMcpServersTools } from "../src/tools/mcp-servers.tools.js";
import { registerWorkspacesTools } from "../src/tools/workspaces.tools.js";
import { registerToolCallbacks } from "./helpers/tool-registry.js";

type CapturedRequest = {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	params?: object;
	body?: unknown;
};

async function captureServiceRequest(
	invoke: () => Promise<unknown>,
): Promise<CapturedRequest> {
	const basePrototype = BaseService.prototype as unknown as {
		get: (path: string, params?: object) => Promise<unknown>;
		post: (path: string, body?: unknown) => Promise<unknown>;
		put: (path: string, body?: unknown) => Promise<unknown>;
		delete: (path: string, params?: object) => Promise<unknown>;
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
	basePrototype.delete = async (path: string, params?: object) => {
		captured = { method: "DELETE", path, params };
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

async function capturePublicServiceRequest(
	invoke: () => Promise<unknown>,
): Promise<{ path: string; params?: object }> {
	const basePrototype = BaseService.prototype as unknown as {
		getPublic?: (path: string, params?: object) => Promise<unknown>;
	};
	const original = basePrototype.getPublic;
	let captured: { path: string; params?: object } | undefined;
	basePrototype.getPublic = async (path: string, params?: object) => {
		captured = { path, params };
		return {};
	};

	try {
		await invoke();
		assert.ok(captured, "expected a public service request to be captured");
		return captured;
	} finally {
		if (original) {
			basePrototype.getPublic = original;
		} else {
			delete basePrototype.getPublic;
		}
	}
}

async function withMockServiceGet<T>(
	response: unknown,
	invoke: () => Promise<T>,
): Promise<T> {
	const basePrototype = BaseService.prototype as unknown as {
		get: (path: string, params?: object) => Promise<unknown>;
	};
	const original = basePrototype.get;
	basePrototype.get = async () => response;
	try {
		return await invoke();
	} finally {
		basePrototype.get = original;
	}
}

type CapturedToolDefinition = {
	description?: string;
	inputSchema?: unknown;
	annotations?: Record<string, unknown>;
};

function captureToolDefinitions(
	register: (server: {
		tool(name: string, ...rest: unknown[]): never;
		registerTool(
			name: string,
			config: Record<string, unknown>,
			callback: (...args: unknown[]) => Promise<unknown>,
		): never;
	}) => void,
): Map<string, CapturedToolDefinition> {
	const definitions = new Map<string, CapturedToolDefinition>();
	register({
		tool(name: string, ...rest: unknown[]) {
			const description =
				typeof rest[0] === "string" ? (rest[0] as string) : undefined;
			const offset = description === undefined ? 0 : 1;
			definitions.set(name, {
				description,
				inputSchema: rest[offset],
				annotations: rest.at(-2) as Record<string, unknown>,
			});
			return {} as never;
		},
		registerTool(name: string, config: Record<string, unknown>) {
			definitions.set(name, {
				description: config.description as string | undefined,
				inputSchema: config.inputSchema,
				annotations: config.annotations as Record<string, unknown> | undefined,
			});
			return {} as never;
		},
	});
	return definitions;
}

function safeParseToolInput(
	definition: CapturedToolDefinition | undefined,
	input: unknown,
): ReturnType<z.ZodType["safeParse"]> {
	assert.ok(definition?.inputSchema, "tool should declare an input schema");
	const inputSchema = definition.inputSchema as
		| z.ZodType
		| Record<string, z.ZodType>;
	const schema: z.ZodType =
		typeof (inputSchema as z.ZodType).safeParse === "function"
			? (inputSchema as z.ZodType)
			: z.object(inputSchema as Record<string, z.ZodType>);
	return schema.safeParse(input);
}

describe("current Portkey organisation guardrail APIs", () => {
	it("routes organisation default reads and updates", async () => {
		const service = new GuardrailsService(
			"test-dummy-key",
		) as GuardrailsService & {
			getOrganisationDefaults?: () => Promise<unknown>;
			updateOrganisationDefaults?: (body: unknown) => Promise<unknown>;
		};

		assert.equal(typeof service.getOrganisationDefaults, "function");
		assert.equal(typeof service.updateOrganisationDefaults, "function");

		const getRequest = await captureServiceRequest(
			() => service.getOrganisationDefaults?.() as Promise<unknown>,
		);
		assert.deepEqual(getRequest, {
			method: "GET",
			path: "/admin/organisation/defaults",
			params: undefined,
		});

		const body = {
			input_guardrails: ["guard-input"],
			output_guardrails: ["guard-output"],
		};
		const putRequest = await captureServiceRequest(
			() => service.updateOrganisationDefaults?.(body) as Promise<unknown>,
		);
		assert.deepEqual(putRequest, {
			method: "PUT",
			path: "/admin/organisation/defaults",
			body,
		});
	});

	it("routes directional workspace exclusion reads and updates", async () => {
		const service = new GuardrailsService(
			"test-dummy-key",
		) as GuardrailsService & {
			listWorkspaceExclusions?: (
				direction: "input" | "output",
				params: unknown,
			) => Promise<unknown>;
			updateWorkspaceExclusions?: (
				direction: "input" | "output",
				body: unknown,
			) => Promise<unknown>;
		};

		assert.equal(typeof service.listWorkspaceExclusions, "function");
		assert.equal(typeof service.updateWorkspaceExclusions, "function");

		const getRequest = await captureServiceRequest(
			() =>
				service.listWorkspaceExclusions?.("input", {
					organisation_id: "org-1",
				}) as Promise<unknown>,
		);
		assert.deepEqual(getRequest, {
			method: "GET",
			path: "/workspace-exclusions/input-guardrails",
			params: { organisation_id: "org-1" },
		});

		const body = {
			organisation_id: "org-1",
			workspaces: [{ workspace_id: "ws-1", excluded: true }],
			override_existing: true,
		};
		const putRequest = await captureServiceRequest(
			() =>
				service.updateWorkspaceExclusions?.("output", body) as Promise<unknown>,
		);
		assert.deepEqual(putRequest, {
			method: "PUT",
			path: "/workspace-exclusions/output-guardrails",
			body,
		});
	});

	it("registers tools for defaults and both exclusion directions", () => {
		const callbacks = registerToolCallbacks((server) => {
			registerGuardrailsTools(server as never, { guardrails: {} } as never);
		});

		for (const name of [
			"get_organisation_defaults",
			"update_organisation_defaults",
			"list_input_guardrail_workspace_exclusions",
			"update_input_guardrail_workspace_exclusions",
			"list_output_guardrail_workspace_exclusions",
			"update_output_guardrail_workspace_exclusions",
		]) {
			assert.ok(callbacks.has(name), `${name} should be registered`);
		}
	});

	it("forwards defaults and directional exclusion tool payloads", async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const callbacks = registerToolCallbacks((server) => {
			registerGuardrailsTools(
				server as never,
				{
					guardrails: {
						getOrganisationDefaults: async () => ({
							input_guardrails: [{ id: "g-1", slug: "input-check" }],
							output_guardrails: [],
						}),
						updateOrganisationDefaults: async (body: unknown) => {
							calls.push({
								method: "updateOrganisationDefaults",
								args: [body],
							});
							return { success: true };
						},
						listWorkspaceExclusions: async (...args: unknown[]) => {
							calls.push({ method: "listWorkspaceExclusions", args });
							return { workspaces: [] };
						},
						updateWorkspaceExclusions: async (...args: unknown[]) => {
							calls.push({ method: "updateWorkspaceExclusions", args });
							return { success: true };
						},
					},
				} as never,
			);
		});

		const updateDefaults = callbacks.get("update_organisation_defaults");
		assert.ok(updateDefaults);
		await updateDefaults({
			input_guardrails: ["input-check"],
			output_guardrails: ["output-check"],
		});

		const listOutput = callbacks.get(
			"list_output_guardrail_workspace_exclusions",
		);
		assert.ok(listOutput);
		await listOutput({ organisation_id: "org-1" });

		const updateInput = callbacks.get(
			"update_input_guardrail_workspace_exclusions",
		);
		assert.ok(updateInput);
		await updateInput({
			organisation_id: "org-1",
			workspaces: [{ workspace_id: "ws-1", excluded: true }],
			override_existing: true,
		});

		assert.deepEqual(calls, [
			{
				method: "updateOrganisationDefaults",
				args: [
					{
						input_guardrails: ["input-check"],
						output_guardrails: ["output-check"],
					},
				],
			},
			{
				method: "listWorkspaceExclusions",
				args: ["output", { organisation_id: "org-1" }],
			},
			{
				method: "updateWorkspaceExclusions",
				args: [
					"input",
					{
						organisation_id: "org-1",
						workspaces: [{ workspace_id: "ws-1", excluded: true }],
						override_existing: true,
					},
				],
			},
		]);
	});
});

describe("current Portkey log APIs", () => {
	it("routes individual log and export field restriction reads", async () => {
		const service = new LoggingService("test-dummy-key") as LoggingService & {
			getLog?: (logId: string, params: unknown) => Promise<unknown>;
			getLogExportFieldRestrictions?: (params: unknown) => Promise<unknown>;
		};

		assert.equal(typeof service.getLog, "function");
		assert.equal(typeof service.getLogExportFieldRestrictions, "function");

		const logRequest = await captureServiceRequest(
			() =>
				service.getLog?.("log/id", {
					path_format: "v2",
					created_at: "2026-08-09T12:00:00Z",
					type: "hooks",
				}) as Promise<unknown>,
		);
		assert.deepEqual(logRequest, {
			method: "GET",
			path: "/logs/log%2Fid",
			params: {
				path_format: "v2",
				created_at: "2026-08-09T12:00:00Z",
				type: "hooks",
			},
		});

		const restrictionsRequest = await captureServiceRequest(
			() =>
				service.getLogExportFieldRestrictions?.({
					workspace_id: "ws-1",
				}) as Promise<unknown>,
		);
		assert.deepEqual(restrictionsRequest, {
			method: "GET",
			path: "/logs/exports/field-restrictions",
			params: { workspace_id: "ws-1" },
		});
	});

	it("registers and forwards individual log and restriction tools", async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const callbacks = registerToolCallbacks((server) => {
			registerLoggingTools(
				server as never,
				{
					logging: {
						getLog: async (...args: unknown[]) => {
							calls.push({ method: "getLog", args });
							return { id: "log-1" };
						},
						getLogExportFieldRestrictions: async (...args: unknown[]) => {
							calls.push({ method: "getLogExportFieldRestrictions", args });
							return { restricted_fields: ["request"] };
						},
					},
				} as never,
			);
		});

		const getLog = callbacks.get("get_log");
		const getRestrictions = callbacks.get("get_log_export_field_restrictions");
		assert.ok(getLog);
		assert.ok(getRestrictions);

		await getLog({
			log_id: "log-1",
			path_format: "v2",
			created_at: "2026-08-09T12:00:00Z",
			type: "hooks",
		});
		await getRestrictions({ workspace_id: "ws-1" });

		assert.deepEqual(calls, [
			{
				method: "getLog",
				args: [
					"log-1",
					{
						path_format: "v2",
						created_at: "2026-08-09T12:00:00Z",
						type: "hooks",
					},
				],
			},
			{
				method: "getLogExportFieldRestrictions",
				args: [{ workspace_id: "ws-1" }],
			},
		]);
	});

	it("validates v2 log timestamps before invoking Portkey", async () => {
		const definitions = captureToolDefinitions((server) => {
			registerLoggingTools(server as never, {} as never);
		});
		const getLog = definitions.get("get_log");

		// The path_format/created_at pairing is a cross-field rule, so it lives in
		// the handler rather than the registered schema. That keeps its failure on
		// the same path as every other tool's, where wrapToolCallback formats it.
		const callbacks = registerToolCallbacks((server) => {
			registerLoggingTools(
				server as never,
				{
					logging: {
						getLog: async () => {
							assert.fail(
								"v2 log reads must not reach Portkey without created_at",
							);
						},
					},
				} as never,
			);
		});
		const getLogCallback = callbacks.get("get_log");
		assert.ok(getLogCallback);
		await assert.rejects(
			() => getLogCallback({ log_id: "log-1", path_format: "v2" }),
			/created_at is required when path_format is v2/,
		);

		assert.equal(
			safeParseToolInput(getLog, {
				log_id: "log-1",
				path_format: "v2",
				created_at: "not-a-timestamp",
			}).success,
			false,
			"created_at must be an ISO 8601 timestamp",
		);
		assert.equal(
			safeParseToolInput(getLog, {
				log_id: "log-1",
				path_format: "v2",
				created_at: "2026-08-09T12:00:00Z",
			}).success,
			true,
		);
		assert.equal(
			safeParseToolInput(getLog, { log_id: "log-1" }).success,
			true,
			"v1 log reads do not require created_at",
		);
	});
});

describe("current Portkey SCIM workspace APIs", () => {
	it("accepts Portkey's zero-based SCIM pagination and describes mapping side effects accurately", () => {
		const registrations = new Map<string, unknown[]>();
		registerWorkspacesTools(
			{
				tool(name: string, ...rest: unknown[]) {
					registrations.set(name, rest);
					return {} as never;
				},
				registerTool(
					name: string,
					config: Record<string, unknown>,
					callback: (...args: unknown[]) => Promise<unknown>,
				) {
					registrations.set(name, [
						config.description,
						config.inputSchema,
						config.annotations,
						callback,
					]);
					return {} as never;
				},
			} as never,
			{} as never,
		);

		for (const name of ["list_scim_workspace_mappings", "list_scim_groups"]) {
			const schema = registrations.get(name)?.[1] as
				| Record<string, { safeParse(value: unknown): { success: boolean } }>
				| undefined;
			assert.equal(
				schema?.page?.safeParse(0).success,
				true,
				`${name}.page should accept Portkey's first page (0)`,
			);
		}

		const createDescription = registrations.get(
			"create_scim_workspace_mapping",
		)?.[0];
		assert.match(
			String(createDescription),
			/pre-?create/i,
			"group-name mapping should explain that Portkey can pre-create the group",
		);

		const deleteDescription = registrations.get(
			"delete_scim_workspace_mapping",
		)?.[0];
		assert.match(String(deleteDescription), /members remain/i);
		assert.doesNotMatch(String(deleteDescription), /remove.*membership/i);
	});

	it("routes mapping CRUD and paginated group reads", async () => {
		const service = new WorkspacesService(
			"test-dummy-key",
		) as WorkspacesService & {
			listScimWorkspaceMappings?: (params: unknown) => Promise<unknown>;
			createScimWorkspaceMapping?: (body: unknown) => Promise<unknown>;
			deleteScimWorkspaceMapping?: (mappingId: string) => Promise<unknown>;
			listScimGroups?: (params: unknown) => Promise<unknown>;
		};

		for (const method of [
			service.listScimWorkspaceMappings,
			service.createScimWorkspaceMapping,
			service.deleteScimWorkspaceMapping,
			service.listScimGroups,
		]) {
			assert.equal(typeof method, "function");
		}

		const listParams = {
			workspace_id: "ws-1",
			scim_group_id: "group-1",
			role: "member",
			page: 2,
			page_size: 50,
		};
		assert.deepEqual(
			await captureServiceRequest(
				() =>
					service.listScimWorkspaceMappings?.(listParams) as Promise<unknown>,
			),
			{ method: "GET", path: "/scim/workspaces", params: listParams },
		);

		const createBody = {
			workspace_id: "ws-1",
			role: "manager",
			scim_group_name: "Engineering",
		};
		assert.deepEqual(
			await captureServiceRequest(
				() =>
					service.createScimWorkspaceMapping?.(createBody) as Promise<unknown>,
			),
			{ method: "POST", path: "/scim/workspaces", body: createBody },
		);

		assert.deepEqual(
			await captureServiceRequest(
				() =>
					service.deleteScimWorkspaceMapping?.("map/id") as Promise<unknown>,
			),
			{
				method: "DELETE",
				path: "/scim/workspaces/map%2Fid",
				params: undefined,
			},
		);

		const groupParams = { search: "eng", page: 3, page_size: 25 };
		assert.deepEqual(
			await captureServiceRequest(
				() => service.listScimGroups?.(groupParams) as Promise<unknown>,
			),
			{ method: "GET", path: "/scim/groups", params: groupParams },
		);
	});

	it("requires exactly one SCIM group selector", async () => {
		const definitions = captureToolDefinitions((server) => {
			registerWorkspacesTools(server as never, {} as never);
		});
		const createMapping = definitions.get("create_scim_workspace_mapping");
		const common = { workspace_id: "ws-1", role: "member" };

		// Exactly-one-of is a cross-field rule, so it lives in the handler rather
		// than the registered schema. That keeps its failure on the same path as
		// every other tool's, where wrapToolCallback formats it.
		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(
				server as never,
				{
					workspaces: {
						createScimWorkspaceMapping: async () => {
							assert.fail("ambiguous SCIM selectors must not reach Portkey");
						},
					},
				} as never,
			);
		});
		const createMappingCallback = callbacks.get(
			"create_scim_workspace_mapping",
		);
		assert.ok(createMappingCallback);
		const selectorError =
			/Provide exactly one of scim_group_id or scim_group_name/;

		await assert.rejects(() => createMappingCallback(common), selectorError);
		await assert.rejects(
			() =>
				createMappingCallback({
					...common,
					scim_group_id: "group-1",
					scim_group_name: "Engineering",
				}),
			selectorError,
		);

		assert.equal(
			safeParseToolInput(createMapping, {
				...common,
				scim_group_id: "group-1",
			}).success,
			true,
		);
		assert.equal(
			safeParseToolInput(createMapping, {
				...common,
				scim_group_name: "Engineering",
			}).success,
			true,
		);
	});

	it("registers and forwards SCIM mapping and group tools", async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const workspaces = {
			listScimWorkspaceMappings: async (...args: unknown[]) => {
				calls.push({ method: "listScimWorkspaceMappings", args });
				return { mappings: [], total_count: 0 };
			},
			createScimWorkspaceMapping: async (...args: unknown[]) => {
				calls.push({ method: "createScimWorkspaceMapping", args });
				return { id: "map-1" };
			},
			deleteScimWorkspaceMapping: async (...args: unknown[]) => {
				calls.push({ method: "deleteScimWorkspaceMapping", args });
				return { success: true };
			},
			listScimGroups: async (...args: unknown[]) => {
				calls.push({ method: "listScimGroups", args });
				return { groups: [], total_count: 0 };
			},
		};
		const callbacks = registerToolCallbacks((server) => {
			registerWorkspacesTools(server as never, { workspaces } as never);
		});

		for (const name of [
			"list_scim_workspace_mappings",
			"create_scim_workspace_mapping",
			"delete_scim_workspace_mapping",
			"list_scim_groups",
		]) {
			assert.ok(callbacks.has(name), `${name} should be registered`);
		}

		await callbacks.get("list_scim_workspace_mappings")?.({
			workspace_id: "ws-1",
			page: 2,
			page_size: 50,
		});
		await callbacks.get("create_scim_workspace_mapping")?.({
			workspace_id: "ws-1",
			role: "manager",
			scim_group_name: "Engineering",
		});
		await callbacks.get("delete_scim_workspace_mapping")?.({
			mapping_id: "map-1",
		});
		await callbacks.get("list_scim_groups")?.({
			search: "eng",
			page: 3,
			page_size: 25,
		});

		assert.deepEqual(calls, [
			{
				method: "listScimWorkspaceMappings",
				args: [{ workspace_id: "ws-1", page: 2, page_size: 50 }],
			},
			{
				method: "createScimWorkspaceMapping",
				args: [
					{
						workspace_id: "ws-1",
						role: "manager",
						scim_group_name: "Engineering",
					},
				],
			},
			{ method: "deleteScimWorkspaceMapping", args: ["map-1"] },
			{
				method: "listScimGroups",
				args: [{ search: "eng", page: 3, page_size: 25 }],
			},
		]);
	});
});

describe("current Portkey MCP server connection APIs", () => {
	it("routes paginated connection reads and disconnects", async () => {
		const service = new McpServersService(
			"test-dummy-key",
		) as McpServersService & {
			listMcpServerConnections?: (
				serverId: string,
				params: unknown,
			) => Promise<unknown>;
			disconnectMcpServerConnection?: (
				serverId: string,
				params: unknown,
			) => Promise<unknown>;
		};

		assert.equal(typeof service.listMcpServerConnections, "function");
		assert.equal(typeof service.disconnectMcpServerConnection, "function");

		const listParams = {
			user_id: "user-1",
			workspace_id: "ws-1",
			current_page: 0,
			page_size: 500,
		};
		assert.deepEqual(
			await captureServiceRequest(
				() =>
					service.listMcpServerConnections?.(
						"server/id",
						listParams,
					) as Promise<unknown>,
			),
			{
				method: "GET",
				path: "/mcp-servers/server%2Fid/connections",
				params: listParams,
			},
		);

		const disconnectParams = { user_id: "user-1", workspace_id: "ws-1" };
		assert.deepEqual(
			await captureServiceRequest(
				() =>
					service.disconnectMcpServerConnection?.(
						"server/id",
						disconnectParams,
					) as Promise<unknown>,
			),
			{
				method: "DELETE",
				path: "/mcp-servers/server%2Fid/connections",
				params: disconnectParams,
			},
		);
	});

	it("normalizes an empty disconnect response to explicit success", async () => {
		const basePrototype = BaseService.prototype as unknown as {
			delete: (path: string, params?: object) => Promise<unknown>;
		};
		const originalDelete = basePrototype.delete;
		basePrototype.delete = async () => undefined;
		try {
			assert.deepEqual(
				await new McpServersService(
					"test-dummy-key",
				).disconnectMcpServerConnection("server-1", { user_id: "user-1" }),
				{ success: true },
			);
		} finally {
			basePrototype.delete = originalDelete;
		}
	});

	it("registers and forwards connection management tools", async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const mcpServers = {
			listMcpServerConnections: async (...args: unknown[]) => {
				calls.push({ method: "listMcpServerConnections", args });
				return { data: [], total: 0, has_more: false };
			},
			disconnectMcpServerConnection: async (...args: unknown[]) => {
				calls.push({ method: "disconnectMcpServerConnection", args });
				return { success: true };
			},
		};
		const callbacks = registerToolCallbacks((server) => {
			registerMcpServersTools(server as never, { mcpServers } as never);
		});

		const listConnections = callbacks.get("list_mcp_server_connections");
		const disconnect = callbacks.get("disconnect_mcp_server_connection");
		assert.ok(listConnections);
		assert.ok(disconnect);

		await listConnections({
			id: "server-1",
			user_id: "user-1",
			workspace_id: "ws-1",
			current_page: 0,
			page_size: 100,
		});
		await disconnect({
			id: "server-1",
			user_id: "user-1",
			workspace_id: "ws-1",
		});

		assert.deepEqual(calls, [
			{
				method: "listMcpServerConnections",
				args: [
					"server-1",
					{
						user_id: "user-1",
						workspace_id: "ws-1",
						current_page: 0,
						page_size: 100,
					},
				],
			},
			{
				method: "disconnectMcpServerConnection",
				args: ["server-1", { user_id: "user-1", workspace_id: "ws-1" }],
			},
		]);
	});
});

describe("current Portkey integration schemas and model pricing", () => {
	it("normalizes current model and workspace list response keys", async () => {
		const service = new IntegrationsService("test-dummy-key");
		const models = [
			{
				slug: "gpt-4o",
				name: "GPT-4o",
				enabled: true,
				is_custom: false,
				pricing_config: { type: "static" as const },
			},
		];
		const modelResult = await withMockServiceGet({ total: 1, models }, () =>
			service.listIntegrationModels("prod-openai"),
		);
		assert.deepEqual(modelResult.data, models);
		assert.equal(modelResult.object, "list");

		const workspaces = [
			{ id: "ws-1", enabled: true, usage_limits: null, rate_limits: null },
		];
		const workspaceResult = await withMockServiceGet(
			{ total: 1, workspaces },
			() => service.listIntegrationWorkspaces("prod-openai"),
		);
		assert.deepEqual(workspaceResult.data, workspaces);
		assert.equal(workspaceResult.object, "list");
	});

	it("routes public model pricing outside the authenticated v1 base", async () => {
		const service = new IntegrationsService(
			"test-dummy-key",
		) as IntegrationsService & {
			getModelPricing?: (provider: string, model: string) => Promise<unknown>;
		};
		assert.equal(typeof service.getModelPricing, "function");
		assert.deepEqual(
			await capturePublicServiceRequest(
				() => service.getModelPricing?.("openai", "gpt/4o") as Promise<unknown>,
			),
			{
				path: "/model-configs/pricing/openai/gpt%2F4o",
				params: undefined,
			},
		);
	});

	it("omits the Portkey API key from public model pricing requests", async () => {
		const originalFetch = globalThis.fetch;
		let requestUrl: string | undefined;
		let requestHeaders: Headers | undefined;
		globalThis.fetch = (async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			requestUrl = String(input);
			requestHeaders = new Headers(init?.headers);
			return new Response(JSON.stringify({ currency: "USD" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof globalThis.fetch;

		try {
			await new IntegrationsService("must-not-leak").getModelPricing(
				"openai",
				"gpt-4o",
			);
			assert.equal(
				requestUrl,
				"https://api.portkey.ai/model-configs/pricing/openai/gpt-4o",
			);
			assert.equal(requestHeaders?.has("x-portkey-api-key"), false);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("forwards pricing, secret mapping, and provider creation fields", async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const integrations = {
			getModelPricing: async (...args: unknown[]) => {
				calls.push({ method: "getModelPricing", args });
				return { currency: "USD", pay_as_you_go: {} };
			},
			createIntegration: async (...args: unknown[]) => {
				calls.push({ method: "createIntegration", args });
				return { id: "int-1", slug: "prod-openai" };
			},
			updateIntegration: async (...args: unknown[]) => {
				calls.push({ method: "updateIntegration", args });
				return { success: true };
			},
		};
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(server as never, { integrations } as never);
		});

		const getPricing = callbacks.get("get_model_pricing");
		assert.ok(getPricing);
		await getPricing({ provider: "openai", model: "gpt-4o" });

		const secretMappings = [
			{
				target_field: "key",
				secret_reference_id: "secret-1",
				secret_key: "OPENAI_API_KEY",
				value_format: "string",
			},
		];
		const pricingAdjustments = {
			multiplier: {
				default: 0.8,
				request_token: 0.7,
				additional_units: { web_search: 0.9 },
			},
		};
		await callbacks.get("create_integration")?.({
			name: "Prod OpenAI",
			ai_provider_id: "openai",
			workspace_id: "ws-1",
			create_default_provider: false,
			default_provider_slug: "prod-provider",
			secret_mappings: secretMappings,
			pricing_adjustments: pricingAdjustments,
		});
		await callbacks.get("update_integration")?.({
			slug: "prod-openai",
			secret_mappings: secretMappings,
			pricing_adjustments: pricingAdjustments,
		});

		assert.deepEqual(calls, [
			{ method: "getModelPricing", args: ["openai", "gpt-4o"] },
			{
				method: "createIntegration",
				args: [
					{
						name: "Prod OpenAI",
						ai_provider_id: "openai",
						slug: undefined,
						key: undefined,
						description: undefined,
						workspace_id: "ws-1",
						configurations: undefined,
						create_default_provider: false,
						default_provider_slug: "prod-provider",
						secret_mappings: secretMappings,
						pricing_adjustments: pricingAdjustments,
					},
				],
			},
			{
				method: "updateIntegration",
				args: [
					"prod-openai",
					{
						name: undefined,
						key: undefined,
						description: undefined,
						configurations: undefined,
						secret_mappings: secretMappings,
						pricing_adjustments: pricingAdjustments,
					},
				],
			},
		]);
	});

	it("forwards current model and workspace access configuration", async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const integrations = {
			updateIntegrationModels: async (...args: unknown[]) => {
				calls.push({ method: "updateIntegrationModels", args });
				return { success: true };
			},
			updateIntegrationWorkspaces: async (...args: unknown[]) => {
				calls.push({ method: "updateIntegrationWorkspaces", args });
				return { success: true };
			},
		};
		const callbacks = registerToolCallbacks((server) => {
			registerIntegrationsTools(server as never, { integrations } as never);
		});

		await callbacks.get("update_integration_models")?.({
			slug: "prod-openai",
			allow_all_models: true,
			models: [
				{
					slug: "my-model",
					enabled: true,
					is_custom: true,
					is_finetune: false,
					base_model_slug: "gpt-4o",
					configurations: {
						custom_host: "https://model.example.com",
						custom_headers: { "x-model-key": "value" },
					},
					pricing_config: {
						type: "static",
						pay_as_you_go: {
							request_token: { price: 0.001 },
							response_token: { price: 0.002 },
						},
					},
				},
			],
		});
		await callbacks.get("update_integration_workspaces")?.({
			slug: "prod-openai",
			global_workspace_access_enabled: true,
			global_credit_limit: 100,
			global_alert_threshold: 80,
			global_rate_limit_rpm: 500,
			override_existing_workspace_access: true,
			create_default_provider: true,
			default_provider_slug: "global-provider",
			workspaces: [
				{
					id: "ws-1",
					enabled: true,
					reset_usage: true,
					create_default_provider: false,
					default_provider_slug: "workspace-provider",
				},
			],
		});

		assert.deepEqual(calls, [
			{
				method: "updateIntegrationModels",
				args: [
					"prod-openai",
					{
						allow_all_models: true,
						models: [
							{
								slug: "my-model",
								enabled: true,
								is_custom: true,
								is_finetune: false,
								base_model_slug: "gpt-4o",
								configurations: {
									custom_host: "https://model.example.com",
									custom_headers: { "x-model-key": "value" },
								},
								pricing_config: {
									type: "static",
									pay_as_you_go: {
										request_token: { price: 0.001 },
										response_token: { price: 0.002 },
									},
								},
							},
						],
					},
				],
			},
			{
				method: "updateIntegrationWorkspaces",
				args: [
					"prod-openai",
					{
						workspaces: [
							{
								id: "ws-1",
								enabled: true,
								usage_limits: undefined,
								rate_limits: undefined,
								reset_usage: true,
								create_default_provider: false,
								default_provider_slug: "workspace-provider",
							},
						],
						global_workspace_access: {
							enabled: true,
							usage_limits: [
								{
									type: "cost",
									credit_limit: 100,
									alert_threshold: 80,
								},
							],
							rate_limits: [{ type: "requests", unit: "rpm", value: 500 }],
						},
						override_existing_workspace_access: true,
						create_default_provider: true,
						default_provider_slug: "global-provider",
					},
				],
			},
		]);
	});

	it("rejects incomplete pricing, out-of-range alerts, and duplicate secret targets", () => {
		const integrationDefinitions = captureToolDefinitions((server) => {
			registerIntegrationsTools(server as never, {} as never);
		});
		const mcpDefinitions = captureToolDefinitions((server) => {
			registerMcpIntegrationsTools(server as never, {} as never);
		});

		const modelUpdate = {
			slug: "prod-openai",
			models: [{ slug: "custom-model", enabled: true, pricing_config: {} }],
		};
		assert.equal(
			safeParseToolInput(
				integrationDefinitions.get("update_integration_models"),
				modelUpdate,
			).success,
			false,
			"pricing_config.type is required when pricing_config is supplied",
		);

		for (const threshold of [-1, 101]) {
			assert.equal(
				safeParseToolInput(
					integrationDefinitions.get("update_integration_workspaces"),
					{
						slug: "prod-openai",
						workspaces: [],
						global_alert_threshold: threshold,
					},
				).success,
				false,
				`global_alert_threshold ${threshold} should be rejected`,
			);
		}
		for (const threshold of [0, 100]) {
			assert.equal(
				safeParseToolInput(
					integrationDefinitions.get("update_integration_workspaces"),
					{
						slug: "prod-openai",
						workspaces: [],
						global_alert_threshold: threshold,
					},
				).success,
				true,
				`global_alert_threshold ${threshold} should be accepted`,
			);
		}

		const duplicateMappings = [
			{ target_field: "key", secret_reference_id: "secret-1" },
			{ target_field: "key", secret_reference_id: "secret-2" },
		];
		for (const [name, definition] of [
			["create_integration", integrationDefinitions.get("create_integration")],
			["update_integration", integrationDefinitions.get("update_integration")],
			["create_mcp_integration", mcpDefinitions.get("create_mcp_integration")],
			["update_mcp_integration", mcpDefinitions.get("update_mcp_integration")],
		] as const) {
			const required = name.startsWith("create")
				? name === "create_integration"
					? { name: "Integration", ai_provider_id: "openai" }
					: {
							name: "MCP",
							url: "https://mcp.example.com",
							auth_type: "none",
							transport: "http",
						}
				: name === "update_integration"
					? { slug: "integration-1" }
					: { id: "mcp-1" };
			assert.equal(
				safeParseToolInput(definition, {
					...required,
					secret_mappings: duplicateMappings,
				}).success,
				false,
				`${name} should reject duplicate target_field values`,
			);
		}
	});

	it("enforces current timestamp and MCP integration pagination contracts", () => {
		const keyDefinitions = captureToolDefinitions((server) => {
			registerKeysTools(server as never, {} as never);
		});
		const workspaceDefinitions = captureToolDefinitions((server) => {
			registerWorkspacesTools(server as never, {} as never);
		});
		const mcpDefinitions = captureToolDefinitions((server) => {
			registerMcpIntegrationsTools(server as never, {} as never);
		});

		assert.equal(
			safeParseToolInput(keyDefinitions.get("create_virtual_key"), {
				name: "Key",
				provider: "openai",
				key: "secret",
				expires_at: "not-a-timestamp",
			}).success,
			false,
		);
		assert.equal(
			safeParseToolInput(keyDefinitions.get("create_api_key"), {
				type: "organisation",
				sub_type: "service",
				name: "Key",
				scopes: [],
				rotation_policy: {
					next_rotation_at: "2027-01-01T00:00:00+02:00",
				},
			}).success,
			true,
		);
		assert.equal(
			safeParseToolInput(keyDefinitions.get("update_api_key"), {
				id: "550e8400-e29b-41d4-a716-446655440000",
				expires_at: "tomorrow",
			}).success,
			false,
		);
		assert.equal(
			safeParseToolInput(workspaceDefinitions.get("update_workspace"), {
				workspace_id: "workspace-1",
				usage_limits: [{ next_usage_reset_at: "later" }],
			}).success,
			false,
		);

		const listInput = mcpDefinitions.get("list_mcp_integrations")
			?.inputSchema as Record<string, z.ZodType>;
		assert.match(listInput.page_size?.description ?? "", /max 1000/);
		assert.equal(
			safeParseToolInput(mcpDefinitions.get("list_mcp_integrations"), {
				page_size: 1000,
			}).success,
			true,
		);
	});
});

describe("current Portkey MCP integration secret mappings", () => {
	it("forwards secret reference mappings on create and update", async () => {
		const calls: Array<{ method: string; args: unknown[] }> = [];
		const mcpIntegrations = {
			createMcpIntegration: async (...args: unknown[]) => {
				calls.push({ method: "createMcpIntegration", args });
				return { id: "mcp-1", slug: "secure-mcp" };
			},
			updateMcpIntegration: async (...args: unknown[]) => {
				calls.push({ method: "updateMcpIntegration", args });
				return { success: true };
			},
		};
		const callbacks = registerToolCallbacks((server) => {
			registerMcpIntegrationsTools(
				server as never,
				{ mcpIntegrations } as never,
			);
		});
		const secretMappings = [
			{
				target_field: "configurations.oauth_metadata",
				secret_reference_id: "oauth-secret",
				value_format: "json",
			},
		];

		await callbacks.get("create_mcp_integration")?.({
			name: "Secure MCP",
			url: "https://mcp.example.com",
			auth_type: "oauth_auto",
			transport: "http",
			secret_mappings: secretMappings,
		});
		await callbacks.get("update_mcp_integration")?.({
			id: "mcp-1",
			secret_mappings: secretMappings,
		});

		assert.deepEqual(calls, [
			{
				method: "createMcpIntegration",
				args: [
					{
						name: "Secure MCP",
						url: "https://mcp.example.com",
						auth_type: "oauth_auto",
						transport: "http",
						secret_mappings: secretMappings,
					},
				],
			},
			{
				method: "updateMcpIntegration",
				args: ["mcp-1", { secret_mappings: secretMappings }],
			},
		]);
	});
});

describe("new tool quality contract", () => {
	it("ships decision-oriented descriptions, described fields, and explicit annotations", () => {
		const registrations = new Map<string, unknown[]>();
		const server = {
			tool(name: string, ...rest: unknown[]) {
				registrations.set(name, rest);
				return {} as never;
			},
			registerTool(
				name: string,
				config: Record<string, unknown>,
				callback: (...args: unknown[]) => Promise<unknown>,
			) {
				registrations.set(name, [
					config.description,
					config.inputSchema,
					config.annotations,
					callback,
				]);
				return {} as never;
			},
		};
		const emptyService = {} as never;
		registerGuardrailsTools(server as never, emptyService);
		registerLoggingTools(server as never, emptyService);
		registerWorkspacesTools(server as never, emptyService);
		registerMcpServersTools(server as never, emptyService);
		registerIntegrationsTools(server as never, emptyService);
		registerMcpIntegrationsTools(server as never, emptyService);

		const expectedAnnotations = new Map<
			string,
			{
				readOnlyHint: boolean;
				destructiveHint: boolean;
				idempotentHint: boolean;
			}
		>([
			[
				"get_organisation_defaults",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"update_organisation_defaults",
				{ readOnlyHint: false, destructiveHint: false, idempotentHint: true },
			],
			[
				"list_input_guardrail_workspace_exclusions",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"update_input_guardrail_workspace_exclusions",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
			[
				"list_output_guardrail_workspace_exclusions",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"update_output_guardrail_workspace_exclusions",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
			[
				"get_log",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"get_log_export_field_restrictions",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"list_scim_workspace_mappings",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"create_scim_workspace_mapping",
				{ readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			],
			[
				"delete_scim_workspace_mapping",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
			[
				"list_scim_groups",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"list_mcp_server_connections",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"disconnect_mcp_server_connection",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
			[
				"get_model_pricing",
				{ readOnlyHint: true, destructiveHint: false, idempotentHint: true },
			],
			[
				"create_integration",
				{ readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			],
			[
				"update_integration",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
			[
				"update_integration_models",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
			[
				"update_integration_workspaces",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
			[
				"create_mcp_integration",
				{ readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			],
			[
				"update_mcp_integration",
				{ readOnlyHint: false, destructiveHint: true, idempotentHint: true },
			],
		]);

		for (const [name, expected] of expectedAnnotations) {
			const registration = registrations.get(name);
			assert.ok(registration, `${name} should be registered`);
			const description = registration[0];
			assert.equal(typeof description, "string", `${name} needs a description`);
			assert.ok(
				(description as string).length >= 120,
				`${name} description should explain selection and consequences`,
			);

			const annotations = registration.at(-2) as Record<string, unknown>;
			assert.equal(
				typeof annotations?.title,
				"string",
				`${name} needs a title`,
			);
			assert.deepEqual(
				{
					readOnlyHint: annotations?.readOnlyHint,
					destructiveHint: annotations?.destructiveHint,
					idempotentHint: annotations?.idempotentHint,
				},
				expected,
				`${name} annotations should match its side effects`,
			);
			assert.equal(annotations?.openWorldHint, true);

			const possibleSchema = registration[1];
			if (
				possibleSchema &&
				typeof possibleSchema === "object" &&
				!("readOnlyHint" in (possibleSchema as Record<string, unknown>)) &&
				typeof (possibleSchema as z.ZodType).safeParse !== "function"
			) {
				for (const [field, schema] of Object.entries(
					possibleSchema as Record<string, { description?: string }>,
				)) {
					assert.ok(
						schema.description,
						`${name}.${field} needs an input description`,
					);
				}
			}
		}

		assert.match(
			String(registrations.get("get_organisation_defaults")?.[0]),
			/organisation_settings\.read/,
		);
		assert.match(
			String(registrations.get("update_organisation_defaults")?.[0]),
			/organisation_settings\.update/,
		);
		assert.match(
			String(
				registrations.get("list_input_guardrail_workspace_exclusions")?.[0],
			),
			/organisation_exclusions\.list/,
		);
		assert.match(
			String(
				registrations.get("update_input_guardrail_workspace_exclusions")?.[0],
			),
			/organisation_exclusions\.update/,
		);
		assert.match(
			String(registrations.get("get_log_export_field_restrictions")?.[0]),
			/logs\.export/,
		);
	});
});
