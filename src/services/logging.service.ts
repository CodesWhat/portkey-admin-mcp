import { BaseService } from "./base.service.js";

// Insert Log Types
export interface LogRequest {
	url?: string;
	provider?: string;
	headers?: Record<string, string>;
	method?: string;
	body?: Record<string, unknown>;
}

export interface LogResponse {
	status?: number;
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
	response_time?: number;
	time?: number;
	streamingMode?: boolean;
}

export interface LogMetadata {
	organization?: string;
	user?: string;
	traceId?: string;
	spanId?: string;
	spanName?: string;
	parentSpanId?: string;
	[key: string]: unknown;
}

export interface InsertLogEntry {
	request: LogRequest;
	response: LogResponse;
	metadata?: LogMetadata;
}

export interface InsertLogResponse {
	success: boolean;
	message?: string;
}

/** Query options used by Portkey's versioned single-log endpoint */
export interface GetLogParams {
	path_format?: "v1" | "v2";
	created_at?: string;
	type?: "hooks";
}

/** Request or response snapshot (`RequestResponseObject` in the Portkey spec). */
export interface LogRequestResponseObject {
	body?: Record<string, unknown>;
	headers?: Record<string, string>;
	url?: string;
	method?: string;
}

/** `LogObject.request` in the Portkey spec. */
export interface LogDetailRequest {
	url?: string;
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
	portkeyHeaders?: Record<string, string>;
}

/** `LogObject.response` in the Portkey spec. */
export interface LogDetailResponse {
	status?: number;
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
	responseTime?: number;
	lastUsedOptionJsonPath?: string;
}

/** `AnalyticsMetrics` in the Portkey spec, as embedded in a log. */
export interface LogMetrics {
	id?: string;
	organisation_id?: string;
	organisation_name?: string;
	prompt_id?: string;
	prompt_version_id?: string;
	config_id?: string;
	created_at?: string;
	is_success?: boolean;
	ai_org?: string;
	ai_model?: string;
	req_units?: number;
	res_units?: number;
	total_units?: number;
	cost?: number;
	cost_currency?: string;
	request_url?: string;
	request_method?: string;
	response_status_code?: number;
	response_time?: number;
	is_proxy_call?: boolean;
	cache_status?: string | null;
	cache_type?: string | null;
	stream_mode?: number | null;
	retry_success_count?: number;
	trace_id?: string;
	span_id?: string;
	span_name?: string;
	parent_span_id?: string;
	mode?: string;
	virtual_key?: string;
	source?: string;
	runtime?: string;
	runtime_version?: string;
	sdk_version?: string;
	config?: string;
	internal_trace_id?: string;
	last_used_option_index?: number;
	config_version_id?: string;
	prompt_slug?: string;
	workspace_slug?: string | null;
	log_store_file_path_format?: string;
	"metadata.key"?: Array<string | null>;
	"metadata.value"?: Array<string | null>;
	api_key_id?: string;
	request_parsing_time?: number;
	pre_processing_time?: number;
	cache_processing_time?: number;
	response_parsing_time?: number;
	gateway_processing_time?: number;
	upstream_response_time?: number;
}

/**
 * `LogObject` in the Portkey spec. The payload varies by provider, mode and
 * path format, so unknown fields still pass through untouched.
 */
export interface LogDetail extends Record<string, unknown> {
	_id?: string | null;
	request?: LogDetailRequest;
	response?: LogDetailResponse;
	organisation_id?: string | null;
	created_at?: string | null;
	metrics?: LogMetrics;
	finalUntransformedRequest?: LogRequestResponseObject;
	originalResponse?: LogRequestResponseObject;
	transformedRequest?: LogRequestResponseObject;
}

/** Query for fields an organisation prevents a workspace from exporting. */
export interface GetLogExportFieldRestrictionsParams {
	workspace_id: string;
}

/** Export restriction payloads may grow as new log fields are introduced. */
export type LogExportFieldRestrictions = Record<string, unknown>;

// Log Export Types
export type LogExportField =
	| "id"
	| "trace_id"
	| "created_at"
	| "request"
	| "response"
	| "is_success"
	| "ai_org"
	| "ai_model"
	| "req_units"
	| "res_units"
	| "total_units"
	| "request_url"
	| "cost"
	| "cost_currency"
	| "response_time"
	| "response_status_code"
	| "mode"
	| "config"
	| "prompt_slug"
	| "metadata";

export type LogExportStatus =
	| "draft"
	| "in_progress"
	| "success"
	| "failed"
	| "stopped";

export interface LogExportFilters {
	time_of_generation_min?: string;
	time_of_generation_max?: string;
	total_units_min?: number;
	total_units_max?: number;
	cost_min?: number;
	cost_max?: number;
	ai_model?: string | string[];
	prompt_token_min?: number;
	prompt_token_max?: number;
	completion_token_min?: number;
	completion_token_max?: number;
	status_code?: string;
	metadata?: Record<string, unknown>;
	ai_org_model?: string;
	weighted_feedback_min?: number;
	weighted_feedback_max?: number;
	virtual_keys?: string;
	trace_id?: string;
	configs?: string;
	workspace_slug?: string;
	prompt_slug?: string;
	page_size?: number;
	current_page?: number;
}

export interface CreateLogExportRequest {
	filters: LogExportFilters;
	requested_data: LogExportField[];
	workspace_id?: string;
	description?: string;
}

export interface CreateLogExportResponse {
	id: string;
	total: number;
	object: "export";
}

export interface LogExport {
	id: string;
	organisation_id: string;
	workspace_id?: string;
	filters: LogExportFilters;
	requested_data: LogExportField[];
	status: LogExportStatus;
	description?: string;
	created_at: string;
	last_updated_at: string;
	created_by: string;
	object: "export";
}

export interface ListLogExportsResponse {
	object: "list";
	total: number;
	data: LogExport[];
}

export interface ListLogExportsParams {
	workspace_id: string;
}

export type UpdateLogExportFilters = LogExportFilters;

export interface UpdateLogExportRequest {
	filters?: UpdateLogExportFilters;
	workspace_id?: string;
	requested_data?: LogExportField[];
}

export interface LogExportResponse {
	id: string;
	total: number;
	object: "export";
}

export interface LogExportActionResponse {
	message: string;
	object: "export";
}

export interface DownloadLogExportResponse {
	signed_url: string;
}

export class LoggingService extends BaseService {
	/** Get one gateway log by ID. */
	async getLog(logId: string, params?: GetLogParams): Promise<LogDetail> {
		return this.get<LogDetail>(
			`/logs/${this.encodePathSegment(logId)}`,
			params,
		);
	}

	/** Get organisation-managed export field restrictions for a workspace. */
	async getLogExportFieldRestrictions(
		params: GetLogExportFieldRestrictionsParams,
	): Promise<LogExportFieldRestrictions> {
		return this.get<LogExportFieldRestrictions>(
			"/logs/exports/field-restrictions",
			params,
		);
	}

	/**
	 * Insert a log entry (or multiple entries) into Portkey
	 */
	async insertLog(
		entries: InsertLogEntry | InsertLogEntry[],
	): Promise<InsertLogResponse> {
		return this.post<InsertLogResponse>("/logs", entries);
	}

	/**
	 * Create a new log export job
	 */
	async createLogExport(
		data: CreateLogExportRequest,
	): Promise<CreateLogExportResponse> {
		return this.post<CreateLogExportResponse>("/logs/exports", data);
	}

	/**
	 * List all log exports for a workspace
	 */
	async listLogExports(
		params: ListLogExportsParams,
	): Promise<ListLogExportsResponse> {
		return this.get<ListLogExportsResponse>("/logs/exports", params);
	}

	/**
	 * Get details of a specific log export
	 */
	async getLogExport(exportId: string): Promise<LogExport> {
		return this.get<LogExport>(
			`/logs/exports/${this.encodePathSegment(exportId)}`,
		);
	}

	/**
	 * Start a log export job
	 */
	async startLogExport(exportId: string): Promise<LogExportActionResponse> {
		return this.post<LogExportActionResponse>(
			`/logs/exports/${this.encodePathSegment(exportId)}/start`,
		);
	}

	/**
	 * Cancel a running log export job
	 */
	async cancelLogExport(exportId: string): Promise<LogExportActionResponse> {
		return this.post<LogExportActionResponse>(
			`/logs/exports/${this.encodePathSegment(exportId)}/cancel`,
		);
	}

	/**
	 * Get the download URL for a completed log export
	 */
	async downloadLogExport(
		exportId: string,
	): Promise<DownloadLogExportResponse> {
		return this.get<DownloadLogExportResponse>(
			`/logs/exports/${this.encodePathSegment(exportId)}/download`,
		);
	}

	/**
	 * Update an existing log export configuration
	 */
	async updateLogExport(
		exportId: string,
		data: UpdateLogExportRequest,
	): Promise<LogExportResponse> {
		return this.put<LogExportResponse>(
			`/logs/exports/${this.encodePathSegment(exportId)}`,
			data,
		);
	}
}
