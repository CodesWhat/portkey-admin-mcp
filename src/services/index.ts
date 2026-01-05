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
import { PartialsService } from "./partials.service.js";
import { PromptsService } from "./prompts.service.js";
import { ProvidersService } from "./providers.service.js";
import { TracingService } from "./tracing.service.js";
import { UsersService } from "./users.service.js";
import { WorkspacesService } from "./workspaces.service.js";

/**
 * PortkeyService - Facade that delegates to domain-specific services
 * Maintains backward compatibility with existing tool implementations
 */
export class PortkeyService {
	private users: UsersService;
	private workspaces: WorkspacesService;
	private configs: ConfigsService;
	private keys: KeysService;
	private collections: CollectionsService;
	private prompts: PromptsService;
	private analytics: AnalyticsService;
	private guardrails: GuardrailsService;
	private integrations: IntegrationsService;
	private limits: LimitsService;
	private audit: AuditService;
	private labels: LabelsService;
	private partials: PartialsService;
	private tracing: TracingService;
	private logging: LoggingService;
	private providers: ProvidersService;
	private health: HealthService;

	constructor(apiKey?: string) {
		const resolvedApiKey = apiKey ?? process.env.PORTKEY_API_KEY;
		if (!resolvedApiKey) {
			throw new Error(
				"Portkey API key is required. Either pass it to the PortkeyService constructor " +
					"or set the PORTKEY_API_KEY environment variable.",
			);
		}
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
		this.health = new HealthService(resolvedApiKey);
	}

	// Users delegation
	listUsers = () => this.users.listUsers();
	inviteUser = (...args: Parameters<UsersService["inviteUser"]>) =>
		this.users.inviteUser(...args);
	getUserGroupedData = (
		...args: Parameters<UsersService["getUserGroupedData"]>
	) => this.users.getUserGroupedData(...args);
	// Phase 1: User Management
	getUser = (...args: Parameters<UsersService["getUser"]>) =>
		this.users.getUser(...args);
	updateUser = (...args: Parameters<UsersService["updateUser"]>) =>
		this.users.updateUser(...args);
	deleteUser = (...args: Parameters<UsersService["deleteUser"]>) =>
		this.users.deleteUser(...args);
	listUserInvites = () => this.users.listUserInvites();
	getUserInvite = (...args: Parameters<UsersService["getUserInvite"]>) =>
		this.users.getUserInvite(...args);
	deleteUserInvite = (...args: Parameters<UsersService["deleteUserInvite"]>) =>
		this.users.deleteUserInvite(...args);
	resendUserInvite = (...args: Parameters<UsersService["resendUserInvite"]>) =>
		this.users.resendUserInvite(...args);

	// Workspaces delegation
	listWorkspaces = (...args: Parameters<WorkspacesService["listWorkspaces"]>) =>
		this.workspaces.listWorkspaces(...args);
	getWorkspace = (...args: Parameters<WorkspacesService["getWorkspace"]>) =>
		this.workspaces.getWorkspace(...args);
	// Phase 1: Workspace CRUD
	createWorkspace = (
		...args: Parameters<WorkspacesService["createWorkspace"]>
	) => this.workspaces.createWorkspace(...args);
	updateWorkspace = (
		...args: Parameters<WorkspacesService["updateWorkspace"]>
	) => this.workspaces.updateWorkspace(...args);
	deleteWorkspace = (
		...args: Parameters<WorkspacesService["deleteWorkspace"]>
	) => this.workspaces.deleteWorkspace(...args);
	addWorkspaceMember = (
		...args: Parameters<WorkspacesService["addWorkspaceMember"]>
	) => this.workspaces.addWorkspaceMember(...args);
	listWorkspaceMembers = (
		...args: Parameters<WorkspacesService["listWorkspaceMembers"]>
	) => this.workspaces.listWorkspaceMembers(...args);
	getWorkspaceMember = (
		...args: Parameters<WorkspacesService["getWorkspaceMember"]>
	) => this.workspaces.getWorkspaceMember(...args);
	updateWorkspaceMember = (
		...args: Parameters<WorkspacesService["updateWorkspaceMember"]>
	) => this.workspaces.updateWorkspaceMember(...args);
	removeWorkspaceMember = (
		...args: Parameters<WorkspacesService["removeWorkspaceMember"]>
	) => this.workspaces.removeWorkspaceMember(...args);

	// Configs delegation
	listConfigs = () => this.configs.listConfigs();
	getConfig = (...args: Parameters<ConfigsService["getConfig"]>) =>
		this.configs.getConfig(...args);
	// Phase 1: Config CRUD
	createConfig = (...args: Parameters<ConfigsService["createConfig"]>) =>
		this.configs.createConfig(...args);
	updateConfig = (...args: Parameters<ConfigsService["updateConfig"]>) =>
		this.configs.updateConfig(...args);
	deleteConfig = (...args: Parameters<ConfigsService["deleteConfig"]>) =>
		this.configs.deleteConfig(...args);
	listConfigVersions = (
		...args: Parameters<ConfigsService["listConfigVersions"]>
	) => this.configs.listConfigVersions(...args);

	// Keys delegation
	listVirtualKeys = () => this.keys.listVirtualKeys();
	// Phase 2: Virtual Keys CRUD
	createVirtualKey = (...args: Parameters<KeysService["createVirtualKey"]>) =>
		this.keys.createVirtualKey(...args);
	getVirtualKey = (...args: Parameters<KeysService["getVirtualKey"]>) =>
		this.keys.getVirtualKey(...args);
	updateVirtualKey = (...args: Parameters<KeysService["updateVirtualKey"]>) =>
		this.keys.updateVirtualKey(...args);
	deleteVirtualKey = (...args: Parameters<KeysService["deleteVirtualKey"]>) =>
		this.keys.deleteVirtualKey(...args);
	// Phase 2: API Keys CRUD
	createApiKey = (...args: Parameters<KeysService["createApiKey"]>) =>
		this.keys.createApiKey(...args);
	listApiKeys = (...args: Parameters<KeysService["listApiKeys"]>) =>
		this.keys.listApiKeys(...args);
	getApiKey = (...args: Parameters<KeysService["getApiKey"]>) =>
		this.keys.getApiKey(...args);
	updateApiKey = (...args: Parameters<KeysService["updateApiKey"]>) =>
		this.keys.updateApiKey(...args);
	deleteApiKey = (...args: Parameters<KeysService["deleteApiKey"]>) =>
		this.keys.deleteApiKey(...args);

	// Collections delegation
	listCollections = (
		...args: Parameters<CollectionsService["listCollections"]>
	) => this.collections.listCollections(...args);
	createCollection = (
		...args: Parameters<CollectionsService["createCollection"]>
	) => this.collections.createCollection(...args);
	getCollection = (...args: Parameters<CollectionsService["getCollection"]>) =>
		this.collections.getCollection(...args);
	// Phase 1: Collection CRUD
	updateCollection = (
		...args: Parameters<CollectionsService["updateCollection"]>
	) => this.collections.updateCollection(...args);
	deleteCollection = (
		...args: Parameters<CollectionsService["deleteCollection"]>
	) => this.collections.deleteCollection(...args);

	// Prompts delegation
	createPrompt = (...args: Parameters<PromptsService["createPrompt"]>) =>
		this.prompts.createPrompt(...args);
	listPrompts = (...args: Parameters<PromptsService["listPrompts"]>) =>
		this.prompts.listPrompts(...args);
	getPrompt = (...args: Parameters<PromptsService["getPrompt"]>) =>
		this.prompts.getPrompt(...args);
	updatePrompt = (...args: Parameters<PromptsService["updatePrompt"]>) =>
		this.prompts.updatePrompt(...args);
	renderPrompt = (...args: Parameters<PromptsService["renderPrompt"]>) =>
		this.prompts.renderPrompt(...args);
	runPromptCompletion = (
		...args: Parameters<PromptsService["runPromptCompletion"]>
	) => this.prompts.runPromptCompletion(...args);
	migratePrompt = (...args: Parameters<PromptsService["migratePrompt"]>) =>
		this.prompts.migratePrompt(...args);
	promotePrompt = (...args: Parameters<PromptsService["promotePrompt"]>) =>
		this.prompts.promotePrompt(...args);
	validateBillingMetadata = (
		...args: Parameters<PromptsService["validateBillingMetadata"]>
	) => this.prompts.validateBillingMetadata(...args);
	// Phase 3: Prompts++ delegation
	deletePrompt = (...args: Parameters<PromptsService["deletePrompt"]>) =>
		this.prompts.deletePrompt(...args);
	publishPrompt = (...args: Parameters<PromptsService["publishPrompt"]>) =>
		this.prompts.publishPrompt(...args);
	listPromptVersions = (
		...args: Parameters<PromptsService["listPromptVersions"]>
	) => this.prompts.listPromptVersions(...args);

	// Analytics delegation
	getCostAnalytics = (
		...args: Parameters<AnalyticsService["getCostAnalytics"]>
	) => this.analytics.getCostAnalytics(...args);
	getRequestAnalytics = (
		...args: Parameters<AnalyticsService["getRequestAnalytics"]>
	) => this.analytics.getRequestAnalytics(...args);
	getTokenAnalytics = (
		...args: Parameters<AnalyticsService["getTokenAnalytics"]>
	) => this.analytics.getTokenAnalytics(...args);
	getLatencyAnalytics = (
		...args: Parameters<AnalyticsService["getLatencyAnalytics"]>
	) => this.analytics.getLatencyAnalytics(...args);
	getErrorAnalytics = (
		...args: Parameters<AnalyticsService["getErrorAnalytics"]>
	) => this.analytics.getErrorAnalytics(...args);
	getErrorRateAnalytics = (
		...args: Parameters<AnalyticsService["getErrorRateAnalytics"]>
	) => this.analytics.getErrorRateAnalytics(...args);
	getCacheHitLatency = (
		...args: Parameters<AnalyticsService["getCacheHitLatency"]>
	) => this.analytics.getCacheHitLatency(...args);
	getCacheHitRate = (
		...args: Parameters<AnalyticsService["getCacheHitRate"]>
	) => this.analytics.getCacheHitRate(...args);
	getUsersAnalytics = (
		...args: Parameters<AnalyticsService["getUsersAnalytics"]>
	) => this.analytics.getUsersAnalytics(...args);

	// Phase 2: Guardrails delegation
	listGuardrails = (...args: Parameters<GuardrailsService["listGuardrails"]>) =>
		this.guardrails.listGuardrails(...args);
	getGuardrail = (...args: Parameters<GuardrailsService["getGuardrail"]>) =>
		this.guardrails.getGuardrail(...args);
	createGuardrail = (
		...args: Parameters<GuardrailsService["createGuardrail"]>
	) => this.guardrails.createGuardrail(...args);
	updateGuardrail = (
		...args: Parameters<GuardrailsService["updateGuardrail"]>
	) => this.guardrails.updateGuardrail(...args);
	deleteGuardrail = (
		...args: Parameters<GuardrailsService["deleteGuardrail"]>
	) => this.guardrails.deleteGuardrail(...args);

	// Phase 2: Limits delegation
	listUsageLimits = (...args: Parameters<LimitsService["listUsageLimits"]>) =>
		this.limits.listUsageLimits(...args);
	getUsageLimit = (...args: Parameters<LimitsService["getUsageLimit"]>) =>
		this.limits.getUsageLimit(...args);
	createUsageLimit = (...args: Parameters<LimitsService["createUsageLimit"]>) =>
		this.limits.createUsageLimit(...args);
	updateUsageLimit = (...args: Parameters<LimitsService["updateUsageLimit"]>) =>
		this.limits.updateUsageLimit(...args);
	deleteUsageLimit = (...args: Parameters<LimitsService["deleteUsageLimit"]>) =>
		this.limits.deleteUsageLimit(...args);
	listRateLimits = (...args: Parameters<LimitsService["listRateLimits"]>) =>
		this.limits.listRateLimits(...args);
	getRateLimit = (...args: Parameters<LimitsService["getRateLimit"]>) =>
		this.limits.getRateLimit(...args);
	createRateLimit = (...args: Parameters<LimitsService["createRateLimit"]>) =>
		this.limits.createRateLimit(...args);
	updateRateLimit = (...args: Parameters<LimitsService["updateRateLimit"]>) =>
		this.limits.updateRateLimit(...args);
	deleteRateLimit = (...args: Parameters<LimitsService["deleteRateLimit"]>) =>
		this.limits.deleteRateLimit(...args);

	// Phase 2: Audit delegation
	listAuditLogs = (...args: Parameters<AuditService["listAuditLogs"]>) =>
		this.audit.listAuditLogs(...args);

	// Phase 3: Labels delegation
	createLabel = (...args: Parameters<LabelsService["createLabel"]>) =>
		this.labels.createLabel(...args);
	listLabels = (...args: Parameters<LabelsService["listLabels"]>) =>
		this.labels.listLabels(...args);
	getLabel = (...args: Parameters<LabelsService["getLabel"]>) =>
		this.labels.getLabel(...args);
	updateLabel = (...args: Parameters<LabelsService["updateLabel"]>) =>
		this.labels.updateLabel(...args);
	deleteLabel = (...args: Parameters<LabelsService["deleteLabel"]>) =>
		this.labels.deleteLabel(...args);

	// Phase 3: Partials delegation
	createPromptPartial = (
		...args: Parameters<PartialsService["createPromptPartial"]>
	) => this.partials.createPromptPartial(...args);
	listPromptPartials = (
		...args: Parameters<PartialsService["listPromptPartials"]>
	) => this.partials.listPromptPartials(...args);
	getPromptPartial = (
		...args: Parameters<PartialsService["getPromptPartial"]>
	) => this.partials.getPromptPartial(...args);
	updatePromptPartial = (
		...args: Parameters<PartialsService["updatePromptPartial"]>
	) => this.partials.updatePromptPartial(...args);
	deletePromptPartial = (
		...args: Parameters<PartialsService["deletePromptPartial"]>
	) => this.partials.deletePromptPartial(...args);
	listPartialVersions = (
		...args: Parameters<PartialsService["listPartialVersions"]>
	) => this.partials.listPartialVersions(...args);
	publishPartial = (...args: Parameters<PartialsService["publishPartial"]>) =>
		this.partials.publishPartial(...args);

	// Phase 4: Tracing delegation
	createFeedback = (...args: Parameters<TracingService["createFeedback"]>) =>
		this.tracing.createFeedback(...args);
	updateFeedback = (...args: Parameters<TracingService["updateFeedback"]>) =>
		this.tracing.updateFeedback(...args);
	listTraces = (...args: Parameters<TracingService["listTraces"]>) =>
		this.tracing.listTraces(...args);
	getTrace = (...args: Parameters<TracingService["getTrace"]>) =>
		this.tracing.getTrace(...args);

	// Phase 4: Logging delegation
	insertLog = (...args: Parameters<LoggingService["insertLog"]>) =>
		this.logging.insertLog(...args);
	createLogExport = (...args: Parameters<LoggingService["createLogExport"]>) =>
		this.logging.createLogExport(...args);
	listLogExports = (...args: Parameters<LoggingService["listLogExports"]>) =>
		this.logging.listLogExports(...args);
	getLogExport = (...args: Parameters<LoggingService["getLogExport"]>) =>
		this.logging.getLogExport(...args);
	startLogExport = (...args: Parameters<LoggingService["startLogExport"]>) =>
		this.logging.startLogExport(...args);
	cancelLogExport = (...args: Parameters<LoggingService["cancelLogExport"]>) =>
		this.logging.cancelLogExport(...args);
	downloadLogExport = (
		...args: Parameters<LoggingService["downloadLogExport"]>
	) => this.logging.downloadLogExport(...args);
	// Phase 7: Log Export Update
	updateLogExport = (...args: Parameters<LoggingService["updateLogExport"]>) =>
		this.logging.updateLogExport(...args);

	// Phase 5: Providers delegation
	listProviders = (...args: Parameters<ProvidersService["listProviders"]>) =>
		this.providers.listProviders(...args);
	createProvider = (...args: Parameters<ProvidersService["createProvider"]>) =>
		this.providers.createProvider(...args);
	getProvider = (...args: Parameters<ProvidersService["getProvider"]>) =>
		this.providers.getProvider(...args);
	updateProvider = (...args: Parameters<ProvidersService["updateProvider"]>) =>
		this.providers.updateProvider(...args);
	deleteProvider = (...args: Parameters<ProvidersService["deleteProvider"]>) =>
		this.providers.deleteProvider(...args);

	// Phase 5: Integrations delegation
	listIntegrations = (
		...args: Parameters<IntegrationsService["listIntegrations"]>
	) => this.integrations.listIntegrations(...args);
	createIntegration = (
		...args: Parameters<IntegrationsService["createIntegration"]>
	) => this.integrations.createIntegration(...args);
	getIntegration = (
		...args: Parameters<IntegrationsService["getIntegration"]>
	) => this.integrations.getIntegration(...args);
	updateIntegration = (
		...args: Parameters<IntegrationsService["updateIntegration"]>
	) => this.integrations.updateIntegration(...args);
	deleteIntegration = (
		...args: Parameters<IntegrationsService["deleteIntegration"]>
	) => this.integrations.deleteIntegration(...args);
	listIntegrationModels = (
		...args: Parameters<IntegrationsService["listIntegrationModels"]>
	) => this.integrations.listIntegrationModels(...args);
	updateIntegrationModels = (
		...args: Parameters<IntegrationsService["updateIntegrationModels"]>
	) => this.integrations.updateIntegrationModels(...args);
	deleteIntegrationModel = (
		...args: Parameters<IntegrationsService["deleteIntegrationModel"]>
	) => this.integrations.deleteIntegrationModel(...args);
	listIntegrationWorkspaces = (
		...args: Parameters<IntegrationsService["listIntegrationWorkspaces"]>
	) => this.integrations.listIntegrationWorkspaces(...args);
	updateIntegrationWorkspaces = (
		...args: Parameters<IntegrationsService["updateIntegrationWorkspaces"]>
	) => this.integrations.updateIntegrationWorkspaces(...args);

	// Phase 8: Health delegation
	ping = () => this.health.ping();
}
