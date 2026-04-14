import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

const COLLECTIONS_TOOL_SCHEMAS = {
	listCollections: {
		workspace_id: z.string().optional().describe("Filter by workspace ID"),
		search: z.string().optional().describe("Search collections by name"),
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
	createCollection: {
		name: z
			.string()
			.describe(
				"Collection name (e.g., 'hourlink', 'apizone', 'research-pilot')",
			),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID to create collection in"),
	},
	getCollection: {
		collection_id: z.string().describe("Collection ID or slug to retrieve"),
	},
	updateCollection: {
		collection_id: z.string().describe("Collection ID to update"),
		name: z.string().optional().describe("New name for the collection"),
		description: z
			.string()
			.optional()
			.describe("New description for the collection"),
	},
	deleteCollection: {
		collection_id: z.string().describe("Collection ID to delete"),
	},
} as const;

export function registerCollectionsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List collections tool
	server.tool(
		"list_collections",
		"List all prompt collections in your Portkey organization. Collections organize prompts by application (e.g., hourlink, apizone, research-pilot). Use to discover collection_id values before creating or listing prompts. Returns id, name, and slug per collection.",
		COLLECTIONS_TOOL_SCHEMAS.listCollections,
		async (params) => {
			const collections = await service.collections.listCollections(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: collections.total,
								collections: collections.data.map((collection) => ({
									id: collection.id,
									name: collection.name,
									slug: collection.slug,
									workspace_id: collection.workspace_id,
									created_at: collection.created_at,
									last_updated_at: collection.last_updated_at,
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

	// Create collection tool
	server.tool(
		"create_collection",
		"Create a new prompt collection for organizing prompts by app. Use one collection per app (hourlink, apizone, research-pilot). Returns the new collection_id and slug needed for create_prompt.",
		COLLECTIONS_TOOL_SCHEMAS.createCollection,
		async (params) => {
			const result = await service.collections.createCollection(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created collection "${params.name}"`,
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

	// Get collection tool
	server.tool(
		"get_collection",
		"Retrieve full details of a specific collection by ID or slug, including name, slug, and workspace_id. Use get_collection when you have a specific ID; use list_collections to browse all collections.",
		COLLECTIONS_TOOL_SCHEMAS.getCollection,
		async (params) => {
			const collection = await service.collections.getCollection(
				params.collection_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: collection.id,
								name: collection.name,
								slug: collection.slug,
								workspace_id: collection.workspace_id,
								created_at: collection.created_at,
								last_updated_at: collection.last_updated_at,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Update collection tool
	server.tool(
		"update_collection",
		"Update a collection's display name or description. Does not affect prompts within the collection.",
		COLLECTIONS_TOOL_SCHEMAS.updateCollection,
		async (params) => {
			await service.collections.updateCollection(params.collection_id, {
				name: params.name,
				description: params.description,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated collection "${params.collection_id}"`,
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

	// Phase 1: Delete collection tool
	server.tool(
		"delete_collection",
		"Delete a prompt collection by ID. This action cannot be undone. Prompts inside the collection are not deleted but lose their grouping and move to the top level. Reassign prompts to another collection first if organization must be preserved.",
		COLLECTIONS_TOOL_SCHEMAS.deleteCollection,
		async (params) => {
			const result = await service.collections.deleteCollection(
				params.collection_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted collection "${params.collection_id}"`,
								success: result.success,
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
