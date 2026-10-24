import type { z } from "zod";
import {
	AccessPolicySchema,
	type CreateAccessPolicyRequestSchema,
	CreateAccessPolicyResponseSchema,
	ListAccessPoliciesResponseSchema,
	type UpdateAccessPolicyRequestSchema,
} from "../schemas/contracts/access-policies.contract.js";
import { BaseService } from "./base.service.js";

function normalizePolicy(
	value: Record<string, unknown>,
): Record<string, unknown> {
	const policy = { ...value };
	for (const field of ["enabled", "allow_all_users", "allow_all_agents"]) {
		if (policy[field] === 0 || policy[field] === 1)
			policy[field] = policy[field] === 1;
	}
	if (policy.object === "acces") policy.object = "access";
	return policy;
}

export interface ListAccessPoliciesParams {
	workspace_id?: string;
	effect?: "allow" | "deny";
	enabled?: boolean;
	user_id?: string;
	agent_id?: string;
	server_id?: string;
	search?: string;
	created_by?: string;
	start_time?: string;
	end_time?: string;
	current_page?: number;
	page_size?: number;
}

export class AccessPoliciesService extends BaseService {
	async createAccessPolicy(
		data: z.infer<typeof CreateAccessPolicyRequestSchema>,
	): Promise<z.infer<typeof CreateAccessPolicyResponseSchema>> {
		return CreateAccessPolicyResponseSchema.parse(
			normalizePolicy(await this.post("/policies/access", data)),
		);
	}
	async listAccessPolicies(
		params?: ListAccessPoliciesParams,
	): Promise<z.infer<typeof ListAccessPoliciesResponseSchema>> {
		const response = await this.get<{ data?: Record<string, unknown>[] }>(
			"/policies/access",
			params,
		);
		return ListAccessPoliciesResponseSchema.parse({
			...response,
			...(Array.isArray(response.data)
				? { data: response.data.map(normalizePolicy) }
				: {}),
		});
	}
	async getAccessPolicy(
		id: string,
	): Promise<z.infer<typeof AccessPolicySchema>> {
		return AccessPolicySchema.parse(
			normalizePolicy(
				await this.get(`/policies/access/${this.encodePathSegment(id)}`),
			),
		);
	}
	async updateAccessPolicy(
		id: string,
		data: z.infer<typeof UpdateAccessPolicyRequestSchema>,
	): Promise<Record<string, unknown>> {
		return this.put(`/policies/access/${this.encodePathSegment(id)}`, data);
	}
	async deleteAccessPolicy(id: string): Promise<Record<string, unknown>> {
		await this.delete(`/policies/access/${this.encodePathSegment(id)}`);
		return {};
	}
}
