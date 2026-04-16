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
		"Create a reusable prompt partial for inclusion with {{> partial_name}}. Use this for shared snippets or macros; returns the partial id, slug, and version id, and the new version stays inactive until published.",
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
		"List partials across collections, with optional collection filtering. Returns ids, slugs, names, collections, and status so you can choose a prompt_partial_id before get/update/delete.",
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
		"Fetch a partial's content and current version details. Use this before embedding, updating, or checking what {{> partial_name}} resolves to; returns the stored string plus version metadata.",
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
		"Create a new version of a partial by updating its content or metadata. Only provided fields change, and the new version stays inactive until publish_partial makes it current.",
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
		"Delete a prompt partial by ID. This cannot be undone, and prompts that reference it with {{> name}} will fail to render until you replace the reference.",
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
		"List all versions for one partial, including version numbers, descriptions, status, and timestamps. Use this when you need history or want to choose a version_id before publish_partial.",
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
		"Publish a specific partial version as the default version. This changes which content {{> partial_name}} resolves to and replaces the previously active version.",
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
