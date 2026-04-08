// Service Exports

export type * from "./analytics.service.js";
export { AnalyticsService } from "./analytics.service.js";
export type * from "./audit.service.js";
export { AuditService } from "./audit.service.js";
export { BaseService } from "./base.service.js";
export type * from "./collections.service.js";
export { CollectionsService } from "./collections.service.js";
export type * from "./configs.service.js";
export { ConfigsService } from "./configs.service.js";
export type * from "./guardrails.service.js";
export { GuardrailsService } from "./guardrails.service.js";
// Phase 8: Health
export type * from "./health.service.js";
export { HealthService } from "./health.service.js";
// Phase 5: Integrations
export type * from "./integrations.service.js";
export { IntegrationsService } from "./integrations.service.js";
export type * from "./keys.service.js";
export { KeysService } from "./keys.service.js";
// Phase 3: Labels and Partials
export type * from "./labels.service.js";
export { LabelsService } from "./labels.service.js";
export type * from "./limits.service.js";
export { LimitsService } from "./limits.service.js";
// Phase 4: Logging
export type * from "./logging.service.js";
export { LoggingService } from "./logging.service.js";
// MCP resource management
export type * from "./mcp-integrations.service.js";
export { McpIntegrationsService } from "./mcp-integrations.service.js";
export type * from "./mcp-servers.service.js";
export { McpServersService } from "./mcp-servers.service.js";
export type * from "./partials.service.js";
export { PartialsService } from "./partials.service.js";
export type * from "./prompts.service.js";
export { PromptsService } from "./prompts.service.js";
// Phase 5: Providers
export type * from "./providers.service.js";
export { ProvidersService } from "./providers.service.js";
// Phase 4: Tracing
export type * from "./tracing.service.js";
export { TracingService } from "./tracing.service.js";
// Type re-exports
export type * from "./users.service.js";
export { UsersService } from "./users.service.js";
export type * from "./workspaces.service.js";
export { WorkspacesService } from "./workspaces.service.js";

import { AnalyticsService } from "./analytics.service.js";
import { AuditService } from "./audit.service.js";
import { CollectionsService } from "./collections.service.js";
import { ConfigsService } from "./configs.service.js";
import { GuardrailsService } from "./guardrails.service.js";
import { HealthService } from "./health.service.js";
import { IntegrationsService } from "./integrations.service.js";
import { KeysService } from "./keys.service.js";
// Import services for facade
import { LabelsService } from "./labels.service.js";
import { LimitsService } from "./limits.service.js";
import { LoggingService } from "./logging.service.js";
import { McpIntegrationsService } from "./mcp-integrations.service.js";
import { McpServersService } from "./mcp-servers.service.js";
import { PartialsService } from "./partials.service.js";
import { PromptsService } from "./prompts.service.js";
import { ProvidersService } from "./providers.service.js";
import { TracingService } from "./tracing.service.js";
import { UsersService } from "./users.service.js";
import { WorkspacesService } from "./workspaces.service.js";

function resolvePortkeyApiKey(apiKey?: string): string {
	const resolvedApiKey = apiKey ?? process.env.PORTKEY_API_KEY;
	if (!resolvedApiKey) {
		throw new Error(
			"Portkey API key is required. Either pass it to the PortkeyService constructor " +
				"or set the PORTKEY_API_KEY environment variable.",
		);
	}
	return resolvedApiKey;
}

function getSharedServiceCacheKey(apiKey?: string): string {
	return JSON.stringify({
		apiKey: resolvePortkeyApiKey(apiKey),
		baseUrl: process.env.PORTKEY_BASE_URL?.trim() || "",
	});
}

const sharedPortkeyServices = new Map<string, PortkeyService>();

/**
 * PortkeyService - container for domain-specific service clients
 */
export class PortkeyService {
	public readonly users: UsersService;
	public readonly workspaces: WorkspacesService;
	public readonly configs: ConfigsService;
	public readonly keys: KeysService;
	public readonly collections: CollectionsService;
	public readonly prompts: PromptsService;
	public readonly analytics: AnalyticsService;
	public readonly guardrails: GuardrailsService;
	public readonly integrations: IntegrationsService;
	public readonly limits: LimitsService;
	public readonly audit: AuditService;
	public readonly labels: LabelsService;
	public readonly partials: PartialsService;
	public readonly tracing: TracingService;
	public readonly logging: LoggingService;
	public readonly providers: ProvidersService;
	public readonly mcpIntegrations: McpIntegrationsService;
	public readonly mcpServers: McpServersService;
	public readonly health: HealthService;

	constructor(apiKey?: string) {
		const resolvedApiKey = resolvePortkeyApiKey(apiKey);
		this.users = new UsersService(resolvedApiKey);
		this.workspaces = new WorkspacesService(resolvedApiKey);
		this.configs = new ConfigsService(resolvedApiKey);
		this.keys = new KeysService(resolvedApiKey);
		this.collections = new CollectionsService(resolvedApiKey);
		this.prompts = new PromptsService(resolvedApiKey);
		this.analytics = new AnalyticsService(resolvedApiKey);
		this.guardrails = new GuardrailsService(resolvedApiKey);
		this.integrations = new IntegrationsService(resolvedApiKey);
		this.limits = new LimitsService(resolvedApiKey);
		this.audit = new AuditService(resolvedApiKey);
		this.labels = new LabelsService(resolvedApiKey);
		this.partials = new PartialsService(resolvedApiKey);
		this.tracing = new TracingService(resolvedApiKey);
		this.logging = new LoggingService(resolvedApiKey);
		this.providers = new ProvidersService(resolvedApiKey);
		this.mcpIntegrations = new McpIntegrationsService(resolvedApiKey);
		this.mcpServers = new McpServersService(resolvedApiKey);
		this.health = new HealthService(resolvedApiKey);
	}
}

export function getSharedPortkeyService(apiKey?: string): PortkeyService {
	const cacheKey = getSharedServiceCacheKey(apiKey);
	const cached = sharedPortkeyServices.get(cacheKey);
	if (cached) {
		return cached;
	}

	const service = new PortkeyService(apiKey);
	sharedPortkeyServices.set(cacheKey, service);
	return service;
}
