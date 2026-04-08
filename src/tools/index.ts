import type {
	McpServer,
	ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
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

function createSafeToolServer(server: McpServer): McpServer {
	const originalTool = server.tool.bind(server);
	const safeServer = Object.create(server) as McpServer;
	const callOriginalTool = (...args: [string, ...unknown[]]) =>
		Reflect.apply(
			originalTool as (...toolArgs: [string, ...unknown[]]) => unknown,
			server,
			args,
		);

	safeServer.tool = ((name: string, ...rest: unknown[]) => {
		const maybeCallback = rest.at(-1);
		if (typeof maybeCallback !== "function") {
			return callOriginalTool(name, ...rest);
		}

		const wrappedRest = [
			...rest.slice(0, -1),
			wrapToolCallback(name, maybeCallback as ToolCallback),
		];

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
): void {
	const safeServer = createSafeToolServer(server);

	// Register tools by domain
	registerUsersTools(safeServer, service);
	registerWorkspacesTools(safeServer, service);
	registerConfigsTools(safeServer, service);
	registerKeysTools(safeServer, service);
	registerCollectionsTools(safeServer, service);
	registerPromptsTools(safeServer, service);
	registerAnalyticsTools(safeServer, service);
	registerGuardrailsTools(safeServer, service);
	registerLimitsTools(safeServer, service);
	registerAuditTools(safeServer, service);
	registerLabelsTools(safeServer, service);
	registerPartialsTools(safeServer, service);
	registerTracingTools(safeServer, service);
	registerLoggingTools(safeServer, service);
	registerProvidersTools(safeServer, service);
	registerIntegrationsTools(safeServer, service);
	registerMcpIntegrationsTools(safeServer, service);
	registerMcpServersTools(safeServer, service);
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
