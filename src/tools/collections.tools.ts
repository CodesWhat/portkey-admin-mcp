import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerCollectionsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List collections tool
	server.tool(
		"list_collections",
		"List all prompt collections in your Portkey organization. Collections group prompts by app (e.g., hourlink, apizone, research-pilot).",
		{
			workspace_id: z.string().optional().describe("Filter by workspace ID"),
			search: z.string().optional().describe("Search collections by name"),
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z
				.number()
				.positive()
				.max(100)
				.optional()
				.describe("Results per page (max 100)"),
		},
		async (params) => {
			try {
				const collections = await service.listCollections(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing collections: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Create collection tool
	server.tool(
		"create_collection",
		"Create a new prompt collection for organizing prompts by app. Use one collection per app (hourlink, apizone, research-pilot).",
		{
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
		async (params) => {
			try {
				const result = await service.createCollection(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error creating collection: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get collection tool
	server.tool(
		"get_collection",
		"Retrieve detailed information about a specific collection",
		{
			collection_id: z.string().describe("Collection ID or slug to retrieve"),
		},
		async (params) => {
			try {
				const collection = await service.getCollection(params.collection_id);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching collection: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update collection tool
	server.tool(
		"update_collection",
		"Update a collection's name or description",
		{
			collection_id: z.string().describe("Collection ID to update"),
			name: z.string().optional().describe("New name for the collection"),
			description: z
				.string()
				.optional()
				.describe("New description for the collection"),
		},
		async (params) => {
			try {
				const result = await service.updateCollection(params.collection_id, {
					name: params.name,
					description: params.description,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully updated collection`,
									id: result.id,
									name: result.name,
									slug: result.slug,
									workspace_id: result.workspace_id,
									last_updated_at: result.last_updated_at,
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
							text: `Error updating collection: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Delete collection tool
	server.tool(
		"delete_collection",
		"Delete a collection by ID. This action cannot be undone. Prompts in this collection will become orphaned.",
		{
			collection_id: z.string().describe("Collection ID to delete"),
		},
		async (params) => {
			try {
				const result = await service.deleteCollection(params.collection_id);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting collection: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
