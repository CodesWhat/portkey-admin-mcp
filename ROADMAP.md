# Portkey Admin MCP roadmap

> Last reviewed: 2026-08-28
> Status: active compatibility maintenance
> Current catalog: 178 tools across 20 domains, including 53 Enterprise-gated tools

Portkey continues to publish control-plane additions after its acquisition by
Palo Alto Networks. This project follows the stable public Portkey OpenAPI and
official product documentation. Prisma AIRS remains a separate interoperability
track and is not treated as a compatible `PORTKEY_BASE_URL`.

## Current coverage

| Domain | Tools | Current scope |
|---|---:|---|
| Users | 10 | Accepted users, invitations, stats, lifecycle |
| Workspaces | 14 | Workspace lifecycle, members, SCIM mappings/groups |
| Configs | 6 | Gateway configuration lifecycle and versions |
| Deployments | 5 | Self-hosted Gateway registration, reads, updates, archival |
| Keys | 11 | Virtual Keys and API keys, rotation, current limits/defaults |
| Collections | 5 | Prompt collections |
| Prompts | 14 | Lifecycle, versions, render, completion, migration, promotion |
| Analytics | 22 | Graphs, cache summary, and grouped user/model/provider/metadata views |
| Guardrails | 11 | Policies, organisation defaults, workspace exclusions |
| Limits | 12 | Rate/usage policies, tracked entities, counter reset |
| Audit | 1 | Audit-log reads |
| Labels | 5 | Prompt version labels |
| Partials | 7 | Prompt partial lifecycle and versions |
| Tracing | 2 | Feedback creation and updates |
| Logging | 10 | Logs, export jobs, downloads, field restrictions |
| Providers | 5 | Workspace provider configurations |
| Secret References | 5 | External-secret reference lifecycle |
| Integrations | 11 | Provider integrations, models, workspace access, public pricing |
| MCP Integrations | 10 | External MCP integration lifecycle and access |
| MCP Servers | 12 | Registry, tests, capabilities, access, live connections |

The complete generated tool catalog and route matrix lives in
[ENDPOINTS.md](./ENDPOINTS.md). `npm run verify:readme-tools` checks the source,
README, endpoint catalog, domain counts, and Enterprise-gated inventory together.

## Completed 2026-08-28

- Revalidated the catalog against the latest official Portkey OpenAPI commit.
  The upstream specification has not changed since 2026-08-21, so there are no
  new stable Admin API routes to expose and the validation watchlist remains
  intentionally deferred.
- Rechecked Prisma AIRS' August 2026 additions. They extend runtime, model,
  skill, discovery, and red-team security rather than publishing a
  Portkey-compatible AI Gateway administration contract.
- Hardened CI's actionlint installation with the upstream release SHA-256 and
  split automatic tag creation from release dispatch so their write grants are
  isolated to separate jobs.
- Submitted [awesome-mcp-servers #13074](https://github.com/punkpeye/awesome-mcp-servers/pull/13074)
  to update the moved repository, Glama badge, and 178-tool inventory.

## Completed 2026-08-27

### Whole-app review remediation

- Release tags and corrected manifests must be reachable from protected `main`.
  Publish jobs use the protected `release` environment, and the npm archive is
  installed and smoke-tested before OIDC publication.
- Manual release backfills never execute dependencies from a dispatch-supplied
  ref. New archives build only from GitHub's selected tag commit, existing npm
  versions skip packaging, and hosted Qlty uses the repository's Biome version.
- Validated release and manifest refs are pinned to immutable commit SHAs. Every
  release run must originate at the requested tag commit, and every public
  publisher rechecks the tag before changing external state.
- Workspace-member, prompt migration/promotion, config update/version, user
  pagination, analytics-bound, prompt-variable, and integration-delete contracts
  now match current behavior.
- Key and workspace timestamps use strict ISO 8601 validation, cross-field errors
  identify every involved input, and MCP integration header/pagination contracts
  match their accepted payloads.
- Readiness checks coalesce and back off; replay polling backs off; the in-memory
  replay store has event/byte caps and indexed eviction.
- Private IPv6 coverage is complete, trust-all proxy mode is rejected, stateful
  transport failures return JSON-RPC, and the duplicate HTTP limiter is gone.
- Every confirmed review finding has focused regression coverage. The ignored
  `.research-findings.md` owns the detailed 21-item checklist and verification state.
- HTTP docs state that every authenticated principal shares the configured
  Portkey credential and that separate trust levels need separately scoped
  deployments and tool-domain allowlists.

### Current Portkey API additions

- Added deployment list/register/get/update/archive without the deprecated ping
  operation. One-time deployment credentials include explicit transcript handling.
- Added cache summary and provider-grouped analytics.
- Replaced legacy rate/usage policy shapes with the current condition, grouping,
  target, unit, entity, and reset contracts.
- Expanded Virtual Key, API-key, workspace, user/invitation/member, and MCP
  integration fields and filters that are present in the public OpenAPI.
- Preserved raw-template semantics through every prompt workflow.
- Added current fixture-backed contracts for deployments, analytics, limits, and
  MCP integrations, plus explicit fixture-capture outcomes and expanded live smoke.
- Regenerated LobeHub metadata and the complete endpoint/tool inventory.
- Documented the current Virtual Keys/Providers terminology boundary.

## Active upstream-validation work

These are intentionally not implementation tasks until the cited contract becomes
stable and public:

- Prompt and partial share/fork/unshare, shared-type filters, and share metadata.
- Agent Gateway management.
- SDK-only MCP integration sync, credential, client-info, metadata, and access-check
  operations that do not yet have safe public contracts.
- MCP integration test/named authorization parameters, guardrail `ids`, and
  workspace `name_format=plain`, which are absent from the current public OpenAPI.
- Disputed limit-policy extensions such as `tpm|tph|tpd`, arbitrary reset cadence,
  requests-based usage policies, and mutability beyond the published schema.
- Hosted control-plane route availability. The merged public OpenAPI documents
  deployments, SCIM groups, and organisation defaults, but the available hosted
  organisation credential reached data-plane routes and received missing-provider
  HTTP 400 responses for `/v1/deployments`, `/v1/scim/groups`, and
  `/v1/admin/organisation/defaults`. Keep the documented Enterprise/self-hosted
  tools and recheck those hosted routes.
- A native Prisma AIRS adapter. Add one only after Palo Alto Networks publishes a
  stable AI Gateway management API; keep it distinct from Portkey mode.

## Fixture evidence boundary

Most committed fixtures are live captures. Rate-limit, usage-limit, and MCP
integration list fixtures were refreshed live on 2026-08-27. API-key rotation,
Secret References, analytics additions, usage-limit entities, and deployments
remain documentation-derived for the explicit scope or route outcomes recorded in
`tests/fixtures/manifest.json`.

The 2026-08-27 live read-only smoke run also confirmed that other unavailable
operations return explicit HTTP 401 or 403 permission responses for the configured
credential. The smoke runner treats those scope outcomes and the three hosted route
gaps above as skips while preserving failures for unexpected responses.
