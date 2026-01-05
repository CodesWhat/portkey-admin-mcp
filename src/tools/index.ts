import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
import { registerPartialsTools } from "./partials.tools.js";
import { registerPromptsTools } from "./prompts.tools.js";
import { registerProvidersTools } from "./providers.tools.js";
import { registerTracingTools } from "./tracing.tools.js";
import { registerUsersTools } from "./users.tools.js";
import { registerWorkspacesTools } from "./workspaces.tools.js";

/**
 * Register all Admin API tools on the MCP server
 * @param server - The MCP server instance
 * @param service - The PortkeyService facade
 */
export function registerAllTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Register tools by domain
	registerUsersTools(server, service);
	registerWorkspacesTools(server, service);
	registerConfigsTools(server, service);
	registerKeysTools(server, service);
	registerCollectionsTools(server, service);
	registerPromptsTools(server, service);
	registerAnalyticsTools(server, service);
	registerGuardrailsTools(server, service);
	registerLimitsTools(server, service);
	registerAuditTools(server, service);
	registerLabelsTools(server, service);
	registerPartialsTools(server, service);
	registerTracingTools(server, service);
	registerLoggingTools(server, service);
	registerProvidersTools(server, service);
	registerIntegrationsTools(server, service);
}

// Re-export individual registration functions for selective use
export {
	registerUsersTools,
	registerWorkspacesTools,
	registerConfigsTools,
	registerKeysTools,
	registerCollectionsTools,
	registerPromptsTools,
	registerAnalyticsTools,
	registerGuardrailsTools,
	registerLimitsTools,
	registerAuditTools,
	registerLabelsTools,
	registerPartialsTools,
	registerTracingTools,
	registerLoggingTools,
	registerProvidersTools,
	registerIntegrationsTools,
};
