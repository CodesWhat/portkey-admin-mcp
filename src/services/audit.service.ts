import { BaseService } from "./base.service.js";

// Audit Log Types (Portkey-AI/openapi: GET /audit-logs, AuditLogObjectList)
export type AuditLogMethod = "POST" | "PUT" | "DELETE";
export type AuditLogUserType = "user" | "api_key";

export interface AuditLogRecord {
	timestamp?: string;
	method?: AuditLogMethod;
	uri?: string;
	request_id?: string;
	/** JSON string of the request body */
	request_body?: string;
	/** JSON string of the query parameters */
	query_params?: string;
	/** JSON string of the request headers (partially masked) */
	request_headers?: string;
	user_id?: string;
	user_type?: AuditLogUserType;
	organisation_id?: string;
	workspace_id?: string;
	response_status_code?: number;
	resource_type?: string;
	action?: string;
	client_ip?: string;
	country?: string;
}

export interface ListAuditLogsParams {
	start_time: string;
	end_time: string;
	organisation_id: string;
	method?: AuditLogMethod;
	uri?: string;
	request_id?: string;
	user_id?: string;
	user_type?: AuditLogUserType;
	workspace_id?: string;
	response_status_code?: number;
	resource_type?: string;
	action?: string;
	client_ip?: string;
	country?: string;
	current_page?: number;
	page_size?: number;
}

export interface ListAuditLogsResponse {
	records: AuditLogRecord[];
	total: number;
	object?: string;
}

export class AuditService extends BaseService {
	async listAuditLogs(
		params: ListAuditLogsParams,
	): Promise<ListAuditLogsResponse> {
		return this.get<ListAuditLogsResponse>("/audit-logs", params);
	}
}
