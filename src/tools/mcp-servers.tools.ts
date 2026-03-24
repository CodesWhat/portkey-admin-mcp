import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerMcpServersTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"list_mcp_servers",
		"List all MCP servers in your Portkey organization with optional pagination and workspace filtering",
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
			const result = await service.listMcpServers(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								servers: result.data,
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
		"create_mcp_server",
		"Register a new MCP server under an existing MCP integration",
		{
			name: z.string().describe("Display name for the MCP server"),
			mcp_integration_id: z
				.string()
				.describe(
					"ID or slug of the MCP integration this server belongs to",
				),
			slug: z
				.string()
				.optional()
				.describe("Custom slug. Auto-generated if omitted"),
			description: z
				.string()
				.optional()
				.describe("Description of the MCP server"),
		},
		async (params) => {
			const result = await service.createMcpServer(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created MCP server "${params.name}"`,
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
		"get_mcp_server",
		"Retrieve detailed information about a specific MCP server by ID or slug",
		{
			id: z.string().describe("The MCP server ID or slug to retrieve"),
		},
		async (params) => {
			const mcpServer = await service.getMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(mcpServer, null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server",
		"Update an existing MCP server's name or description",
		{
			id: z.string().describe("The MCP server ID or slug to update"),
			name: z.string().optional().describe("New display name"),
			description: z.string().optional().describe("New description"),
		},
		async (params) => {
			const { id, ...data } = params;
			await service.updateMcpServer(id, data);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated MCP server "${id}"`,
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
		"delete_mcp_server",
		"Delete an MCP server. This action cannot be undone.",
		{
			id: z.string().describe("The MCP server ID or slug to delete"),
		},
		async (params) => {
			await service.deleteMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted MCP server "${params.id}"`,
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
		"test_mcp_server",
		"Test connectivity to an MCP server to verify it is reachable and responding",
		{
			id: z.string().describe("The MCP server ID or slug to test"),
		},
		async (params) => {
			const result = await service.testMcpServer(params.id);
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
		"list_mcp_server_capabilities",
		"List all capabilities (tools, resources, prompts) exposed by an MCP server",
		{
			id: z.string().describe("The MCP server ID or slug"),
		},
		async (params) => {
			const result = await service.listMcpServerCapabilities(params.id);
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
		"update_mcp_server_capabilities",
		"Bulk enable or disable capabilities on an MCP server",
		{
			id: z.string().describe("The MCP server ID or slug"),
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
			await service.updateMcpServerCapabilities(params.id, {
				capabilities: params.capabilities,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated capabilities for MCP server "${params.id}"`,
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
		"list_mcp_server_user_access",
		"List user access settings for an MCP server",
		{
			id: z.string().describe("The MCP server ID or slug"),
		},
		async (params) => {
			const result = await service.listMcpServerUserAccess(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{ total: result.total, users: result.data },
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server_user_access",
		"Bulk update user access for an MCP server",
		{
			id: z.string().describe("The MCP server ID or slug"),
			users: z
				.array(
					z.object({
						user_id: z.string().describe("User ID"),
						enabled: z
							.boolean()
							.describe("Whether user has access"),
					}),
				)
				.min(1)
				.describe("Array of user access updates"),
		},
		async (params) => {
			await service.updateMcpServerUserAccess(params.id, {
				users: params.users,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated user access for MCP server "${params.id}"`,
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
