import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

const PARTIALS_TOOL_SCHEMAS = {
	createPromptPartial: {
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
	listPromptPartials: {
		collection_id: z
			.string()
			.optional()
			.describe(
				"Filter by collection ID. Optional — omit to list all partials across collections",
			),
	},
	getPromptPartial: {
		prompt_partial_id: z
			.string()
			.describe("Prompt partial ID or slug to retrieve"),
	},
	updatePromptPartial: {
		prompt_partial_id: z
			.string()
			.describe("Prompt partial ID or slug to update"),
		name: z.string().optional().describe("New display name for the partial"),
		string: z.string().optional().describe("New content for the partial"),
		description: z.string().optional().describe("Description for this version"),
		status: z
			.enum(["active", "archived"])
			.optional()
			.describe("New status for the partial"),
	},
	deletePromptPartial: {
		prompt_partial_id: z
			.string()
			.describe("Prompt partial ID or slug to delete"),
	},
	listPartialVersions: {
		prompt_partial_id: z
			.string()
			.describe("Prompt partial ID or slug to list versions for"),
	},
	publishPartial: {
		prompt_partial_id: z.string().describe("Prompt partial ID or slug"),
		version: z.coerce
			.number()
			.positive()
			.describe("Version number to publish as default"),
	},
} as const;

export function registerPartialsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create partial tool
	server.tool(
		"create_prompt_partial",
		"Create a new prompt partial (reusable text snippet) that can be included in prompts using mustache syntax like {{> partial_name}}. After creation, use publish_partial to make it the default version. Returns id, slug, and version_id.",
		PARTIALS_TOOL_SCHEMAS.createPromptPartial,
		async (params) => {
			const result = await service.partials.createPromptPartial({
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
		},
	);

	// List partials tool
	server.tool(
		"list_prompt_partials",
		"List all prompt partials in your Portkey organization with optional filtering by collection. Returns all partials with id, slug, name, and status. Use to discover partial IDs or check if a partial already exists before creating.",
		PARTIALS_TOOL_SCHEMAS.listPromptPartials,
		async (params) => {
			const partials = await service.partials.listPromptPartials(params);
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
		},
	);

	// Get partial tool
	server.tool(
		"get_prompt_partial",
		"Retrieve detailed information about a specific prompt partial. Returns the partial's content string and current version info. Use to inspect content before including it in a prompt via {{> partial_name}}.",
		PARTIALS_TOOL_SCHEMAS.getPromptPartial,
		async (params) => {
			const partial = await service.partials.getPromptPartial(
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
		},
	);

	// Update partial tool
	server.tool(
		"update_prompt_partial",
		"Update an existing prompt partial. A new version is created in archived status — use publish_partial to make it active.",
		PARTIALS_TOOL_SCHEMAS.updatePromptPartial,
		async (params) => {
			const { prompt_partial_id, ...updateData } = params;
			const result = await service.partials.updatePromptPartial(
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
		},
	);

	// Delete partial tool
	server.tool(
		"delete_prompt_partial",
		"Delete a prompt partial by ID. This action cannot be undone. Prompts referencing this partial via {{> name}} will fail to render. Ensure no active prompts depend on it.",
		PARTIALS_TOOL_SCHEMAS.deletePromptPartial,
		async (params) => {
			await service.partials.deletePromptPartial(params.prompt_partial_id);
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
		},
	);

	// List partial versions tool
	server.tool(
		"list_partial_versions",
		"List all versions of a prompt partial to view its change history. Returns all versions with content preview. Use to find a version number before calling publish_partial to roll back or promote a version.",
		PARTIALS_TOOL_SCHEMAS.listPartialVersions,
		async (params) => {
			const versions = await service.partials.listPartialVersions(
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
		},
	);

	// Publish partial tool
	server.tool(
		"publish_partial",
		"Publish a specific version of a prompt partial, making it the default version. After publishing, all prompts using {{> partial_name}} will resolve to this version's content.",
		PARTIALS_TOOL_SCHEMAS.publishPartial,
		async (params) => {
			await service.partials.publishPartial(params.prompt_partial_id, {
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
		},
	);
}
