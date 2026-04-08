import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerLabelsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create label tool
	server.tool(
		"create_prompt_label",
		"Create a new prompt label to categorize and organize prompts. Labels can be color-coded and scoped to workspaces or organizations.",
		{
			name: z.string().describe("Name of the label"),
			organisation_id: z
				.string()
				.optional()
				.describe("Organisation ID to create the label in"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID to create the label in"),
			description: z.string().optional().describe("Description of the label"),
			color_code: z
				.string()
				.regex(/^#[0-9A-Fa-f]{6}$/)
				.optional()
				.describe(
					"Hex format, e.g. '#FF5733'. Optional — omit for default color.",
				),
		},
		async (params) => {
			if (!params.organisation_id && !params.workspace_id) {
				return {
					content: [
						{
							type: "text",
							text: "Error: Either organisation_id or workspace_id is required",
						},
					],
					isError: true,
				};
			}
			const result = await service.labels.createLabel({
				name: params.name,
				organisation_id: params.organisation_id,
				workspace_id: params.workspace_id,
				description: params.description,
				color_code: params.color_code,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created label "${params.name}"`,
								id: result.id,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// List labels tool
	server.tool(
		"list_prompt_labels",
		"List all prompt labels in your Portkey organization with optional filtering by workspace, organisation, or search query",
		{
			organisation_id: z
				.string()
				.optional()
				.describe("Filter by organisation ID"),
			workspace_id: z.string().optional().describe("Filter by workspace ID"),
			search: z.string().optional().describe("Search labels by name"),
			current_page: z.coerce
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z.coerce
				.number()
				.positive()
				.max(100)
				.optional()
				.describe("Results per page (max 100)"),
		},
		async (params) => {
			const result = await service.labels.listLabels(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								labels: result.data.map((label) => ({
									id: label.id,
									name: label.name,
									description: label.description,
									color_code: label.color_code,
									is_universal: label.is_universal,
									status: label.status,
									created_at: label.created_at,
									last_updated_at: label.last_updated_at,
								})),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Get label tool
	server.tool(
		"get_prompt_label",
		"Retrieve detailed information about a specific prompt label",
		{
			label_id: z.string().describe("Label ID to retrieve"),
			organisation_id: z
				.string()
				.optional()
				.describe("Organisation ID for filtering"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID for filtering"),
		},
		async (params) => {
			const label = await service.labels.getLabel(params.label_id, {
				organisation_id: params.organisation_id,
				workspace_id: params.workspace_id,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: label.id,
								name: label.name,
								description: label.description,
								color_code: label.color_code,
								organisation_id: label.organisation_id,
								workspace_id: label.workspace_id,
								is_universal: label.is_universal,
								status: label.status,
								created_at: label.created_at,
								last_updated_at: label.last_updated_at,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Update label tool
	server.tool(
		"update_prompt_label",
		"Update an existing prompt label's name, description, or color",
		{
			label_id: z.string().describe("Label ID to update"),
			name: z.string().optional().describe("New name for the label"),
			description: z.string().optional().describe("New description"),
			color_code: z
				.string()
				.regex(/^#[0-9A-Fa-f]{6}$/)
				.optional()
				.describe("New hex color code (e.g., '#FF5733')"),
		},
		async (params) => {
			const { label_id, ...updateData } = params;
			await service.labels.updateLabel(label_id, updateData);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated label "${label_id}"`,
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

	// Delete label tool
	server.tool(
		"delete_prompt_label",
		"Delete a prompt label by ID. This action cannot be undone.",
		{
			label_id: z.string().describe("Label ID to delete"),
		},
		async (params) => {
			await service.labels.deleteLabel(params.label_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted label "${params.label_id}"`,
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
