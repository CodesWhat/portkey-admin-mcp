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
}
