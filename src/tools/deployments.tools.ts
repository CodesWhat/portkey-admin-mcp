import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import { jsonResult } from "./utils.js";

const binaryFlagSchema = z.union([z.literal(0), z.literal(1)]);
const deploymentTypeSchema = z.enum(["production", "non_production"]);
const deploymentStatusSchema = z.enum(["active", "archived"]);

const authSettingsSchema = {
	gateway_base_url: z.url().optional().describe("Self-hosted Gateway base URL"),
	mcp_gateway_base_url: z.url().optional().describe("MCP Gateway base URL"),
	is_dataservice_hosted: binaryFlagSchema
		.optional()
		.describe("Whether the deployment hosts its own data service"),
	is_playground_proxy_allowed: binaryFlagSchema
		.optional()
		.describe("Whether Playground proxy traffic is allowed"),
	workspaces_allowed: z
		.array(z.string())
		.optional()
		.describe("Workspace slugs this deployment may serve; empty allows all"),
	jwt_subs_allowed: z
		.array(z.string())
		.optional()
		.describe("JWT subject values allowed to use the deployment"),
	jwt_sub_workspace_mapping: z
		.record(z.string(), z.string())
		.optional()
		.describe("JWT subject to workspace-slug mapping"),
} as const;

const DEPLOYMENTS_TOOL_SCHEMAS = {
	listDeployments: {
		organisation_id: z
			.string()
			.optional()
			.describe("Filter by organisation UUID"),
		status: deploymentStatusSchema
			.optional()
			.describe("Filter by deployment status"),
		type: deploymentTypeSchema.optional().describe("Filter by deployment type"),
		workspace_slug: z
			.array(z.string())
			.optional()
			.describe("Filter by one or more workspace slugs"),
		search: z.string().optional().describe("Search deployment names"),
	},
	registerDeployment: {
		name: z.string().min(1).describe("Deployment display name"),
		organisation_id: z.string().optional().describe("Owning organisation UUID"),
		slug: z
			.string()
			.min(1)
			.max(50)
			.optional()
			.describe("Optional deployment slug"),
		type: deploymentTypeSchema
			.optional()
			.describe("Production or non-production deployment type"),
		deployment_config: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Gateway deployment configuration"),
		is_default: z
			.boolean()
			.optional()
			.describe("Make this the default deployment"),
		...authSettingsSchema,
	},
	getDeployment: {
		id: z.string().min(1).describe("Deployment UUID or self"),
		organisation_id: z.string().optional().describe("Organisation UUID scope"),
	},
	updateDeployment: {
		id: z.string().min(1).describe("Deployment UUID"),
		name: z.string().optional().describe("Replacement display name"),
		type: deploymentTypeSchema
			.optional()
			.describe("Replacement deployment type"),
		status: deploymentStatusSchema
			.optional()
			.describe("Replacement deployment status"),
		deployment_config: z
			.record(z.string(), z.unknown())
			.nullable()
			.optional()
			.describe("Replacement Gateway configuration, or null to clear it"),
		is_default: z
			.boolean()
			.optional()
			.describe("Whether this is the default deployment"),
		rotate_auth: z
			.boolean()
			.optional()
			.describe("Rotate the one-time deployment authentication secret"),
		override_existing: z
			.boolean()
			.optional()
			.describe("Allow replacement of existing deployment settings"),
		...authSettingsSchema,
		allow_all_workspaces: z
			.boolean()
			.optional()
			.describe("Clear workspace restrictions and allow every workspace"),
		remove_workspaces_allowed: z
			.array(z.string())
			.optional()
			.describe("Workspace slugs to remove from the allowlist"),
		remove_subs_allowed: z
			.array(z.string())
			.optional()
			.describe("JWT subject values to remove from the allowlist"),
	},
	archiveDeployment: {
		id: z.string().min(1).describe("Deployment UUID to archive"),
	},
} as const;

function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as T;
}

function authSettingsFrom(
	params: Record<string, unknown>,
	includeUpdates = false,
): Record<string, unknown> | undefined {
	const keys = [
		"gateway_base_url",
		"mcp_gateway_base_url",
		"is_dataservice_hosted",
		"is_playground_proxy_allowed",
		"workspaces_allowed",
		"jwt_subs_allowed",
		"jwt_sub_workspace_mapping",
		...(includeUpdates
			? [
					"allow_all_workspaces",
					"remove_workspaces_allowed",
					"remove_subs_allowed",
				]
			: []),
	];
	const settings = compact(
		Object.fromEntries(keys.map((key) => [key, params[key]])),
	);
	return Object.keys(settings).length > 0 ? settings : undefined;
}

function mutationResult(result: object): Record<string, unknown> {
	const payload = { ...result } as Record<string, unknown>;
	if (payload.client_auth === undefined && payload.credentials === undefined) {
		return payload;
	}
	return {
		...payload,
		handling:
			"Store these one-time credentials immediately in a secret manager. They are exposed to this MCP transcript and won't be shown unmasked again.",
	};
}

export function registerDeploymentsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"list_deployments",
		"Enterprise-gated. List registered self-hosted Gateway deployments with status, type, default state, and connection health. Use this before get_deployment, update_deployment, or archive_deployment to resolve a deployment ID.",
		DEPLOYMENTS_TOOL_SCHEMAS.listDeployments,
		async (params) => {
			const result = await service.deployments.listDeployments(params);
			return jsonResult({ total: result.total, deployments: result.data });
		},
	);

	server.tool(
		"register_deployment",
		"Enterprise-gated. Register a self-hosted Gateway deployment when onboarding a new control-plane target; use list_deployments for existing registrations. The response can contain authentication and registry credentials exactly once, exposed to this MCP transcript, so store them securely immediately and never log them.",
		DEPLOYMENTS_TOOL_SCHEMAS.registerDeployment,
		async (params) => {
			const auth_settings = authSettingsFrom(params);
			const result = await service.deployments.registerDeployment(
				compact({
					name: params.name,
					organisation_id: params.organisation_id,
					slug: params.slug,
					type: params.type,
					deployment_config: params.deployment_config,
					is_default: params.is_default,
					auth_settings,
				}),
			);
			return jsonResult(mutationResult(result));
		},
	);

	server.tool(
		"get_deployment",
		"Enterprise-gated. Get one registered Gateway deployment by UUID, or use self when authenticating as that deployment. Use list_deployments to resolve an ID; read responses contain only masked authentication and registry credential values.",
		DEPLOYMENTS_TOOL_SCHEMAS.getDeployment,
		async ({ id, organisation_id }) =>
			jsonResult(await service.deployments.getDeployment(id, organisation_id)),
	);

	server.tool(
		"update_deployment",
		"Enterprise-gated. Update a registered Gateway deployment, its workspace or JWT-sub access, or rotate its authentication secret. Use get_deployment first to inspect current settings. Rotation returns the new secret once in this MCP transcript, so store it securely immediately.",
		DEPLOYMENTS_TOOL_SCHEMAS.updateDeployment,
		async (params) => {
			const auth_settings = authSettingsFrom(params, true);
			const result = await service.deployments.updateDeployment(
				params.id,
				compact({
					name: params.name,
					type: params.type,
					status: params.status,
					deployment_config: params.deployment_config,
					is_default: params.is_default,
					rotate_auth: params.rotate_auth,
					override_existing: params.override_existing,
					auth_settings,
				}),
			);
			return jsonResult(mutationResult(result));
		},
	);

	server.tool(
		"archive_deployment",
		"Enterprise-gated. Archive a registered Gateway deployment by UUID. Use get_deployment first to confirm the target. Portkey soft-deletes the record; this stops treating it as active but does not permanently remove its history.",
		DEPLOYMENTS_TOOL_SCHEMAS.archiveDeployment,
		async ({ id }) => {
			await service.deployments.archiveDeployment(id);
			return jsonResult({ success: true, id, status: "archived" });
		},
	);
}
