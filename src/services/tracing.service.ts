import { BaseService } from "./base.service.js";

// Feedback Types
export interface CreateFeedbackRequest {
	trace_id: string;
	value: number;
	weight?: number;
	metadata?: Record<string, unknown>;
}

export interface CreateFeedbackResponse {
	status: "success" | "failure";
	message: string;
	feedback_ids: string[];
}

export interface UpdateFeedbackRequest {
	value?: number;
	weight?: number;
	metadata?: Record<string, unknown>;
}

export interface UpdateFeedbackResponse {
	status: "success" | "failure";
	message: string;
	feedback_ids: string[];
}

// Trace Types
export interface TraceSpan {
	span_id: string;
	span_name?: string;
	parent_span_id?: string;
	start_time: string;
	end_time?: string;
	status?: string;
	attributes?: Record<string, unknown>;
}

export interface Trace {
	id: string;
	trace_id: string;
	request: {
		url?: string;
		method?: string;
		headers?: Record<string, string>;
		body?: unknown;
		provider?: string;
	};
	response: {
		status?: number;
		headers?: Record<string, string>;
		body?: unknown;
		time?: number;
		streaming_mode?: boolean;
	};
	metadata?: Record<string, unknown>;
	organisation_id: string;
	workspace_id?: string;
	created_at: string;
	spans?: TraceSpan[];
	feedback?: {
		value?: number;
		weight?: number;
	};
	cost?: number;
	tokens?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

export interface GetTraceResponse {
	success: boolean;
	data: Trace;
}

export class TracingService extends BaseService {
	// Feedback endpoints
	async createFeedback(
		data: CreateFeedbackRequest,
	): Promise<CreateFeedbackResponse> {
		return this.post<CreateFeedbackResponse>("/feedback", data);
	}

	async updateFeedback(
		id: string,
		data: UpdateFeedbackRequest,
	): Promise<UpdateFeedbackResponse> {
		return this.put<UpdateFeedbackResponse>(
			`/feedback/${this.encodePathSegment(id)}`,
			data,
		);
	}

	async getTrace(id: string): Promise<GetTraceResponse> {
		return this.get<GetTraceResponse>(`/logs/${this.encodePathSegment(id)}`);
	}
}
