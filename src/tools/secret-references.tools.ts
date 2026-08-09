import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type { SecretManagerType } from "../services/secret-references.service.js";
import { jsonResult } from "./utils.js";

const authFields = {
	aws_auth_type: z
		.enum(["accessKey", "assumedRole", "serviceRole"])
		.describe(
			"AWS authentication mode: accessKey uses a key pair, assumedRole uses an IAM role, and serviceRole uses the runtime workload identity",
		),
	aws_access_key_id: z
		.string()
		.min(1)
		.describe("AWS access key ID; required when aws_auth_type is accessKey"),
	aws_secret_access_key: z
		.string()
		.min(1)
		.describe(
			"AWS secret access key; required when aws_auth_type is accessKey and exposed to the MCP transcript",
		),
	aws_region: z
		.string()
		.min(1)
		.describe("AWS region containing the secret, for example us-east-1"),
	aws_role_arn: z
		.string()
		.min(1)
		.describe(
			"IAM role ARN to assume; required when aws_auth_type is assumedRole",
		),
	aws_external_id: z
		.string()
		.nullable()
		.describe("Optional external ID required by the target IAM role"),
	azure_auth_mode: z
		.enum(["entra", "managed", "default"])
		.describe(
			"Azure authentication mode: entra uses a client secret, managed uses managed identity, and default uses the runtime credential chain",
		),
	azure_entra_tenant_id: z
		.string()
		.min(1)
		.describe("Microsoft Entra tenant ID; required for entra authentication"),
	azure_entra_client_id: z
		.string()
		.min(1)
		.describe(
			"Microsoft Entra application client ID; required for entra authentication",
		),
	azure_entra_client_secret: z
		.string()
		.min(1)
		.describe(
			"Microsoft Entra client secret; required for entra authentication and exposed to the MCP transcript",
		),
	azure_managed_client_id: z
		.string()
		.min(1)
		.describe(
			"Optional client ID of a user-assigned managed identity; omit for the system-assigned identity",
		),
	azure_vault_url: z
		.url()
		.describe(
			"Azure Key Vault URL, for example https://example.vault.azure.net",
		),
	vault_auth_type: z
		.enum(["token", "approle", "kubernetes"])
		.describe(
			"HashiCorp Vault authentication mode: token, AppRole, or Kubernetes",
		),
	vault_addr: z.url().describe("Base URL of the HashiCorp Vault server"),
	vault_token: z
		.string()
		.min(1)
		.describe(
			"HashiCorp Vault token; required for token authentication and exposed to the MCP transcript",
		),
	vault_namespace: z
		.string()
		.min(1)
		.describe("Optional HashiCorp Vault Enterprise namespace"),
	vault_role_id: z
		.string()
		.min(1)
		.describe(
			"HashiCorp Vault AppRole role ID; required for approle authentication",
		),
	vault_secret_id: z
		.string()
		.min(1)
		.describe(
			"HashiCorp Vault AppRole secret ID; required for approle authentication and exposed to the MCP transcript",
		),
	vault_role: z
		.string()
		.min(1)
		.describe("HashiCorp Vault Kubernetes auth role name"),
} as const;

const authConfigSchema = z.union([
	z
		.object({
			aws_auth_type: z
				.literal("accessKey")
				.describe("Use an AWS access key ID and secret access key"),
			aws_access_key_id: authFields.aws_access_key_id,
			aws_secret_access_key: authFields.aws_secret_access_key,
			aws_region: authFields.aws_region,
		})
		.strict(),
	z
		.object({
			aws_auth_type: z
				.literal("assumedRole")
				.describe("Assume the specified AWS IAM role"),
			aws_role_arn: authFields.aws_role_arn,
			aws_external_id: authFields.aws_external_id.optional(),
			aws_region: authFields.aws_region,
		})
		.strict(),
	z
		.object({
			aws_auth_type: z
				.literal("serviceRole")
				.describe("Use the AWS workload or service role available at runtime"),
			aws_region: z
				.string()
				.optional()
				.describe(
					"Optional AWS region containing the secret, for example us-east-1",
				),
		})
		.strict(),
	z
		.object({
			azure_auth_mode: z
				.literal("entra")
				.describe(
					"Authenticate with a Microsoft Entra application client secret",
				),
			azure_entra_tenant_id: authFields.azure_entra_tenant_id,
			azure_entra_client_id: authFields.azure_entra_client_id,
			azure_entra_client_secret: authFields.azure_entra_client_secret,
			azure_vault_url: authFields.azure_vault_url,
		})
		.strict(),
	z
		.object({
			azure_auth_mode: z
				.literal("managed")
				.describe("Authenticate with an Azure managed identity"),
			azure_managed_client_id: authFields.azure_managed_client_id.optional(),
			azure_vault_url: authFields.azure_vault_url,
		})
		.strict(),
	z
		.object({
			azure_auth_mode: z
				.literal("default")
				.describe("Use Azure's default runtime credential chain"),
			azure_vault_url: authFields.azure_vault_url,
		})
		.strict(),
	z
		.object({
			vault_auth_type: z
				.literal("token")
				.describe("Authenticate to HashiCorp Vault with a token"),
			vault_addr: authFields.vault_addr,
			vault_token: authFields.vault_token,
			vault_namespace: authFields.vault_namespace.optional(),
		})
		.strict(),
	z
		.object({
			vault_auth_type: z
				.literal("approle")
				.describe("Authenticate to HashiCorp Vault with AppRole credentials"),
			vault_addr: authFields.vault_addr,
			vault_role_id: authFields.vault_role_id,
			vault_secret_id: authFields.vault_secret_id,
			vault_namespace: authFields.vault_namespace.optional(),
		})
		.strict(),
	z
		.object({
			vault_auth_type: z
				.literal("kubernetes")
				.describe(
					"Authenticate to HashiCorp Vault with a Kubernetes service account",
				),
			vault_addr: authFields.vault_addr,
			vault_role: authFields.vault_role,
			vault_namespace: authFields.vault_namespace.optional(),
		})
		.strict(),
]);

const updateAuthConfigSchema = z.union([
	z
		.object({
			aws_auth_type: authFields.aws_auth_type.optional(),
			aws_access_key_id: authFields.aws_access_key_id.optional(),
			aws_secret_access_key: authFields.aws_secret_access_key.optional(),
			aws_region: z
				.string()
				.optional()
				.describe("AWS region containing the secret, for example us-east-1"),
			aws_role_arn: authFields.aws_role_arn.optional(),
			aws_external_id: authFields.aws_external_id.optional(),
		})
		.strict(),
	z
		.object({
			azure_auth_mode: authFields.azure_auth_mode.optional(),
			azure_entra_tenant_id: authFields.azure_entra_tenant_id.optional(),
			azure_entra_client_id: authFields.azure_entra_client_id.optional(),
			azure_entra_client_secret:
				authFields.azure_entra_client_secret.optional(),
			azure_managed_client_id: z
				.string()
				.optional()
				.describe(
					"Optional client ID of a user-assigned managed identity; omit for the system-assigned identity",
				),
			azure_vault_url: authFields.azure_vault_url.optional(),
		})
		.strict(),
	z
		.object({
			vault_auth_type: authFields.vault_auth_type.optional(),
			vault_addr: authFields.vault_addr.optional(),
			vault_token: authFields.vault_token.optional(),
			vault_namespace: z
				.string()
				.optional()
				.describe("Optional HashiCorp Vault Enterprise namespace"),
			vault_role_id: authFields.vault_role_id.optional(),
			vault_secret_id: authFields.vault_secret_id.optional(),
			vault_role: authFields.vault_role.optional(),
		})
		.strict(),
]);

const managerTypeSchema = z
	.enum(["aws_sm", "azure_kv", "hashicorp_vault"])
	.describe(
		"External secret manager: aws_sm for AWS Secrets Manager, azure_kv for Azure Key Vault, or hashicorp_vault for HashiCorp Vault; must match the auth_config field family",
	);
const tagsSchema = z
	.record(z.string(), z.string())
	.describe("Tag filters or metadata as string key-value pairs");

const SECRET_REFERENCE_TOOL_SCHEMAS = {
	create: {
		name: z.string().min(1).max(255).describe("Human-readable name"),
		manager_type: managerTypeSchema,
		auth_config: authConfigSchema.describe(
			"Choose exactly one documented authentication shape matching manager_type. Credentials are sent to Portkey and visible in the MCP transcript; prefer workload identity or short-lived credentials when available.",
		),
		secret_path: z
			.string()
			.max(1024)
			.describe("Path of the secret in the external secret manager"),
		organisation_id: z
			.string()
			.uuid()
			.optional()
			.describe(
				"Organisation UUID; required when the MCP server is not authenticated with a Portkey API key",
			),
		slug: z
			.string()
			.max(255)
			.regex(/^[a-zA-Z0-9_-]+$/)
			.optional()
			.describe(
				"Optional stable slug containing only letters, numbers, underscores, or hyphens; Portkey generates one when omitted",
			),
		description: z
			.string()
			.max(1024)
			.nullable()
			.optional()
			.describe("Optional description; use null to leave it empty"),
		secret_key: z
			.string()
			.max(255)
			.nullable()
			.optional()
			.describe(
				"Optional key within a structured external secret; null uses the whole secret value",
			),
		allow_all_workspaces: z
			.boolean()
			.optional()
			.describe(
				"Whether every workspace may use this reference; defaults to true and cannot be true with allowed_workspaces",
			),
		allowed_workspaces: z
			.array(z.string())
			.min(1)
			.optional()
			.describe(
				"Workspace UUIDs or slugs allowed to use this reference; omit when allow_all_workspaces is true",
			),
		tags: tagsSchema
			.nullable()
			.optional()
			.describe(
				"Optional string key-value tags for filtering and organization",
			),
	},
	list: {
		manager_type: managerTypeSchema
			.optional()
			.describe(
				"Filter by external secret manager: aws_sm, azure_kv, or hashicorp_vault",
			),
		tags: tagsSchema
			.optional()
			.describe("Return references matching these tags"),
		search: z
			.string()
			.min(1)
			.max(255)
			.optional()
			.describe("Search references by name"),
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Zero-based page number; defaults to 0"),
		page_size: z.coerce
			.number()
			.int()
			.min(1)
			.max(100)
			.optional()
			.describe("References per page, from 1 to 100; defaults to 20"),
	},
	get: {
		id: z.string().min(1).describe("Secret Reference UUID or slug"),
	},
	update: {
		id: z.string().min(1).describe("Secret Reference UUID or slug"),
		name: z
			.string()
			.min(1)
			.max(255)
			.optional()
			.describe("New human-readable name"),
		description: z
			.string()
			.max(1024)
			.nullable()
			.optional()
			.describe("New description, or null to clear it"),
		auth_config: updateAuthConfigSchema
			.optional()
			.describe(
				"Provide at least one changed authentication field to merge into the existing configuration; choose one AWS, Azure, or HashiCorp field family and do not mix families",
			),
		secret_path: z
			.string()
			.max(1024)
			.optional()
			.describe("New path of the secret in the external secret manager"),
		secret_key: z
			.string()
			.max(255)
			.nullable()
			.optional()
			.describe(
				"New key within a structured secret, or null to use the whole value",
			),
		allow_all_workspaces: z
			.boolean()
			.optional()
			.describe(
				"Whether every workspace may use this reference; cannot be true with allowed_workspaces",
			),
		allowed_workspaces: z
			.array(z.string())
			.min(1)
			.optional()
			.describe(
				"Replacement list of workspace UUIDs or slugs allowed to use this reference; supplying it sets allow_all_workspaces=false",
			),
		tags: tagsSchema
			.nullable()
			.optional()
			.describe("Replacement string key-value tags, or null to clear them"),
	},
	delete: {
		id: z.string().min(1).describe("Secret Reference UUID or slug"),
	},
} as const;

function validateWorkspaceAccess(value: {
	allow_all_workspaces?: boolean;
	allowed_workspaces?: string[];
}): void {
	if (value.allow_all_workspaces === true && value.allowed_workspaces) {
		throw new Error(
			"allow_all_workspaces=true is mutually exclusive with allowed_workspaces",
		);
	}
}

function validateManagerAuth(
	managerType: SecretManagerType,
	authConfig: Record<string, unknown>,
): void {
	const matches =
		(managerType === "aws_sm" && "aws_auth_type" in authConfig) ||
		(managerType === "azure_kv" && "azure_auth_mode" in authConfig) ||
		(managerType === "hashicorp_vault" && "vault_auth_type" in authConfig);
	if (!matches) {
		throw new Error(`auth_config does not match manager_type ${managerType}`);
	}
}

function validateAuthUpdate(authConfig: Record<string, unknown>): void {
	if (Object.keys(authConfig).length === 0) {
		throw new Error("auth_config update must contain at least one field");
	}
	const families = new Set(
		Object.keys(authConfig).map((key) => {
			if (key.startsWith("aws_")) return "AWS";
			if (key.startsWith("azure_")) return "Azure";
			if (key.startsWith("vault_")) return "HashiCorp Vault";
			return "unknown";
		}),
	);
	if (families.size > 1) {
		throw new Error(
			"auth_config update must contain fields for exactly one secret-manager family",
		);
	}
}

const SENSITIVE_AUTH_FIELD =
	/(?:secret|token|password|credential|access_key_id)/i;

function redactAuthConfig(
	authConfig: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(authConfig).map(([key, value]) => {
			if (SENSITIVE_AUTH_FIELD.test(key)) return [key, "[REDACTED]"];
			if (value && typeof value === "object" && !Array.isArray(value)) {
				return [key, redactAuthConfig(value as Record<string, unknown>)];
			}
			return [key, value];
		}),
	);
}

export function registerSecretReferencesTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"create_secret_reference",
		"Create a reference to a secret stored in AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault. Authentication credentials are sent to Portkey and exposed to this MCP transcript; use short-lived or workload identity modes when possible. Returns the new UUID and slug, never the resolved external secret.",
		SECRET_REFERENCE_TOOL_SCHEMAS.create,
		{
			title: "Create Secret Reference",
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		async (params) => {
			validateWorkspaceAccess(params);
			validateManagerAuth(params.manager_type, params.auth_config);
			const result =
				await service.secretReferences.createSecretReference(params);
			return jsonResult({
				message: `Successfully created Secret Reference "${result.slug}"`,
				id: result.id,
				slug: result.slug,
			});
		},
	);

	server.tool(
		"list_secret_references",
		"List Secret References without returning authentication configuration or resolved secret values. Filter by manager type, tags, or name and use a returned UUID or slug with get_secret_reference.",
		SECRET_REFERENCE_TOOL_SCHEMAS.list,
		{
			title: "List Secret References",
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) => {
			const result = await service.secretReferences.listSecretReferences({
				...params,
				tags: params.tags ? JSON.stringify(params.tags) : undefined,
			});
			return jsonResult({
				total: result.total,
				secret_references: result.data.map((reference) => ({
					id: reference.id,
					name: reference.name,
					slug: reference.slug,
					manager_type: reference.manager_type,
					status: reference.status,
					created_at: reference.created_at,
					last_updated_at: reference.last_updated_at,
				})),
			});
		},
	);

	server.tool(
		"get_secret_reference",
		"Retrieve one Secret Reference by UUID or slug. Portkey masks sensitive authentication fields for non-system users; the tool returns metadata and the masked auth configuration, not the resolved external secret value.",
		SECRET_REFERENCE_TOOL_SCHEMAS.get,
		{
			title: "Get Secret Reference",
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async ({ id }) => {
			const result = await service.secretReferences.getSecretReference(id);
			return jsonResult({
				...result,
				auth_config: redactAuthConfig(result.auth_config),
			});
		},
	);

	server.tool(
		"update_secret_reference",
		"Update at least one selected field on a Secret Reference. auth_config is merged into the existing manager-specific configuration. allowed_workspaces replaces all workspace mappings and sets allow_all_workspaces=false; allow_all_workspaces=true removes workspace-specific mappings. Credential values are sent to Portkey and exposed to the MCP transcript.",
		SECRET_REFERENCE_TOOL_SCHEMAS.update,
		{
			title: "Update Secret Reference",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async ({ id, ...updates }) => {
			validateWorkspaceAccess(updates);
			if (Object.keys(updates).length === 0) {
				throw new Error("Provide at least one field to update");
			}
			if (updates.auth_config) validateAuthUpdate(updates.auth_config);
			await service.secretReferences.updateSecretReference(id, updates);
			return jsonResult({
				message: `Successfully updated Secret Reference "${id}"`,
				success: true,
			});
		},
	);

	server.tool(
		"delete_secret_reference",
		"Permanently delete a Secret Reference. This is irreversible and integrations or virtual keys using it can fail to resolve credentials immediately; confirm dependencies before deletion.",
		SECRET_REFERENCE_TOOL_SCHEMAS.delete,
		{
			title: "Delete Secret Reference",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async ({ id }) => {
			const result = await service.secretReferences.deleteSecretReference(id);
			return jsonResult({
				message: `Successfully deleted Secret Reference "${id}"`,
				success: result.success,
			});
		},
	);
}
