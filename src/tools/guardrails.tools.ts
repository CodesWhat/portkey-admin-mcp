import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

// Zod schemas for guardrail check parameters
const guardrailCheckSchema = z.object({
	id: z
		.string()
		.describe("Check identifier (e.g., 'default.jwt', 'default.pii')"),
	name: z.string().optional().describe("Display name for the check"),
	is_enabled: z.boolean().optional().describe("Whether the check is enabled"),
	parameters: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Check-specific configuration parameters"),
});

const guardrailFeedbackSchema = z.object({
	value: z.coerce.number().optional().describe("Feedback value"),
	weight: z.coerce.number().optional().describe("Feedback weight"),
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Additional metadata"),
});

const guardrailActionSchema = z.object({
	deny: z
		.boolean()
		.optional()
		.describe("Whether to deny the request on check failure"),
	async: z
		.boolean()
		.optional()
		.describe("Whether to run checks asynchronously"),
	on_success: guardrailFeedbackSchema
		.optional()
		.describe("Feedback configuration for successful checks"),
	on_fail: guardrailFeedbackSchema
		.optional()
		.describe("Feedback configuration for failed checks"),
	on_fail_action: z
		.string()
		.optional()
		.describe("Simple action on failure (e.g., 'block')"),
	message: z
		.string()
		.optional()
		.describe("Message to return when guardrail triggers"),
});

const GUARDRAILS_TOOL_SCHEMAS = {
	listGuardrails: {
		workspace_id: z
			.string()
			.optional()
			.describe("Filter guardrails by workspace ID"),
		organisation_id: z
			.string()
			.optional()
			.describe("Filter guardrails by organization ID"),
		page_size: z.coerce
			.number()
			.min(1)
			.max(1000)
			.optional()
			.describe("Number of items per page (1-1000, default: 100)"),
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
	},
	getGuardrail: {
		guardrail_id: z
			.string()
			.describe("The guardrail UUID or slug (with guard_ prefix) to retrieve"),
	},
	createGuardrail: {
		name: z.string().describe("Name of the guardrail"),
		checks: z
			.array(guardrailCheckSchema)
			.min(1)
			.describe("Array of checks to apply (at least one required)"),
		actions: guardrailActionSchema.describe(
			"Actions to take when guardrail checks pass or fail",
		),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID to create the guardrail in"),
		organisation_id: z
			.string()
			.optional()
			.describe("Organisation ID (required if workspace_id not provided)"),
	},
	updateGuardrail: {
		guardrail_id: z.string().describe("The guardrail UUID or slug to update"),
		name: z.string().optional().describe("New name for the guardrail"),
		checks: z
			.array(guardrailCheckSchema)
			.min(1)
			.optional()
			.describe("Updated array of checks to apply"),
		actions: guardrailActionSchema
			.optional()
			.describe("Updated actions configuration"),
	},
	deleteGuardrail: {
		guardrail_id: z.string().describe("The guardrail UUID or slug to delete"),
	},
} as const;

export function registerGuardrailsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List guardrails tool
	server.tool(
		"list_guardrails",
		"List all guardrails in your Portkey organization with optional filtering by workspace or organization. Guardrails are content moderation and security policies applied to AI requests. Use to discover guardrail IDs and slugs before inspecting or modifying them.",
		GUARDRAILS_TOOL_SCHEMAS.listGuardrails,
		async (params) => {
			const result = await service.guardrails.listGuardrails(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								guardrails: result.data.map((guardrail) => ({
									id: guardrail.id,
									name: guardrail.name,
									slug: guardrail.slug,
									status: guardrail.status,
									workspace_id: guardrail.workspace_id,
									organisation_id: guardrail.organisation_id,
									created_at: guardrail.created_at,
									last_updated_at: guardrail.last_updated_at,
									owner_id: guardrail.owner_id,
									updated_by: guardrail.updated_by,
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

	// Get guardrail tool
	server.tool(
		"get_guardrail",
		"Retrieve detailed information about a specific guardrail, including its full checks and actions configuration. Use when you need to inspect or modify a guardrail's rules, or to understand what checks are applied before updating.",
		GUARDRAILS_TOOL_SCHEMAS.getGuardrail,
		async (params) => {
			const guardrail = await service.guardrails.getGuardrail(
				params.guardrail_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: guardrail.id,
								name: guardrail.name,
								slug: guardrail.slug,
								status: guardrail.status,
								workspace_id: guardrail.workspace_id,
								organisation_id: guardrail.organisation_id,
								checks: guardrail.checks,
								actions: guardrail.actions,
								created_at: guardrail.created_at,
								last_updated_at: guardrail.last_updated_at,
								owner_id: guardrail.owner_id,
								updated_by: guardrail.updated_by,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Create guardrail tool
	server.tool(
		"create_guardrail",
		"Create a new guardrail with specified checks and actions for content moderation and security. Guardrails are applied to requests via configs -- create the guardrail first, then reference it in a config. checks is an array of check objects with id (e.g. 'default.jwt', 'default.pii'), optional name, is_enabled boolean, and parameters object.",
		GUARDRAILS_TOOL_SCHEMAS.createGuardrail,
		async (params) => {
			const result = await service.guardrails.createGuardrail({
				name: params.name,
				checks: params.checks,
				actions: params.actions,
				workspace_id: params.workspace_id,
				organisation_id: params.organisation_id,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created guardrail "${params.name}"`,
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

	// Update guardrail tool
	server.tool(
		"update_guardrail",
		"Update an existing guardrail's name, checks, or actions configuration. Creates a new version of the guardrail; existing references in configs continue working with the latest version.",
		GUARDRAILS_TOOL_SCHEMAS.updateGuardrail,
		async (params) => {
			const updateData: {
				name?: string;
				checks?: typeof params.checks;
				actions?: typeof params.actions;
			} = {};

			if (params.name !== undefined) {
				updateData.name = params.name;
			}
			if (params.checks !== undefined) {
				updateData.checks = params.checks;
			}
			if (params.actions !== undefined) {
				updateData.actions = params.actions;
			}

			const result = await service.guardrails.updateGuardrail(
				params.guardrail_id,
				updateData,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated guardrail "${params.guardrail_id}"`,
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

	// Delete guardrail tool
	server.tool(
		"delete_guardrail",
		"Delete a guardrail by its ID or slug. This action cannot be undone. Configs referencing this guardrail as a before/after request hook will stop enforcing it, silently dropping the safety check. Review dependent configs before deleting.",
		GUARDRAILS_TOOL_SCHEMAS.deleteGuardrail,
		async (params) => {
			const result = await service.guardrails.deleteGuardrail(
				params.guardrail_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted guardrail "${params.guardrail_id}"`,
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
