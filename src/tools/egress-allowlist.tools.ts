import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CurrentPageSchema, PageSizeSchema } from "../lib/schemas.js";
import {
	CreateEgressAllowlistRequestSchema,
	UpdateEgressAllowlistRequestSchema,
} from "../schemas/contracts/egress-allowlist.contract.js";
import type { PortkeyService } from "../services/index.js";
import { jsonResult } from "./utils.js";

const idSchema = z
	.string()
	.uuid()
	.describe(
		"Egress allowlist entry UUID from list_egress_allowlist or create_egress_allowlist_entry",
	);

const listSchema = {
	search: z
		.string()
		.min(1)
		.max(255)
		.optional()
		.describe("Search allowlisted domains"),
	current_page: CurrentPageSchema,
	page_size: PageSizeSchema.describe(
		"Items per page, 1-100; Portkey defaults to 20",
	),
};
const lookupSchema = { id: idSchema };
const updateSchema = UpdateEgressAllowlistRequestSchema.safeExtend({
	id: idSchema,
});

export function registerEgressAllowlistTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.registerTool(
		"list_egress_allowlist",
		{
			description:
				"Inspect the organisation's trusted custom-host egress allowlist without changing destinations. Returns total and the current page of entries; filter by domain before creating duplicates, and use get_egress_allowlist_entry to inspect one entry. Requires organisation permission.",
			inputSchema: listSchema,
		},
		async (params) =>
			jsonResult(await service.egressAllowlist.listEgressAllowlist(params)),
	);
	server.registerTool(
		"create_egress_allowlist_entry",
		{
			description:
				"Trust a custom hostname, IP literal, or wildcard for organisation egress, widening permitted outbound destinations. Use list_egress_allowlist to inspect existing trust first. Portkey rejects metadata destinations and duplicates. Returns the new UUID and normalized domain; requires organisation permission.",
			inputSchema: CreateEgressAllowlistRequestSchema,
		},
		async (params) =>
			jsonResult(
				await service.egressAllowlist.createEgressAllowlistEntry(params),
			),
	);
	server.registerTool(
		"get_egress_allowlist_entry",
		{
			description:
				"Read one organisation egress allowlist entry's trusted domain, description, and audit fields. Use this before changing or deleting a destination. Returns entry details, or HTTP 404 if it is missing; requires organisation permission.",
			inputSchema: lookupSchema,
		},
		async ({ id }) =>
			jsonResult(await service.egressAllowlist.getEgressAllowlistEntry(id)),
	);
	server.registerTool(
		"update_egress_allowlist_entry",
		{
			description:
				"Change an organisation egress allowlist domain or description, potentially changing trusted outbound destinations. Inspect get_egress_allowlist_entry first. Omitted fields stay unchanged; description null clears it. At least one changed field is required. Returns Portkey's acknowledgement; requires organisation permission.",
			inputSchema: updateSchema,
			annotations: { destructiveHint: true },
		},
		async ({ id, ...params }) =>
			jsonResult(
				await service.egressAllowlist.updateEgressAllowlistEntry(id, params),
			),
	);
	server.registerTool(
		"delete_egress_allowlist_entry",
		{
			description:
				"Remove an organisation egress allowlist entry, revoking trust in its outbound destination and potentially breaking integrations that use it. Inspect get_egress_allowlist_entry first. Deletion cannot be undone by this tool. Returns Portkey's acknowledgement or HTTP 404; requires organisation permission.",
			inputSchema: lookupSchema,
		},
		async ({ id }) =>
			jsonResult(await service.egressAllowlist.deleteEgressAllowlistEntry(id)),
	);
}
