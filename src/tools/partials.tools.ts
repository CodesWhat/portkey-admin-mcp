import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerPartialsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create partial tool
	server.tool(
		"create_prompt_partial",
		"Create a new prompt partial (reusable text snippet) that can be included in prompts using mustache syntax like {{> partial_name}}",
		{
			name: z.string().describe("Display name for the partial"),
			string: z.string().describe("The partial content/template string"),
			workspace_id: z
				.string()
				.optional()
				.describe(
					"Workspace ID to create partial in (required for org-level API keys)",
				),
			version_description: z
				.string()
				.optional()
				.describe("Description for this version"),
		},
		async (params) => {
			try {
				const result = await service.createPromptPartial({
					name: params.name,
					string: params.string,
					workspace_id: params.workspace_id,
					version_description: params.version_description,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully created prompt partial "${params.name}"`,
									id: result.id,
									slug: result.slug,
									version_id: result.version_id,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error creating prompt partial: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List partials tool
	server.tool(
		"list_prompt_partials",
		"List all prompt partials in your Portkey organization with optional filtering by collection",
		{
			collection_id: z.string().optional().describe("Filter by collection ID"),
		},
		async (params) => {
			try {
				const partials = await service.listPromptPartials(params);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									total: partials.length,
									partials: partials.map((p) => ({
										id: p.id,
										slug: p.slug,
										name: p.name,
										collection_id: p.collection_id,
										status: p.status,
										created_at: p.created_at,
										last_updated_at: p.last_updated_at,
									})),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing prompt partials: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get partial tool
	server.tool(
		"get_prompt_partial",
		"Retrieve detailed information about a specific prompt partial including its content and version info",
		{
			prompt_partial_id: z
				.string()
				.describe("Prompt partial ID or slug to retrieve"),
		},
		async (params) => {
			try {
				const partial = await service.getPromptPartial(
					params.prompt_partial_id,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									id: partial.id,
									slug: partial.slug,
									name: partial.name,
									collection_id: partial.collection_id,
									string: partial.string,
									version: partial.version,
									version_description: partial.version_description,
									prompt_partial_version_id: partial.prompt_partial_version_id,
									status: partial.status,
									created_at: partial.created_at,
									last_updated_at: partial.last_updated_at,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching prompt partial: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update partial tool
	server.tool(
		"update_prompt_partial",
		"Update an existing prompt partial. Creates a new version with the changes.",
		{
			prompt_partial_id: z
				.string()
				.describe("Prompt partial ID or slug to update"),
			name: z.string().optional().describe("New display name for the partial"),
			string: z.string().optional().describe("New content for the partial"),
			description: z
				.string()
				.optional()
				.describe("Description for this version"),
			status: z
				.enum(["active", "archived"])
				.optional()
				.describe("New status for the partial"),
		},
		async (params) => {
			try {
				const { prompt_partial_id, ...updateData } = params;
				const result = await service.updatePromptPartial(
					prompt_partial_id,
					updateData,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully updated prompt partial "${prompt_partial_id}"`,
									prompt_partial_version_id: result.prompt_partial_version_id,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating prompt partial: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Delete partial tool
	server.tool(
		"delete_prompt_partial",
		"Delete a prompt partial by ID. This action cannot be undone.",
		{
			prompt_partial_id: z
				.string()
				.describe("Prompt partial ID or slug to delete"),
		},
		async (params) => {
			try {
				await service.deletePromptPartial(params.prompt_partial_id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully deleted prompt partial "${params.prompt_partial_id}"`,
									success: true,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting prompt partial: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List partial versions tool
	server.tool(
		"list_partial_versions",
		"List all versions of a prompt partial to view its change history",
		{
			prompt_partial_id: z
				.string()
				.describe("Prompt partial ID or slug to list versions for"),
		},
		async (params) => {
			try {
				const versions = await service.listPartialVersions(
					params.prompt_partial_id,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									prompt_partial_id: params.prompt_partial_id,
									total_versions: versions.length,
									versions: versions.map((v) => ({
										prompt_partial_id: v.prompt_partial_id,
										prompt_partial_version_id: v.prompt_partial_version_id,
										slug: v.slug,
										version: v.version,
										description: v.description,
										status: v.prompt_version_status,
										created_at: v.created_at,
										content_preview:
											v.string.length > 200
												? `${v.string.substring(0, 200)}...`
												: v.string,
									})),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing partial versions: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Publish partial tool
	server.tool(
		"publish_partial",
		"Publish a specific version of a prompt partial, making it the default version",
		{
			prompt_partial_id: z.string().describe("Prompt partial ID or slug"),
			version: z
				.number()
				.positive()
				.describe("Version number to publish as default"),
		},
		async (params) => {
			try {
				await service.publishPartial(params.prompt_partial_id, {
					version: params.version,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully published version ${params.version} as default for partial "${params.prompt_partial_id}"`,
									prompt_partial_id: params.prompt_partial_id,
									published_version: params.version,
									success: true,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error publishing partial: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
