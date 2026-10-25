# Portkey Admin MCP roadmap

> Last reviewed: 2026-10-24
> Status: active compatibility maintenance
> Current catalog: 194 tools across 22 domains, including 56 Enterprise-gated tools

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
| Deployments | 5 | Self-hosted Gateway registration, tags, reads, updates, archival |
| Keys | 11 | Virtual Keys and API keys, rotation, current limits/defaults |
| Collections | 5 | Prompt collections, including nested collections |
| Prompts | 14 | Lifecycle, versions, render, completion, migration, promotion |
| Analytics | 25 | Graphs, cache summary, and grouped user/model/provider/metadata/MCP/A2A/workspace views, filterable by deployment |
| Guardrails | 14 | LLM and MCP-tool policies, server mappings, organisation defaults, workspace exclusions |
| Access Policies | 5 | Versioned allow/deny policies for users, groups, agents, MCP tools, and provider models |
| Egress Allowlist | 5 | Organisation trust for custom outbound hosts |
| Limits | 12 | Rate/usage policies, tracked entities, counter reset |
| Audit | 1 | Audit-log reads |
| Labels | 5 | Prompt version labels |
| Partials | 7 | Prompt partial lifecycle and versions |
| Tracing | 2 | Feedback creation and updates |
| Logging | 10 | Logs, export jobs, downloads, field restrictions |
| Providers | 5 | Workspace provider configurations |
| Secret References | 5 | External-secret reference lifecycle |
| Integrations | 11 | Provider integrations, tags, models, workspace access, public pricing |
| MCP Integrations | 10 | External MCP integration lifecycle and access |
| MCP Servers | 12 | Registry, tests, capabilities, access, live connections |

The complete generated tool catalog and route matrix lives in
[ENDPOINTS.md](./ENDPOINTS.md). `npm run verify:readme-tools` checks the source,
README, endpoint catalog, domain counts, and Enterprise-gated inventory together.

## Planned

Reviewed 2026-10-16 against Portkey OpenAPI commit `700ece6` (October 13).
Access policies and egress allowlists are covered. Existing published contracts
are unchanged from the September baseline. Egress calls use the hosted `/v2`
base: `/v1` returns the inference gateway fallback, while `/v2` reaches the
organisation permission check. The configured credential can list access
policies but cannot read the egress allowlist; access-policy create/read/replace/version-conflict/delete behavior was verified
with a disposable disabled policy. Egress read and mutation contracts remain
documentation-derived pending an appropriately scoped tenant.

Prisma AIRS now publishes management contracts. The interoperability guide
records the authentication, route, domain, and verification differences. Native
adapter work waits for a credentialed tenant to verify those contracts; a base
URL substitution remains unsupported.

### Later

- Move to the MCP 2026-07-28 specification and the v2 TypeScript SDK, serving
  modern and older clients from the same endpoint. Evaluated on 2026-10-02:
  modern clients can fall back to the current server's older handshake, most
  clients still open with that handshake, and the v2 SDK is still changing
  between minor releases. Work starts by 2026-12-01, or sooner if a v1 SDK
  security fix stops coming, a client drops support for the older handshake, or
  30 days pass without a v2 server release carrying upgrade notes.
  Target completion before 2027-01-27. This is a project planning target, not
  an announced SDK end-of-life or a user-facing removal date. It retires the
  replay and session stores, so it ships as a minor release whose number is
  still to be assigned.
- Before that MCP migration ships, finalize the versioned compatibility and
  deprecation table in [COMPATIBILITY.md](COMPATIBILITY.md), linked from the
  README and CHANGELOG. Current behavior and the unassigned migration are
  documented separately. Name the releases that first deprecate,
  ignore, or remove `MCP_SESSION_MODE`,
  `MCP_SESSION_TIMEOUT`, and `MCP_EVENT_*`, with warning behavior and operator
  migration steps. Explain loss of sessions, GET-stream/replay, and
  `Last-Event-ID` recovery while retaining older clients on the same endpoint.
  Update `docs/VERCEL_DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, and
  `SECURITY-ASSURANCE.md` together. Distinguish retiring replay Redis settings
  from the retained Redis rate limiter, its URL fallbacks, and the stateless
  concurrency cap. These settings remain active in 0.14.0.

## Completed 2026-10-24 (0.14.1)

- Patched the dependency lock's body-parser, fast-uri, Hono, and ip-address
  advisories; the full npm audit is clear. Updated the declared npm toolchain
  and the pinned CodeQL action while retaining the seven-day release-age policy
  for non-security updates.
- Enforced standalone Qlty CLI checks in CI and pre-push, with published
  commit-specific check, duplication, complexity, and metrics reports. Existing
  Cloud badges and coverage uploads remain in place; local quality results have
  no verified import path for the official Cloud maintainability badge.
- Verified the Docker HTTP health check, non-root UID, authenticated 194-tool
  discovery, and stdio discovery in the isolated NAS testbed.

## Completed 2026-10-16 (0.14.0)

- Added five versioned access-policy tools and five organisation egress-allowlist
  tools, bringing the catalog to 194 tools across 22 domains. Access-policy
  mutations were verified with a disabled disposable policy; egress contracts
  remain documentation-derived behind the available credential's 403 response.
- Updated the MCP SDK to 1.32.1 and enabled its 10,000-element input budget
  before schema validation. Refreshed Express, runtime and development
  dependencies, the Node image, and pinned workflow actions.
- Corrected the Prisma AIRS management-contract guidance while retaining the
  credentialed-tenant gate for a separate adapter.
- Verified npm, MCP Registry, and owner-controlled marketplace publication at
  0.14.0, rebuilt Glama's 194-tool inventory, and refreshed the Docker submission.
  [Distribution records](docs/DISTRIBUTION.md) distinguish publication from
  downstream caches and pending upstream review.

## Completed 2026-10-16 (documentation and maintenance audit)

- Repaired changelog comparison links and aligned contribution, governance,
  release, and Renovate branching guidance around the active development line
  and reviewed promotion to protected `main`.
- Published [compatibility and deprecation status](COMPATIBILITY.md), separating
  current 0.14.0 behavior from the unassigned MCP migration. Exact future
  warning/removal releases and the operator cutover guide remain migration work.
- Added README documentation and roadmap navigation, retained the themed
  CodesWhat footer, and corrected the single-container HTTP example's explicit
  in-memory rate-limit acknowledgement.
- Recorded post-release catalog evidence and the Glama sync/build procedure,
  preserving dated earlier observations and audits.
- Checked GitHub security alerts and dependency health after 0.14.0: no open
  Dependabot, code-scanning, secret-scanning, or repository advisory findings;
  full and production npm audits reported no vulnerabilities. Direct packages
  are current within the supported Node.js 24 line. Updated the release-only
  MCP publisher to 1.8.1 and pinned the LobeHub maintenance CLI to 0.0.41.
  CodeQL action 4.39.0 remains queued under Renovate's seven-day release-age
  policy; security updates bypass that delay.

## Completed 2026-10-02 (0.13.0)

- Analytics: the `deployment_id` filter on every analytics tool, and the MCP,
  A2A, and workspace grouped views.
- Integrations: `tags` on list, create, and update.
- Collections: `parent_collection_id` on create, and parent and child
  collections on read.
- ENDPOINTS.md marks the routes the public OpenAPI doesn't document.
- Closed the review comments deferred from 0.12.1: guardrail mapping
  prerequisites, the optional guardrail target, and three test reliability
  fixes.

## Completed 2026-10-02 (0.12.2)

- Corrected the `list_audit_logs` row in ENDPOINTS.md, which ships in the npm
  package, and added `npm run verify:generated` so a stale ENDPOINTS.md or
  LobeHub manifest fails CI.
- Raised the MCP SDK and zod floors to the tested versions and brought the
  README environment reference, distribution inventory, and release guide up
  to date.

## Completed 2026-10-02 (0.12.1)

- Cleared the two moderate advisories in transitive runtime dependencies with a
  lockfile update: `ip-address` 10.7.3 and `fast-uri` 3.1.8.
- Brought `list_audit_logs` in line with the published contract: it reads
  `records`, returns the request-level fields, requires the time range and
  organisation ID, and filters by `user_id` and the other documented
  parameters. The route is Enterprise-gated, so the fixture is
  documentation-derived and a live capture is still outstanding.
- Took the pending dependency updates, including MCP SDK 1.31.0 and the
  Node 24.21 image, and taught Renovate to move the Biome schema URL and Qlty
  plugin pin with the Biome package.
- ISO 8601 timestamp inputs need seconds (`2026-01-01T00:00:00Z`) since the zod
  4.6 update, and minute precision is rejected. That stays on purpose.

## Completed 2026-09-08

- Revalidated the official Portkey OpenAPI through commit `3fa53f2`. Added the
  stable September contracts for deployment tags, expanded usage-limit policy
  updates, and guardrail MCP targets and server mappings.
- Deployment list filters encode tag maps as JSON, create and update preserve
  flat string tags, and `null` clears all tags where the API permits it.
- Usage-limit updates now support descriptions, complete condition replacement,
  custom reset-day intervals, explicit next-reset timestamps, and the documented
  null-clear fields. Weekly/monthly and custom-day reset modes cannot be active
  together.
- Guardrails can target LLM or MCP-tool traffic. Three MCP tools list, replace,
  and upsert server mappings, with replacement semantics and default input/output
  phases surfaced in their runtime schemas and descriptions.
- Corrected Renovate's base branch to the active development line and verified
  npm 12 still installs the repository's lefthook-managed Git hooks.
- Refreshed the generated endpoint and LobeHub inventories for 181 tools.
- Aligned npm and MCP Registry descriptions, documented every maintained and
  observed distribution surface, and refreshed Awesome MCP Servers PR #13074
  against current upstream with the CodesWhat owner and 181-tool inventory.

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
- Every confirmed review finding has focused regression coverage in the repository
  test suite, with implementation history retained in the merged pull requests.
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
stable and public, or the stated live-verification prerequisite is met:

- Prompt and partial share/fork/unshare, shared-type filters, and share metadata.
- Agent Gateway management.
- SDK-only MCP integration sync, credential, client-info, access-check, and richer
  metadata operations beyond the existing public metadata route that do not yet
  have safe public contracts.
- MCP integration test/named authorization parameters, guardrail `ids`, and
  workspace `name_format=plain`, which are absent from the current public OpenAPI.
- Disputed limit-policy extensions such as `tpm|tph|tpd`, requests-based usage
  policies, custom reset cadence on creation, and fields absent from the published
  schemas.
- Hosted control-plane route availability for credentials that lack the required
  organisation or feature scopes. The smoke runner treats only explicit HTTP 401
  and 403 permission denials as skips; unexpected HTTP 400 route failures remain
  real failures.
- A native Prisma AIRS adapter. The management specification is now public;
  verify its authentication, separate management bases, and supported domains
  against a credentialed tenant before implementation. Keep it distinct from
  Portkey mode, as described in `docs/PRISMA_AIRS_INTEROPERABILITY.md`.

## Distribution follow-up

- Docker MCP Catalog: submitted as
  [docker/mcp-registry #5026](https://github.com/docker/mcp-registry/pull/5026),
  refreshed to the 0.14.0 release commit on 2026-10-16 with 194-tool discovery
  evidence, and awaiting maintainer review.
- Awesome MCP Servers: [#13074](https://github.com/punkpeye/awesome-mcp-servers/pull/13074)
  merged on 2026-09-13.
- Glama: synced and rebuilt after 0.14.0 on 2026-10-16; the indexed release
  commit and public schema show 194 tools. After each release, sync the
  repository and run Build & Release on the listing (see `docs/RELEASE.md`).
  Generated descriptions and quality-score evaluation can lag the inventory.
- Recheck PulseMCP after listing changes reopen. Its legacy record still uses the
  pre-organization namespace and is not currently editable.
- Claim or refresh the stale mcp.so record when its owner workflow is available.
  Treat FindMCP and Enterprise DNA as downstream mirrors unless they publish a
  supported correction path.
- Defer Smithery until this project intentionally ships an MCPB bundle or a
  hosted Streamable HTTP endpoint.

## Fixture evidence boundary

Most committed fixtures are live captures. Rate-limit, usage-limit, and MCP
integration list fixtures were refreshed live on 2026-08-27. API-key rotation,
Secret References, analytics additions, usage-limit entities, and deployments
remain documentation-derived for the explicit scope or route outcomes recorded in
`tests/fixtures/manifest.json`.

The live read-only smoke run also confirms unavailable operations through explicit
HTTP 401 or 403 permission responses for the configured credential. Those scope
outcomes are skips; every unexpected response remains a failure.
