import type { z } from "zod";
import type {
	CreateEgressAllowlistRequestSchema,
	CreateEgressAllowlistResponseSchema,
	EgressAllowlistEntrySchema,
	ListEgressAllowlistResponseSchema,
	UpdateEgressAllowlistRequestSchema,
} from "../schemas/contracts/egress-allowlist.contract.js";
import { BaseService } from "./base.service.js";

export interface ListEgressAllowlistParams {
	search?: string;
	current_page?: number;
	page_size?: number;
}

export class EgressAllowlistService extends BaseService {
	async createEgressAllowlistEntry(
		data: z.infer<typeof CreateEgressAllowlistRequestSchema>,
	): Promise<z.infer<typeof CreateEgressAllowlistResponseSchema>> {
		return this.postV2("/egress-allowlist", data);
	}
	async listEgressAllowlist(
		params?: ListEgressAllowlistParams,
	): Promise<z.infer<typeof ListEgressAllowlistResponseSchema>> {
		return this.getV2("/egress-allowlist", params);
	}
	async getEgressAllowlistEntry(
		id: string,
	): Promise<z.infer<typeof EgressAllowlistEntrySchema>> {
		return this.getV2(`/egress-allowlist/${this.encodePathSegment(id)}`);
	}
	async updateEgressAllowlistEntry(
		id: string,
		data: z.infer<typeof UpdateEgressAllowlistRequestSchema>,
	): Promise<Record<string, unknown>> {
		return this.putV2(`/egress-allowlist/${this.encodePathSegment(id)}`, data);
	}
	async deleteEgressAllowlistEntry(
		id: string,
	): Promise<Record<string, unknown>> {
		await this.deleteV2(`/egress-allowlist/${this.encodePathSegment(id)}`);
		return {};
	}
}
