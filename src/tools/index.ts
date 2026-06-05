import type {
	McpServer,
	ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Logger } from "../lib/logger.js";
import type { PortkeyService } from "../services/index.js";
import { registerAnalyticsTools } from "./analytics.tools.js";
import { registerAuditTools } from "./audit.tools.js";
import { registerCollectionsTools } from "./collections.tools.js";
import { registerConfigsTools } from "./configs.tools.js";
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
import { registerTracingTools } from "./tracing.tools.js";
import { registerUsersTools } from "./users.tools.js";
import { registerWorkspacesTools } from "./workspaces.tools.js";

type ToolRegistrar = (server: McpServer, service: PortkeyService) => void;

const TOOL_DOMAIN_REGISTRARS = [
	["users", registerUsersTools],
	["workspaces", registerWorkspacesTools],
	["configs", registerConfigsTools],
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
	"list_audit_logs",
	"get_integration",
	"list_integration_models",
	"list_integration_workspaces",
	"list_all_users",
	"get_user",
	"list_user_invites",
	"get_user_stats",
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

function getToolErrorMessage(error: unknown): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
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
	return JSON.stringify(envelope, null, 2);
}

function normalizeToolResult(result: CallToolResult): CallToolResult {
	const envelope = isStandardToolEnvelope(result.structuredContent)
		? result.structuredContent
		: result.isError
			? ({
					ok: false,
					error: getErrorDetails(result),
				} satisfies StandardToolErrorEnvelope)
			: ({
					ok: true,
					data: getSuccessData(result),
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

			Logger.error("Tool callback failed", {
				error: message,
				metadata: { toolName },
			});

			return normalizeToolResult({
				content: [
					{ type: "text", text: `Tool "${toolName}" failed: ${message}` },
				],
				isError: true,
			} satisfies CallToolResult);
		}
	};
}

function buildToolRegistration(
	name: string,
	rest: unknown[],
): {
	description?: string;
	inputSchema?: unknown;
	annotations: ToolAnnotations;
	callback: ToolCallback;
} {
	const maybeCallback = rest.at(-1);
	const wrappedCallback = wrapToolCallback(name, maybeCallback as ToolCallback);
	const inferredAnnotations = inferToolAnnotations(name);
	const args = [...rest.slice(0, -1)];

	let description: string | undefined;
	if (typeof args[0] === "string") {
		description = args.shift() as string;
	}
	description = augmentToolDescription(name, description);

	let inputSchema: unknown;
	let annotations = inferredAnnotations;

	if (args.length === 1) {
		if (isToolAnnotationsLike(args[0])) {
			annotations = {
				...inferredAnnotations,
				...args[0],
			};
		} else {
			inputSchema = args[0];
		}
	} else if (args.length >= 2) {
		inputSchema = args[0];
		if (isToolAnnotationsLike(args[1])) {
			annotations = {
				...inferredAnnotations,
				...args[1],
			};
		}
	}

	return {
		description,
		inputSchema,
		annotations,
		callback: wrappedCallback,
	};
}

function createSafeToolServer(server: McpServer): McpServer {
	const originalTool = server.tool.bind(server);
	const originalRegisterTool =
		"registerTool" in server && typeof server.registerTool === "function"
			? server.registerTool.bind(server)
			: undefined;
	const safeServer = Object.create(server) as McpServer;
	const callOriginalTool = (...args: [string, ...unknown[]]) =>
		Reflect.apply(
			originalTool as (...toolArgs: [string, ...unknown[]]) => unknown,
			server,
			args,
		);
	const callOriginalRegisterTool = (
		...args: [string, Record<string, unknown>, ToolCallback]
	) => {
		if (!originalRegisterTool) {
			throw new Error("registerTool is not available on the MCP server");
		}

		return Reflect.apply(
			originalRegisterTool as (
				...toolArgs: [string, Record<string, unknown>, ToolCallback]
			) => unknown,
			server,
			args,
		);
	};

	safeServer.tool = ((name: string, ...rest: unknown[]) => {
		const maybeCallback = rest.at(-1);
		if (typeof maybeCallback !== "function") {
			return callOriginalTool(name, ...rest);
		}

		const registration = buildToolRegistration(name, rest);

		if (originalRegisterTool) {
			return callOriginalRegisterTool(
				name,
				{
					...(registration.description
						? { description: registration.description }
						: {}),
					...(registration.inputSchema !== undefined
						? { inputSchema: registration.inputSchema }
						: {}),
					outputSchema: STANDARD_TOOL_OUTPUT_SCHEMA,
					annotations: registration.annotations,
				},
				registration.callback,
			);
		}

		const wrappedRest =
			registration.inputSchema !== undefined
				? registration.description !== undefined
					? [
							registration.description,
							registration.inputSchema,
							registration.annotations,
							registration.callback,
						]
					: [
							registration.inputSchema,
							registration.annotations,
							registration.callback,
						]
				: registration.description !== undefined
					? [
							registration.description,
							registration.annotations,
							registration.callback,
						]
					: [registration.annotations, registration.callback];

		return callOriginalTool(name, ...wrappedRest);
	}) as McpServer["tool"];

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
	registerTracingTools,
	registerUsersTools,
	registerWorkspacesTools,
};
