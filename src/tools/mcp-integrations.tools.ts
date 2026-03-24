import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerMcpIntegrationsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"list_mcp_integrations",
		"List all MCP integrations in your Portkey organization with optional pagination and workspace filtering",
		{
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z
				.number()
				.int()
				.positive()
				.max(100)
				.optional()
				.describe("Number of results per page (max 100)"),
			workspace_id: z
				.string()
				.optional()
				.describe("Filter by workspace ID"),
		},
		async (params) => {
			const result = await service.listMcpIntegrations(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								has_more: result.has_more,
								integrations: result.data,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"create_mcp_integration",
		"Create a new MCP integration in Portkey for connecting external MCP servers to your organization",
		{
			name: z.string().describe("Display name for the MCP integration"),
			url: z.string().describe("URL endpoint of the MCP server to integrate"),
			auth_type: z
				.enum(["none", "bearer", "header"])
				.describe("Authentication type: 'none', 'bearer' (token), or 'header' (custom header)"),
			transport: z
				.enum(["sse", "streamable-http", "stdio"])
				.describe("MCP transport protocol: 'sse', 'streamable-http', or 'stdio'"),
			slug: z
				.string()
				.optional()
				.describe("Custom slug. Auto-generated if omitted"),
			description: z
				.string()
				.optional()
				.describe("Description of the MCP integration"),
			auth_token: z
				.string()
				.optional()
				.describe("Auth token (required when auth_type is 'bearer')"),
			auth_header_name: z
				.string()
				.optional()
				.describe("Custom header name (required when auth_type is 'header')"),
			workspace_id: z
				.string()
				.optional()
				.describe(
					"Workspace ID — required when using organization admin API keys",
				),
		},
		async (params) => {
			if (params.auth_type === "bearer" && !params.auth_token) {
				return {
					isError: true,
					content: [
						{ type: "text", text: "auth_token is required when auth_type is 'bearer'" },
					],
				};
			}
			if (params.auth_type === "header" && !params.auth_header_name) {
				return {
					isError: true,
					content: [
						{ type: "text", text: "auth_header_name is required when auth_type is 'header'" },
					],
				};
			}
			const result = await service.createMcpIntegration(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created MCP integration "${params.name}"`,
								id: result.id,
								slug: result.slug,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_mcp_integration",
		"Retrieve detailed information about a specific MCP integration by ID or slug",
		{
			id: z
				.string()
				.describe("The MCP integration ID or slug to retrieve"),
		},
		async (params) => {
			const integration = await service.getMcpIntegration(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(integration, null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_integration",
		"Update an existing MCP integration's name, description, URL, auth, or transport",
		{
			id: z.string().describe("The MCP integration ID or slug to update"),
			name: z.string().optional().describe("New display name"),
			description: z.string().optional().describe("New description"),
			url: z.string().optional().describe("New URL endpoint"),
			auth_type: z
				.enum(["none", "bearer", "header"])
				.optional()
				.describe("New authentication type"),
			transport: z
				.enum(["sse", "streamable-http", "stdio"])
				.optional()
				.describe("New transport protocol"),
			auth_token: z.string().optional().describe("New auth token"),
			auth_header_name: z
				.string()
				.optional()
				.describe("New custom auth header name"),
		},
		async (params) => {
			const { id, ...data } = params;
			await service.updateMcpIntegration(id, data);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated MCP integration "${id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"delete_mcp_integration",
		"Delete an MCP integration. This action cannot be undone.",
		{
			id: z.string().describe("The MCP integration ID or slug to delete"),
		},
		async (params) => {
			await service.deleteMcpIntegration(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted MCP integration "${params.id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_mcp_integration_metadata",
		"Retrieve metadata for a specific MCP integration",
		{
			id: z
				.string()
				.describe("The MCP integration ID or slug"),
		},
		async (params) => {
			const metadata = await service.getMcpIntegrationMetadata(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(metadata, null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"list_mcp_integration_capabilities",
		"List all capabilities (tools, resources, prompts) available on an MCP integration",
		{
			id: z
				.string()
				.describe("The MCP integration ID or slug"),
		},
		async (params) => {
			const result = await service.listMcpIntegrationCapabilities(
				params.id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{ total: result.total, capabilities: result.data },
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_integration_capabilities",
		"Bulk enable or disable capabilities on an MCP integration",
		{
			id: z
				.string()
				.describe("The MCP integration ID or slug"),
			capabilities: z
				.array(
					z.object({
						id: z.string().describe("Capability ID"),
						enabled: z
							.boolean()
							.describe("Whether to enable the capability"),
					}),
				)
				.min(1)
				.describe("Array of capability updates"),
		},
		async (params) => {
			await service.updateMcpIntegrationCapabilities(params.id, {
				capabilities: params.capabilities,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated capabilities for MCP integration "${params.id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"list_mcp_integration_workspaces",
		"List workspace access settings for an MCP integration",
		{
			id: z
				.string()
				.describe("The MCP integration ID or slug"),
		},
		async (params) => {
			const result = await service.listMcpIntegrationWorkspaces(
				params.id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_integration_workspaces",
		"Bulk update workspace access for an MCP integration",
		{
			id: z
				.string()
				.describe("The MCP integration ID or slug"),
			workspaces: z
				.array(
					z.object({
						workspace_id: z.string().describe("Workspace ID"),
						enabled: z
							.boolean()
							.describe("Whether workspace has access"),
					}),
				)
				.min(1)
				.describe("Array of workspace access updates"),
		},
		async (params) => {
			await service.updateMcpIntegrationWorkspaces(params.id, {
				workspaces: params.workspaces,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated workspace access for MCP integration "${params.id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}
