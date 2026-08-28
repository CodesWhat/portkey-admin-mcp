#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const toolsDir = path.join(root, "src", "tools");
const manifest = JSON.parse(
	readFileSync(path.join(root, "lhm.plugin.json"), "utf8"),
);
const manifestTools = new Map(manifest.tools.map((tool) => [tool.name, tool]));

function findTableDrivenNames(source) {
	const names = [];
	const loopPattern =
		/for\s*\(\s*const\s+(\w+)\s+of\s+(\w+)\s*\)\s*\{[^}]*?server\.(?:tool|registerTool)\(\s*\1\.name/gs;
	for (const loopMatch of source.matchAll(loopPattern)) {
		const declarationIndex = source.indexOf(`const ${loopMatch[2]}`);
		const assignmentIndex = source.indexOf("= [", declarationIndex);
		if (declarationIndex === -1 || assignmentIndex === -1) continue;
		const start = assignmentIndex + 2;
		let depth = 0;
		let end = start;
		for (let index = start; index < source.length; index++) {
			if (source[index] === "[") depth++;
			else if (source[index] === "]") {
				depth--;
				if (depth === 0) {
					end = index;
					break;
				}
			}
		}
		for (const match of source
			.slice(start, end)
			.matchAll(/name:\s*["']([^"']+)["']/g)) {
			names.push(match[1]);
		}
	}
	return names;
}

function namesForDomain(domain) {
	const source = readFileSync(
		path.join(toolsDir, `${domain}.tools.ts`),
		"utf8",
	);
	const literalNames = [
		...source.matchAll(/server\.(?:tool|registerTool)\(\s*["']([^"']+)["']/gms),
	].map((match) => match[1]);
	return [...literalNames, ...findTableDrivenNames(source)];
}

const DOMAINS = [
	{
		name: "users",
		routes: [
			"GET/PUT/DELETE `/admin/users/{userId}`; GET `/admin/users`",
			"POST/GET `/admin/users/invites`; GET/DELETE `/admin/users/invites/{inviteId}`; POST `/admin/users/invites/{inviteId}/resend`",
			"GET `/analytics/groups/users`",
		],
	},
	{
		name: "workspaces",
		routes: [
			"GET/POST `/admin/workspaces`; GET/PUT/DELETE `/admin/workspaces/{workspaceId}`",
			"GET/POST `/admin/workspaces/{workspaceId}/users`; GET/PUT/DELETE `/admin/workspaces/{workspaceId}/users/{userId}`",
			"GET/POST `/scim/workspaces`; DELETE `/scim/workspaces/{mappingId}`; GET `/scim/groups`",
		],
	},
	{
		name: "configs",
		routes: [
			"GET/POST `/configs`; GET/PUT/DELETE `/configs/{slug}`; GET `/configs/{slug}/versions`",
		],
	},
	{
		name: "deployments",
		routes: [
			"GET/POST `/deployments`; GET/PUT/DELETE `/deployments/{id}`. DELETE archives; deprecated `/ping` is intentionally omitted.",
		],
	},
	{
		name: "keys",
		routes: [
			"GET/POST `/virtual-keys`; GET/PUT/DELETE `/virtual-keys/{slug}`",
			"GET `/api-keys`; POST `/api-keys/{type}/{subType}`; GET/PUT/DELETE `/api-keys/{id}`; POST `/api-keys/{id}/rotate`",
		],
	},
	{
		name: "collections",
		routes: [
			"GET/POST `/collections`; GET/PUT/DELETE `/collections/{collectionId}`",
		],
	},
	{
		name: "prompts",
		routes: [
			"GET/POST `/prompts`; GET/PUT/DELETE `/prompts/{promptId}`",
			"GET `/prompts/{promptId}/versions`; GET/PUT `/prompts/{promptId}/versions/{versionId}`; PUT `/prompts/{promptId}/makeDefault`",
			"POST `/prompts/{promptId}/render`; POST `/prompts/{promptId}/completions`",
		],
	},
	{
		name: "analytics",
		routes: ["See the analytics endpoint matrix below."],
	},
	{
		name: "guardrails",
		routes: [
			"GET/PUT `/admin/organisation/defaults`",
			"GET/PUT `/workspace-exclusions/{input-guardrails|output-guardrails}`",
			"GET/POST `/guardrails`; GET/PUT/DELETE `/guardrails/{guardrailId}`",
		],
	},
	{
		name: "limits",
		routes: [
			"GET/POST `/policies/rate-limits`; GET/PUT/DELETE `/policies/rate-limits/{id}`",
			"GET/POST `/policies/usage-limits`; GET/PUT/DELETE `/policies/usage-limits/{id}`",
			"GET `/policies/usage-limits/{id}/entities`; PUT `/policies/usage-limits/{id}/entities/{entityId}/reset`",
		],
	},
	{ name: "audit", routes: ["GET `/audit-logs`"] },
	{
		name: "labels",
		routes: ["GET/POST `/labels`; GET/PUT/DELETE `/labels/{labelId}`"],
	},
	{
		name: "partials",
		routes: [
			"GET/POST `/prompts/partials`; GET/PUT/DELETE `/prompts/partials/{partialId}`",
			"GET `/prompts/partials/{partialId}/versions`; PUT `/prompts/partials/{partialId}/makeDefault`",
		],
	},
	{
		name: "tracing",
		routes: ["POST `/feedback`; PUT `/feedback/{id}`"],
	},
	{
		name: "logging",
		routes: [
			"POST `/logs`; GET `/logs/{logId}`",
			"GET `/logs/exports/field-restrictions`; GET/POST `/logs/exports`; GET/PUT `/logs/exports/{exportId}`",
			"POST `/logs/exports/{exportId}/{start|cancel}`; GET `/logs/exports/{exportId}/download`",
		],
	},
	{
		name: "providers",
		routes: ["GET/POST `/providers`; GET/PUT/DELETE `/providers/{slug}`"],
	},
	{
		name: "secret-references",
		routes: [
			"GET/POST `/secret-references`; GET/PUT/DELETE `/secret-references/{id}`",
		],
	},
	{
		name: "integrations",
		routes: [
			"GET `https://api.portkey.ai/model-configs/pricing/{provider}/{model}` (public catalog, no Admin API credential)",
			"GET/POST `/integrations`; GET/PUT/DELETE `/integrations/{slug}`",
			"GET/PUT/DELETE `/integrations/{slug}/models`; GET/PUT `/integrations/{slug}/workspaces`",
		],
	},
	{
		name: "mcp-integrations",
		routes: [
			"GET/POST `/mcp-integrations`; GET/PUT/DELETE `/mcp-integrations/{id}`",
			"GET `/mcp-integrations/{id}/metadata`; GET/PUT `/mcp-integrations/{id}/capabilities`; GET/PUT `/mcp-integrations/{id}/workspaces`",
		],
	},
	{
		name: "mcp-servers",
		routes: [
			"GET/POST `/mcp-servers`; GET/PUT/DELETE `/mcp-servers/{id}`; POST `/mcp-servers/{id}/test`",
			"GET/PUT `/mcp-servers/{id}/capabilities`; GET/PUT `/mcp-servers/{id}/user-access`; GET/DELETE `/mcp-servers/{id}/connections`",
		],
	},
];

const ANALYTICS = [
	["get_cost_analytics", "/analytics/graphs/cost"],
	["get_request_analytics", "/analytics/graphs/requests"],
	["get_token_analytics", "/analytics/graphs/tokens"],
	["get_latency_analytics", "/analytics/graphs/latency"],
	["get_error_analytics", "/analytics/graphs/errors"],
	["get_error_rate_analytics", "/analytics/graphs/errors/rate"],
	["get_cache_hit_latency", "/analytics/graphs/cache/latency"],
	["get_cache_hit_rate", "/analytics/graphs/cache/hit-rate"],
	["get_cache_summary", "/analytics/summary/cache"],
	["get_users_analytics", "/analytics/graphs/users"],
	["get_error_stacks_analytics", "/analytics/graphs/errors/stacks"],
	["get_error_status_codes_analytics", "/analytics/graphs/errors/status-codes"],
	["get_user_requests_analytics", "/analytics/graphs/users/requests"],
	["get_rescued_requests_analytics", "/analytics/graphs/requests/rescued"],
	["get_feedback_analytics", "/analytics/graphs/feedbacks"],
	["get_feedback_models_analytics", "/analytics/graphs/feedbacks/ai-models"],
	["get_feedback_scores_analytics", "/analytics/graphs/feedbacks/scores"],
	["get_feedback_weighted_analytics", "/analytics/graphs/feedbacks/weighted"],
	["get_analytics_group_users", "/analytics/groups/users"],
	["get_analytics_group_models", "/analytics/groups/ai-models"],
	["get_analytics_group_metadata", "/analytics/groups/metadata/{key}"],
	["get_analytics_group_providers", "/analytics/groups/provider"],
];

function escapeCell(value) {
	return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

const sections = [];
const allNames = [];
for (const domain of DOMAINS) {
	const names = namesForDomain(domain.name);
	allNames.push(...names);
	const rows = names.map((name) => {
		const tool = manifestTools.get(name);
		if (!tool) throw new Error(`lhm.plugin.json is missing ${name}`);
		return `| \`${name}\` | ${escapeCell(tool.description)} |`;
	});
	sections.push(
		`## ${domain.name} (${names.length})\n\nRoutes:\n\n${domain.routes.map((route) => `- ${route}`).join("\n")}\n\n| Tool | Selection guidance and result |\n|---|---|\n${rows.join("\n")}`,
	);
}

if (
	allNames.length !== manifest.tools.length ||
	new Set(allNames).size !== allNames.length
) {
	throw new Error(
		`Domain inventory has ${allNames.length} entries (${new Set(allNames).size} unique), manifest has ${manifest.tools.length}`,
	);
}

const analyticsRows = ANALYTICS.map(
	([name, route]) => `| \`${name}\` | GET \`${route}\` |`,
).join("\n");

const output = `# Portkey Admin API endpoints and MCP tools

Generated from the registered tool catalog by \`npm run generate:endpoints\`.
Route mappings were reviewed against the official Portkey OpenAPI on 2026-08-28.

- Base URL: \`https://api.portkey.ai/v1\`
- Authentication: \`x-portkey-api-key\`
- Public catalog exception: \`get_model_pricing\` uses \`https://api.portkey.ai\` without authentication
- Total: ${allNames.length} tools across ${DOMAINS.length} domains
- Enterprise-gated names and counts are maintained in \`src/tools/index.ts\` and verified against README by \`npm run verify:readme-tools\`

The route lists are domain-level service routes. The tool tables are the complete
MCP catalog and preserve the actual selection guidance exposed through
\`tools/list\`. A tool can perform a workflow across several listed routes rather
than mapping one-to-one to one HTTP endpoint.

## Workflow-only and multi-request tools

| Tool | Behavior |
|---|---|
| \`migrate_prompt\` | Pages exact-name prompt lookup, then creates, updates, or no-ops after comparing every supplied execution field. |
| \`promote_prompt\` | Reads the source and exact target, then creates or updates the target while honoring an explicit destination virtual-key override. |
| \`validate_completion_metadata\` | Validates billing metadata locally and makes no Portkey request. |
| \`get_prompt\` | Combines prompt detail with a separate full version-history read. |
| \`get_model_pricing\` | Reads the unauthenticated public catalog origin instead of the credentialed \`/v1\` base. |

## Analytics endpoint matrix

| Tool | Current route |
|---|---|
${analyticsRows}

<!-- tool-catalog:start -->
${sections.join("\n\n")}
<!-- tool-catalog:end -->

## Current wire-contract notes

- Rate conditions are \`{ key, value, excludes? }\`; grouping entries are
  \`{ key }\`. Rate units are \`rpm|rph|rpd|rpw\`, and targets are
  \`llm|mcp_tools\`.
- Usage-policy reads include current reset metadata when Portkey returns it:
  \`periodic_reset_days\`, \`next_usage_reset_at\`, and \`last_reset_at\`.
- Workspace membership creation accepts one MCP-facing member but sends Portkey's
  batched \`{ users: [{ id, role }] }\` wire form.
- Prompt \`is_raw_template\` semantics are preserved through create, update,
  migration, copy, version reads, and promotion.
- Deployment registration or authentication rotation may return one-time secrets.
  Tool results warn that those values appear in the MCP transcript and must be
  stored immediately. The deprecated deployment ping operation is not exposed.
- Virtual Keys and Providers remain separate current Admin API domains even as
  Portkey product terminology shifts toward Providers.

## Tracked but not exposed

- Prompt and partial share/fork/unshare operations remain out until Portkey
  publishes complete public contracts and an unambiguous versioned base path.
- Agent Gateway management remains out until its public management contract is
  merged and stable.
- SDK-only MCP integration sync, credential, metadata, client-info, and access-check
  operations remain out unless they gain public contracts and transcript-safe
  credential handling.
- MCP integration test/authorization-parameter additions and guardrail \`ids\`
  filtering remain tracked because they are absent from the current public OpenAPI.
- Prisma AIRS remains a separate interoperability surface, not a
  \`PORTKEY_BASE_URL\` replacement.
`;

writeFileSync(path.join(root, "ENDPOINTS.md"), output);
console.log(
	`Wrote ${allNames.length} tools across ${DOMAINS.length} domains to ENDPOINTS.md`,
);
