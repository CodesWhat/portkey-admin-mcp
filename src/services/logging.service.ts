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
	cost_min?: number;
	cost_max?: number;
	tokens_min?: number;
	tokens_max?: number;
	model?: string[];
	metadata?: Record<string, unknown>;
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

export interface UpdateLogExportFilters {
	time_of_generation_max?: string;
}

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
		return this.get<LogExport>(`/logs/exports/${exportId}`);
	}

	/**
	 * Start a log export job
	 */
	async startLogExport(exportId: string): Promise<LogExportActionResponse> {
		return this.post<LogExportActionResponse>(
			`/logs/exports/${exportId}/start`,
		);
	}

	/**
	 * Cancel a running log export job
	 */
	async cancelLogExport(exportId: string): Promise<LogExportActionResponse> {
		return this.post<LogExportActionResponse>(
			`/logs/exports/${exportId}/cancel`,
		);
	}

	/**
	 * Get the download URL for a completed log export
	 */
	async downloadLogExport(
		exportId: string,
	): Promise<DownloadLogExportResponse> {
		return this.get<DownloadLogExportResponse>(
			`/logs/exports/${exportId}/download`,
		);
	}

	/**
	 * Update an existing log export configuration
	 */
	async updateLogExport(
		exportId: string,
		data: UpdateLogExportRequest,
	): Promise<LogExportResponse> {
		return this.put<LogExportResponse>(`/logs/exports/${exportId}`, data);
	}
}
