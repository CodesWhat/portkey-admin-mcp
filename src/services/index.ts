// Service Exports

export type * from "./analytics.service.js";
export { AnalyticsService } from "./analytics.service.js";
export type * from "./audit.service.js";
export { AuditService } from "./audit.service.js";
export { BaseService, validateUrl } from "./base.service.js";
export type * from "./collections.service.js";
export { CollectionsService } from "./collections.service.js";
export type * from "./configs.service.js";
export { ConfigsService } from "./configs.service.js";
export type * from "./guardrails.service.js";
export { GuardrailsService } from "./guardrails.service.js";
export type * from "./health.service.js";
export { HealthService } from "./health.service.js";
export type * from "./integrations.service.js";
export { IntegrationsService } from "./integrations.service.js";
export type * from "./keys.service.js";
export { KeysService } from "./keys.service.js";
export type * from "./labels.service.js";
export { LabelsService } from "./labels.service.js";
export type * from "./limits.service.js";
export { LimitsService } from "./limits.service.js";
export type * from "./logging.service.js";
export { LoggingService } from "./logging.service.js";
export type * from "./mcp-integrations.service.js";
export { McpIntegrationsService } from "./mcp-integrations.service.js";
export type * from "./mcp-servers.service.js";
export { McpServersService } from "./mcp-servers.service.js";
export type * from "./partials.service.js";
export { PartialsService } from "./partials.service.js";
export type * from "./prompts.service.js";
export { PromptsService } from "./prompts.service.js";
export type * from "./providers.service.js";
export { ProvidersService } from "./providers.service.js";
export type * from "./tracing.service.js";
export { TracingService } from "./tracing.service.js";
export type * from "./users.service.js";
export { UsersService } from "./users.service.js";
export type * from "./workspaces.service.js";
export { WorkspacesService } from "./workspaces.service.js";

import crypto from "node:crypto";
import { AnalyticsService } from "./analytics.service.js";
import { AuditService } from "./audit.service.js";
import { validateUrl } from "./base.service.js";
import { CollectionsService } from "./collections.service.js";
import { ConfigsService } from "./configs.service.js";
import { GuardrailsService } from "./guardrails.service.js";
import { HealthService } from "./health.service.js";
import { IntegrationsService } from "./integrations.service.js";
import { KeysService } from "./keys.service.js";
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

const MISSING_API_KEY_PLACEHOLDER = "__PORTKEY_API_KEY_NOT_CONFIGURED__";

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

function resolveSharedPortkeyApiKey(apiKey?: string): string {
	return apiKey ?? process.env.PORTKEY_API_KEY ?? MISSING_API_KEY_PLACEHOLDER;
}

function getSharedServiceCacheKey(apiKey: string): string {
	const keyDigest = crypto
		.createHash("sha256")
		.update(apiKey)
		.digest("hex");
	return JSON.stringify({
		apiKey: keyDigest,
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
		const resolvedBaseUrl =
			process.env.PORTKEY_BASE_URL ?? "https://api.portkey.ai/v1";
		validateUrl(resolvedBaseUrl);
		this.users = new UsersService(resolvedApiKey, resolvedBaseUrl);
		this.workspaces = new WorkspacesService(resolvedApiKey, resolvedBaseUrl);
		this.configs = new ConfigsService(resolvedApiKey, resolvedBaseUrl);
		this.keys = new KeysService(resolvedApiKey, resolvedBaseUrl);
		this.collections = new CollectionsService(resolvedApiKey, resolvedBaseUrl);
		this.prompts = new PromptsService(resolvedApiKey, resolvedBaseUrl);
		this.analytics = new AnalyticsService(resolvedApiKey, resolvedBaseUrl);
		this.guardrails = new GuardrailsService(resolvedApiKey, resolvedBaseUrl);
		this.integrations = new IntegrationsService(
			resolvedApiKey,
			resolvedBaseUrl,
		);
		this.limits = new LimitsService(resolvedApiKey, resolvedBaseUrl);
		this.audit = new AuditService(resolvedApiKey, resolvedBaseUrl);
		this.labels = new LabelsService(resolvedApiKey, resolvedBaseUrl);
		this.partials = new PartialsService(resolvedApiKey, resolvedBaseUrl);
		this.tracing = new TracingService(resolvedApiKey, resolvedBaseUrl);
		this.logging = new LoggingService(resolvedApiKey, resolvedBaseUrl);
		this.providers = new ProvidersService(resolvedApiKey, resolvedBaseUrl);
		this.mcpIntegrations = new McpIntegrationsService(
			resolvedApiKey,
			resolvedBaseUrl,
		);
		this.mcpServers = new McpServersService(resolvedApiKey, resolvedBaseUrl);
		this.health = new HealthService(resolvedApiKey, resolvedBaseUrl);
	}
}

export function getSharedPortkeyService(apiKey?: string): PortkeyService {
	const resolvedApiKey = resolveSharedPortkeyApiKey(apiKey);
	const cacheKey = getSharedServiceCacheKey(resolvedApiKey);
	const cached = sharedPortkeyServices.get(cacheKey);
	if (cached) {
		return cached;
	}

	const service = new PortkeyService(resolvedApiKey);
	sharedPortkeyServices.set(cacheKey, service);
	return service;
}
