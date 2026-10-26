import type {
	CallToolResult,
	McpServer,
	ToolCallback,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { Logger } from "../lib/logger.js";
import { isRecord } from "../lib/type-guards.js";
import {
	AccessPolicySchema,
	CreateAccessPolicyResponseSchema,
	ListAccessPoliciesResponseSchema,
} from "../schemas/contracts/access-policies.contract.js";
import {
	CreateEgressAllowlistResponseSchema,
	EgressAllowlistEntrySchema,
	ListEgressAllowlistResponseSchema,
} from "../schemas/contracts/egress-allowlist.contract.js";
import { SecretManagerTypeSchema } from "../schemas/contracts/secret-references.contract.js";
import type { PortkeyService } from "../services/index.js";
import { registerAccessPoliciesTools } from "./access-policies.tools.js";
import { registerAnalyticsTools } from "./analytics.tools.js";
import { registerAuditTools } from "./audit.tools.js";
import { registerCollectionsTools } from "./collections.tools.js";
import { registerConfigsTools } from "./configs.tools.js";
import { registerDeploymentsTools } from "./deployments.tools.js";
import { registerEgressAllowlistTools } from "./egress-allowlist.tools.js";
import { registerGuardrailsTools } from "./guardrails.tools.js";
import { registerIntegrationsTools } from "./integrations.tools.js";
import { registerKeysTools } from "./keys.tools.js";
import { registerLabelsTools } from "./labels.tools.js";
import { registerLimitsTools } from "./limits.tools.js";
import { registerLoggingTools } from "./logging.tools.js";
import { registerMcpIntegrationsTools } from "./mcp-integrations.tools.js";
import { registerMcpServersTools } from "./mcp-servers.tools.js";
import { registerPartialsTools } from "./partials.tools.js";
import { registerPromptsTools } from "./prompts.tools.js";
import { registerProvidersTools } from "./providers.tools.js";
import { registerSecretReferencesTools } from "./secret-references.tools.js";
import { registerTracingTools } from "./tracing.tools.js";
import { registerUsersTools } from "./users.tools.js";
import { registerWorkspacesTools } from "./workspaces.tools.js";

type ToolRegistrar = (server: McpServer, service: PortkeyService) => void;

const TOOL_DOMAIN_REGISTRARS = [
	["access-policies", registerAccessPoliciesTools],
	["egress-allowlist", registerEgressAllowlistTools],
	["users", registerUsersTools],
	["workspaces", registerWorkspacesTools],
	["configs", registerConfigsTools],
	["deployments", registerDeploymentsTools],
	["keys", registerKeysTools],
	["collections", registerCollectionsTools],
	["prompts", registerPromptsTools],
	["analytics", registerAnalyticsTools],
	["guardrails", registerGuardrailsTools],
	["limits", registerLimitsTools],
	["audit", registerAuditTools],
	["labels", registerLabelsTools],
	["partials", registerPartialsTools],
	["tracing", registerTracingTools],
	["logging", registerLoggingTools],
	["providers", registerProvidersTools],
	["secret-references", registerSecretReferencesTools],
	["integrations", registerIntegrationsTools],
	["mcp-integrations", registerMcpIntegrationsTools],
	["mcp-servers", registerMcpServersTools],
] as const satisfies readonly (readonly [string, ToolRegistrar])[];

export type ToolDomain = (typeof TOOL_DOMAIN_REGISTRARS)[number][0];

export interface RegisterAllToolsOptions {
	domains?: readonly ToolDomain[];
}

export const TOOL_DOMAIN_NAMES = TOOL_DOMAIN_REGISTRARS.map(
	([domain]) => domain,
) as ToolDomain[];

const TOOL_DOMAIN_NAME_SET = new Set<string>(TOOL_DOMAIN_NAMES);

export function isToolDomain(value: string): value is ToolDomain {
	return TOOL_DOMAIN_NAME_SET.has(value);
}

export function normalizeToolDomains(
	domains: Iterable<ToolDomain>,
): ToolDomain[] {
	const selectedDomains = new Set(domains);

	return TOOL_DOMAIN_REGISTRARS.filter(([domain]) =>
		selectedDomains.has(domain),
	).map(([domain]) => domain);
}

type ToolAnnotations = {
	title?: string;
	readOnlyHint: boolean;
	destructiveHint: boolean;
	idempotentHint: boolean;
	openWorldHint: boolean;
};

const TOOL_ANNOTATION_KEYS = new Set([
	"title",
	"readOnlyHint",
	"destructiveHint",
	"idempotentHint",
	"openWorldHint",
]);

const READ_ONLY_IDEMPOTENT_TOOL_PREFIXES = [
	"get_",
	"list_",
	"validate_",
	"render_",
	"download_",
] as const;

const DESTRUCTIVE_TOOL_PREFIXES = [
	"delete_",
	"remove_",
	"cancel_",
	"reset_",
] as const;

const ENTERPRISE_GATED_TOOL_NAMES = new Set([
	"get_cost_analytics",
	"get_request_analytics",
	"get_token_analytics",
	"get_latency_analytics",
	"get_error_analytics",
	"get_error_rate_analytics",
	"get_cache_hit_latency",
	"get_cache_hit_rate",
	"get_cache_summary",
	"get_users_analytics",
	"get_error_stacks_analytics",
	"get_error_status_codes_analytics",
	"get_user_requests_analytics",
	"get_rescued_requests_analytics",
	"get_feedback_analytics",
	"get_feedback_models_analytics",
	"get_feedback_scores_analytics",
	"get_feedback_weighted_analytics",
	"get_analytics_group_users",
	"get_analytics_group_models",
	"get_analytics_group_metadata",
	"get_analytics_group_providers",
	"get_analytics_group_mcp",
	"get_analytics_group_a2a",
	"get_analytics_group_workspaces",
	"list_deployments",
	"register_deployment",
	"get_deployment",
	"update_deployment",
	"archive_deployment",
	"list_audit_logs",
	"get_integration",
	"list_integration_models",
	"list_integration_workspaces",
	"list_all_users",
	"get_user",
	"list_user_invites",
	"get_user_stats",
	"get_organisation_defaults",
	"update_organisation_defaults",
	"list_input_guardrail_workspace_exclusions",
	"update_input_guardrail_workspace_exclusions",
	"list_output_guardrail_workspace_exclusions",
	"update_output_guardrail_workspace_exclusions",
	"create_log_export",
	"list_log_exports",
	"get_log_export",
	"start_log_export",
	"cancel_log_export",
	"download_log_export",
	"update_log_export",
	"get_log_export_field_restrictions",
	"list_scim_workspace_mappings",
	"create_scim_workspace_mapping",
	"delete_scim_workspace_mapping",
	"list_scim_groups",
]);

const ENTERPRISE_GATED_DESCRIPTION_NOTE =
	"Enterprise-gated. Returns 403 on non-Enterprise Portkey plans.";

function isToolAnnotationsLike(
	value: unknown,
): value is Partial<ToolAnnotations> {
	if (!isRecord(value)) {
		return false;
	}

	const keys = Object.keys(value);
	if (
		keys.length === 0 ||
		!keys.every((key) => TOOL_ANNOTATION_KEYS.has(key))
	) {
		return false;
	}

	return Object.values(value).every(
		(entry) =>
			entry === undefined ||
			typeof entry === "boolean" ||
			typeof entry === "string",
	);
}

function inferToolAnnotations(toolName: string): ToolAnnotations {
	if (
		READ_ONLY_IDEMPOTENT_TOOL_PREFIXES.some((prefix) =>
			toolName.startsWith(prefix),
		)
	) {
		return {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		};
	}

	if (DESTRUCTIVE_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix))) {
		return {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		};
	}

	return {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: true,
	};
}

function augmentToolDescription(
	toolName: string,
	description: string | undefined,
): string | undefined {
	if (!description || !ENTERPRISE_GATED_TOOL_NAMES.has(toolName)) {
		return description;
	}

	if (description.includes(ENTERPRISE_GATED_DESCRIPTION_NOTE)) {
		return description;
	}

	return `${description} ${ENTERPRISE_GATED_DESCRIPTION_NOTE}`;
}

/**
 * Render a schema validation failure as one actionable sentence.
 *
 * ZodError.message is a JSON dump of the raw issue array. Surfacing that to an
 * MCP client buries the useful part — the field name and what it wants — in
 * serialized noise, so issues are flattened to "field: message" instead. The
 * path is omitted when the message already names the field, which the
 * superRefine checks in this codebase generally do.
 *
 * The match is on a word boundary, not a substring: path "id" appears inside
 * Zod's stock "Invalid input" and would otherwise suppress the field name on
 * exactly the messages that need it most.
 */
function formatZodIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.join(".");
			if (!path) {
				return issue.message;
			}

			const namesPath = new RegExp(`\\b${escapeRegExp(path)}\\b`).test(
				issue.message,
			);
			return namesPath ? issue.message : `${path}: ${issue.message}`;
		})
		.join("; ");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getToolErrorMessage(error: unknown): string {
	if (error instanceof z.ZodError) {
		return formatZodIssues(error);
	}

	if (error instanceof Error && error.message) {
		return error.message;
	}

	return String(error);
}

type StandardToolSuccessEnvelope = {
	ok: true;
	data: unknown;
};

type StandardToolErrorEnvelope = {
	ok: false;
	error: {
		message: string;
		details?: unknown;
	};
};

type StandardToolEnvelope =
	| StandardToolSuccessEnvelope
	| StandardToolErrorEnvelope;

const STANDARD_TOOL_OUTPUT_SCHEMA = {
	ok: z
		.boolean()
		.describe("Whether the tool call succeeded and returned structured data"),
	data: z
		.unknown()
		.optional()
		.describe("Structured success payload when ok is true"),
	error: z
		.object({
			message: z.string().describe("Human-readable error message"),
			details: z
				.unknown()
				.optional()
				.describe("Optional structured error details"),
		})
		.optional()
		.describe("Structured error payload when ok is false"),
} as const;

/*
 * Deliberate incremental adoption, not an abandoned migration. Every tool
 * already gets a valid outputSchema via getToolOutputSchema (the
 * STANDARD_TOOL_OUTPUT_SCHEMA envelope with `data: z.unknown()`), which
 * satisfies the TDQS gate on its own. Entries land here only when a tighter
 * `data` schema earns its keep, e.g.: the payload contains a one-time secret
 * or other value an LLM client must handle specially (rotate_api_key), or the
 * tool is newly added and its response shape is being nailed down up front
 * (the secret-references tools). Add a tool here when a caller would benefit
 * from structured validation/completion on its specific success shape, not
 * as a blanket backfill exercise, since z.unknown() is already correct for
 * payloads that don't need one.
 */
const TOOL_SUCCESS_DATA_SCHEMAS: Partial<Record<string, z.ZodType>> = {
	create_access_policy: CreateAccessPolicyResponseSchema,
	list_access_policies: ListAccessPoliciesResponseSchema,
	get_access_policy: AccessPolicySchema,
	update_access_policy: z.object({}),
	delete_access_policy: z.object({}),
	create_egress_allowlist_entry: CreateEgressAllowlistResponseSchema,
	list_egress_allowlist: ListEgressAllowlistResponseSchema,
	get_egress_allowlist_entry: EgressAllowlistEntrySchema,
	update_egress_allowlist_entry: z.object({}),
	delete_egress_allowlist_entry: z.object({}),
	rotate_api_key: z.object({
		message: z.string().describe("Rotation confirmation"),
		warning: z
			.string()
			.describe("Required handling guidance for the one-time secret"),
		id: z.string().uuid().describe("Rotated API key UUID"),
		key: z.string().describe("New API key secret, returned only once"),
		key_transition_expires_at: z.iso
			.datetime()
			.describe("Time when the previous key stops working"),
	}),
	create_secret_reference: z.object({
		message: z.string().describe("Creation confirmation"),
		id: z.string().uuid().describe("New Secret Reference UUID"),
		slug: z.string().describe("New Secret Reference slug"),
	}),
	list_secret_references: z.object({
		total: z.number().int().nonnegative().describe("Total matching references"),
		secret_references: z
			.array(
				z.object({
					id: z.string().uuid().describe("Secret Reference UUID"),
					name: z.string().describe("Human-readable name"),
					slug: z.string().describe("Stable Secret Reference slug"),
					manager_type: SecretManagerTypeSchema.describe(
						"External secret manager type",
					),
					status: z.literal("ACTIVE").describe("Current reference status"),
					created_at: z.iso.datetime().describe("ISO 8601 creation timestamp"),
					last_updated_at: z.iso
						.datetime()
						.describe("ISO 8601 last-update timestamp"),
				}),
			)
			.describe(
				"Current page of Secret References without authentication values",
			),
	}),
	get_secret_reference: z.object({
		id: z.string().uuid().describe("Secret Reference UUID"),
		organisation_id: z.string().uuid().describe("Owning organisation UUID"),
		name: z.string().describe("Human-readable name"),
		slug: z.string().describe("Stable Secret Reference slug"),
		description: z.string().nullable().describe("Reference description"),
		manager_type: SecretManagerTypeSchema.describe(
			"External secret manager type",
		),
		secret_path: z.string().describe("Path in the external secret manager"),
		secret_key: z
			.string()
			.nullable()
			.describe("Selected key within a structured secret"),
		allow_all_workspaces: z
			.boolean()
			.describe("Whether all workspaces may use the reference"),
		tags: z
			.record(z.string(), z.string())
			.nullable()
			.describe("String metadata tags"),
		status: z.literal("ACTIVE").describe("Current reference status"),
		created_by: z.string().describe("Creator identifier"),
		created_at: z.iso.datetime().describe("ISO 8601 creation timestamp"),
		last_updated_at: z.iso
			.datetime()
			.describe("ISO 8601 last-update timestamp"),
		auth_config: z
			.record(z.string(), z.unknown())
			.describe("Authentication configuration with sensitive values redacted"),
		object: z.literal("secret-reference").describe("Portkey object type"),
	}),
	update_secret_reference: z.object({
		message: z.string().describe("Update confirmation"),
		success: z.literal(true).describe("Whether the update succeeded"),
	}),
	delete_secret_reference: z.object({
		message: z.string().describe("Deletion confirmation"),
		success: z.literal(true).describe("Whether the deletion succeeded"),
	}),
};

function getToolOutputSchema(toolName: string) {
	const dataSchema = TOOL_SUCCESS_DATA_SCHEMAS[toolName];
	if (!dataSchema) return STANDARD_TOOL_OUTPUT_SCHEMA;

	return {
		...STANDARD_TOOL_OUTPUT_SCHEMA,
		data: dataSchema
			.optional()
			.describe("Structured success payload when ok is true"),
	};
}

function isStandardToolEnvelope(value: unknown): value is StandardToolEnvelope {
	if (!isRecord(value) || typeof value.ok !== "boolean") {
		return false;
	}

	if (value.ok) {
		return "data" in value;
	}

	return isRecord(value.error) && typeof value.error.message === "string";
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function getFirstTextContent(result: CallToolResult): string | undefined {
	const first = result.content?.[0];
	return first?.type === "text" ? first.text : undefined;
}

function getSuccessData(result: CallToolResult): unknown {
	const text = getFirstTextContent(result);
	if (text === undefined) {
		return null;
	}

	const parsed = tryParseJson(text);
	return parsed !== undefined ? parsed : { message: text };
}

function getErrorDetails(result: CallToolResult): {
	message: string;
	details?: unknown;
} {
	const text = getFirstTextContent(result);
	if (text === undefined) {
		return { message: "Tool execution failed" };
	}

	const parsed = tryParseJson(text);
	if (parsed === undefined) {
		return { message: text };
	}

	if (isRecord(parsed) && typeof parsed.message === "string") {
		return { message: parsed.message, details: parsed };
	}

	return { message: text, details: parsed };
}

function formatToolEnvelope(envelope: StandardToolEnvelope): string {
	return JSON.stringify(envelope);
}

function normalizeToolResult(result: CallToolResult): CallToolResult {
	// When a tool callback used jsonResult() (src/tools/utils.ts) with a plain
	// object payload, result.structuredContent already holds that original
	// object. Use it directly instead of re-parsing content[0].text, which
	// jsonResult built from the same object via JSON.stringify: parsing that
	// text back out would only reconstruct a value whose re-serialization is
	// byte-identical to serializing the original directly, so skipping the
	// round trip changes nothing observable. isStandardToolEnvelope is
	// checked first so a callback that already returns a full {ok, data}
	// envelope (or {ok, error}) via structuredContent is passed through as-is
	// rather than double-wrapped.
	const envelope = isStandardToolEnvelope(result.structuredContent)
		? result.structuredContent
		: result.isError
			? ({
					ok: false,
					error: getErrorDetails(result),
				} satisfies StandardToolErrorEnvelope)
			: ({
					ok: true,
					data:
						result.structuredContent !== undefined
							? result.structuredContent
							: getSuccessData(result),
				} satisfies StandardToolSuccessEnvelope);

	return {
		...result,
		content: [{ type: "text", text: formatToolEnvelope(envelope) }],
		structuredContent: envelope,
	};
}

function wrapToolCallback(
	toolName: string,
	callback: ToolCallback,
): ToolCallback {
	return async (...args) => {
		try {
			return normalizeToolResult((await callback(...args)) as CallToolResult);
		} catch (error) {
			const message = getToolErrorMessage(error);
			// A validation failure is the caller's to fix, not a tool malfunction,
			// so it gets a prefix that says which it is.
			const isValidationError = error instanceof z.ZodError;
			const text = isValidationError
				? `Invalid arguments for "${toolName}": ${message}`
				: `Tool "${toolName}" failed: ${message}`;

			Logger.error("Tool callback failed", {
				error: message,
				metadata: { toolName },
			});

			return normalizeToolResult({
				content: [{ type: "text", text }],
				isError: true,
			} satisfies CallToolResult);
		}
	};
}

const registrationSchemas = new WeakMap<object, z.ZodType>();

function normalizeRegistrationSchema(schema: unknown): unknown {
	if (!isRecord(schema) || "~standard" in schema) return schema;
	let normalized = registrationSchemas.get(schema);
	if (!normalized) {
		normalized = z.object(schema as z.ZodRawShape);
		registrationSchemas.set(schema, normalized);
	}
	return normalized;
}

function createSafeToolServer(server: McpServer): McpServer {
	const originalRegisterTool = server.registerTool.bind(server);
	const safeServer = Object.create(server) as McpServer;
	safeServer.registerTool = ((
		name: string,
		config: Record<string, unknown>,
		callback: ToolCallback,
	) => {
		const description = augmentToolDescription(
			name,
			typeof config.description === "string" ? config.description : undefined,
		);
		return Reflect.apply(originalRegisterTool, server, [
			name,
			{
				...config,
				...(description === undefined ? {} : { description }),
				inputSchema: normalizeRegistrationSchema(config.inputSchema),
				outputSchema: normalizeRegistrationSchema(
					config.outputSchema ?? getToolOutputSchema(name),
				),
				annotations: {
					...inferToolAnnotations(name),
					...(isToolAnnotationsLike(config.annotations)
						? config.annotations
						: {}),
				},
			},
			wrapToolCallback(name, callback),
		]);
	}) as McpServer["registerTool"];
	return safeServer;
}

/**
 * Register all Admin API tools on the MCP server
 * @param server - The MCP server instance
 * @param service - The PortkeyService facade
 */
export function registerAllTools(
	server: McpServer,
	service: PortkeyService,
	options: RegisterAllToolsOptions = {},
): void {
	const safeServer = createSafeToolServer(server);
	const selectedDomains = options.domains
		? new Set(normalizeToolDomains(options.domains))
		: undefined;

	for (const [domain, registerTools] of TOOL_DOMAIN_REGISTRARS) {
		if (!selectedDomains || selectedDomains.has(domain)) {
			registerTools(safeServer, service);
		}
	}
}

// Re-export individual registration functions for selective use
export {
	registerAnalyticsTools,
	registerAuditTools,
	registerCollectionsTools,
	registerConfigsTools,
	registerGuardrailsTools,
	registerIntegrationsTools,
	registerKeysTools,
	registerLabelsTools,
	registerLimitsTools,
	registerLoggingTools,
	registerMcpIntegrationsTools,
	registerMcpServersTools,
	registerPartialsTools,
	registerPromptsTools,
	registerProvidersTools,
	registerSecretReferencesTools,
	registerTracingTools,
	registerUsersTools,
	registerWorkspacesTools,
};
