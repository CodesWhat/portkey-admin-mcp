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
			current_page: z.coerce
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z.coerce
				.number()
				.int()
				.positive()
				.max(100)
				.optional()
				.describe("Number of results per page (max 100)"),
			workspace_id: z.string().optional().describe("Filter by workspace ID"),
		},
		async (params) => {
			const result = await service.mcpIntegrations.listMcpIntegrations(params);
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
				.enum(["oauth_auto", "headers", "none"])
				.describe(
					"Authentication type: 'none', 'headers' (custom headers), or 'oauth_auto' (OAuth)",
				),
			transport: z
				.enum(["http", "sse"])
				.describe(
					"MCP transport protocol: 'http' (streamable HTTP) or 'sse' (server-sent events)",
				),
			slug: z
				.string()
				.optional()
				.describe("Custom slug. Auto-generated if omitted"),
			description: z
				.string()
				.optional()
				.describe("Description of the MCP integration"),
			custom_headers: z
				.record(z.string(), z.string())
				.optional()
				.describe(
					'Custom headers for authentication (e.g. { "Authorization": "Bearer xxx" }). Sent via configurations.custom_headers',
				),
			workspace_id: z
				.string()
				.optional()
				.describe(
					"Workspace ID — required when using organization admin API keys",
				),
		},
		async (params) => {
			if (
				params.auth_type === "headers" &&
				(!params.custom_headers ||
					Object.keys(params.custom_headers).length === 0)
			) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: custom_headers must be provided when auth_type is 'headers'",
						},
					],
					isError: true,
				};
			}
			const { custom_headers, ...rest } = params;
			const result = await service.mcpIntegrations.createMcpIntegration({
				...rest,
				...(custom_headers ? { configurations: { custom_headers } } : {}),
			});
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
			id: z.string().describe("The MCP integration ID or slug to retrieve"),
		},
		async (params) => {
			const integration = await service.mcpIntegrations.getMcpIntegration(
				params.id,
			);
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
				.enum(["oauth_auto", "headers", "none"])
				.optional()
				.describe("New authentication type"),
			transport: z
				.enum(["http", "sse"])
				.optional()
				.describe("New transport protocol"),
			custom_headers: z
				.record(z.string(), z.string())
				.optional()
				.describe(
					"New custom headers for authentication. Sent via configurations.custom_headers",
				),
		},
		async (params) => {
			const { id, custom_headers, ...rest } = params;
			await service.mcpIntegrations.updateMcpIntegration(id, {
				...rest,
				...(custom_headers ? { configurations: { custom_headers } } : {}),
			});
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
			await service.mcpIntegrations.deleteMcpIntegration(params.id);
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
			id: z.string().describe("The MCP integration ID or slug"),
		},
		async (params) => {
			const metadata = await service.mcpIntegrations.getMcpIntegrationMetadata(
				params.id,
			);
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
			id: z.string().describe("The MCP integration ID or slug"),
		},
		async (params) => {
			const result =
				await service.mcpIntegrations.listMcpIntegrationCapabilities(params.id);
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
			id: z.string().describe("The MCP integration ID or slug"),
			capabilities: z
				.array(
					z.object({
						name: z.string().describe("Capability name"),
						type: z
							.enum(["tool", "prompt", "resource"])
							.describe("Capability type"),
						enabled: z.boolean().describe("Whether to enable the capability"),
					}),
				)
				.min(1)
				.describe("Array of capability updates"),
		},
		async (params) => {
			await service.mcpIntegrations.updateMcpIntegrationCapabilities(
				params.id,
				{
					capabilities: params.capabilities,
				},
			);
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
			id: z.string().describe("The MCP integration ID or slug"),
		},
		async (params) => {
			const result = await service.mcpIntegrations.listMcpIntegrationWorkspaces(
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
			id: z.string().describe("The MCP integration ID or slug"),
			workspaces: z
				.array(
					z.object({
						id: z.string().describe("Workspace ID"),
						enabled: z.boolean().describe("Whether workspace has access"),
					}),
				)
				.min(1)
				.describe("Array of workspace access updates"),
		},
		async (params) => {
			await service.mcpIntegrations.updateMcpIntegrationWorkspaces(params.id, {
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
