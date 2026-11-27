# Portkey Admin MCP roadmap

> Last reviewed: 2026-11-27
> Status: active compatibility maintenance
> Current catalog: 195 tools across 22 domains, including 57 Enterprise-gated tools

Portkey continues to publish control-plane additions after its acquisition by
Palo Alto Networks. This project follows the stable public Portkey OpenAPI and
official product documentation. Prisma AIRS remains a separate interoperability
track and is not treated as a compatible `PORTKEY_BASE_URL`.

## Current coverage

| Domain            | Tools | Current scope                                                                                                                                                             |
| ----------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users             |    10 | Accepted users, invitations, stats, lifecycle                                                                                                                             |
| Workspaces        |    14 | Workspace lifecycle, members, SCIM mappings/groups                                                                                                                        |
| Configs           |     6 | Gateway configuration lifecycle and versions                                                                                                                              |
| Deployments       |     5 | Self-hosted Gateway registration, tags, reads, updates, archival                                                                                                          |
| Keys              |    11 | Virtual Keys and API keys, rotation, current limits/defaults; keys and providers take `usage_limit_type` plus `periodic_reset` or `periodic_reset_days` for reset cadence |
| Collections       |     5 | Prompt collections, including nested collections                                                                                                                          |
| Prompts           |    14 | Lifecycle, versions, render, completion, migration, promotion                                                                                                             |
| Analytics         |    25 | Graphs, cache summary, and grouped user/model/provider/metadata/MCP/A2A/workspace views, filterable by deployment                                                         |
| Guardrails        |    14 | LLM and MCP-tool policies, server mappings, organisation defaults, workspace exclusions                                                                                   |
| Access Policies   |     5 | Versioned allow/deny policies for users, groups, agents, MCP tools, and provider models                                                                                   |
| Egress Allowlist  |     5 | Organisation trust for custom outbound hosts                                                                                                                              |
| Limits            |    12 | Rate/usage policies, tracked entities, counter reset                                                                                                                      |
| Audit             |     1 | Audit-log reads                                                                                                                                                           |
| Labels            |     5 | Prompt version labels                                                                                                                                                     |
| Partials          |     7 | Prompt partial lifecycle and versions                                                                                                                                     |
| Tracing           |     2 | Feedback creation and updates                                                                                                                                             |
| Logging           |    10 | Logs, export jobs, downloads, field restrictions                                                                                                                          |
| Providers         |     5 | Workspace provider configurations                                                                                                                                         |
| Secret References |     5 | External-secret reference lifecycle                                                                                                                                       |
| Integrations      |    11 | Provider integrations, tags, models, workspace access, public pricing, `configurations` passthrough                                                                       |
| MCP Integrations  |    10 | External MCP integration lifecycle and access                                                                                                                             |
| MCP Servers       |    12 | Registry, tests, capabilities, access, live connections                                                                                                                   |

The complete generated tool catalog and route matrix lives in
[ENDPOINTS.md](./ENDPOINTS.md). `npm run verify:readme-tools` checks the source,
README, endpoint catalog, domain counts, and Enterprise-gated inventory together.

## Next unreleased version

- 0.16.9 is the published release. Work for the next version lands on
  `dev/0.16` and is recorded under the CHANGELOG's Unreleased section.
- Carried over from 0.16.6 and already shipped: dependency updates (#207), the
  fail-closed security test module-loading fix (#226), and the prompt promotion
  fix that preserves `ai_model_id` and `finetune_id` (#227).

## Completed 2026-11-27 (0.16.9)

- Published 0.16.9: annotated tag `v0.16.9` at
  `4b1d4a66223587818c298a45b4f053c16fccc102` (`main`, promotion #251, merged
  after the reconcile PR #252 and CodeQL on the PR ref showed no high or error
  alerts and two non-author approvals), GitHub Release marked Latest, npm with
  SLSA provenance and dist-tag `latest`, and the MCP Registry entry at 0.16.9
  (`isLatest`). Release workflow 46039828125 succeeded.
- 0.16.9 adds `next_usage_reset_at` to key and provider reads, SageMaker in the
  integration `configurations` description, and a fetch-level `configurations`
  test (#249, release prep #250).
- LobeHub was updated to 0.16.9 (195 tools). The Vercel production deploy
  serves `4b1d4a66`.
- Docker catalog #5026 now pins `4b1d4a66` (fork commit `57cee3fe`). Upstream
  review and catalog publication remain pending.
- Glama synced to `4b1d4a6` on 2026-11-27 at 12:31, Build & Release ran build
  test `01a21e10-c6ac-7b4b-98f4-8ecf1646ce8d`, and Glama now lists 0.16.9. A
  stray 1.0.13 also appeared from the default version on Build & Release, the
  same quirk as 1.0.12. See `docs/DISTRIBUTION.md`.

## Completed 2026-11-27 (0.16.8)

- Published 0.16.8: annotated tag `v0.16.8` at
  `622f83705ae560dfece48370733244dfac19f8e4` (`main`, promotion #247, merged
  after CodeQL on the PR ref showed no high or error alerts and two non-author
  approvals), GitHub Release marked Latest, npm with SLSA provenance and
  dist-tag `latest`, and the MCP Registry entry at 0.16.8 (`isLatest`). Release
  workflow 46031047685 succeeded.
- 0.16.8 adds key and provider usage-limit reset options (`usage_limit_type`,
  `periodic_reset`, `periodic_reset_days`), the integration `configurations`
  passthrough, and `update_config` merging the strategy field by field (#245,
  #246).
- LobeHub was updated to 0.16.8 (195 tools). The Vercel production deploy
  serves `622f8370`.
- Docker catalog #5026 now pins `622f8370` (fork commit `e800b9f0`). Upstream
  review and catalog publication remain pending.
- Glama synced to `622f837` on 2026-11-27 at 11:28, the build test
  `01a21dd6-6e45-73f2-a30d-d2b29133e5f4` succeeded, and Auto-Release published
  0.16.8 at 11:29. See `docs/DISTRIBUTION.md`.

## Completed 2026-11-26 (0.16.7)

- Published 0.16.7: annotated tag `v0.16.7` at
  `55d1615cb658c625a816729f02053cd3084103b9` (`main`, promotion #243), GitHub
  Release marked Latest, npm with SLSA provenance and dist-tag `latest`, and
  the MCP Registry entry at 0.16.7 (`isLatest`). Release workflow 45896044262
  succeeded.
- LobeHub was updated to 0.16.7 (195 tools). The Vercel production deploy
  serves `55d1615c`.
- Docker catalog #5026 now pins `55d1615c` (fork commit `8f6728ea`). Upstream
  review and catalog publication remain pending.
- Glama synced to `55d1615` and published 0.16.7 on 2026-11-27 after a passing build
  test. See `docs/DISTRIBUTION.md`.

## Completed 2026-11-23 (0.16.6)

- Published 0.16.6: tag `v0.16.6` at `f27306a08e2cce1c2dcae90184e62018222bad60`
  (`main`, promotion #231), GitHub Release marked Latest, npm with SLSA
  provenance and dist-tag `latest`, and the MCP Registry entry at 0.16.6.
  Release workflow 45266358015 succeeded.
- LobeHub was updated to 0.16.6.
- Glama synced to `f27306a`, test build `01a20a47-1dc0-77f5-b212-b043e1224733`
  passed, and Auto-Release published 0.16.6 on 2026-11-23.
- Docker catalog #5026 now pins `f27306a0` (fork commit `82c37097`); a local
  image build of v0.16.6 listed 194 tools. Upstream review and catalog
  publication remain pending. See `docs/DISTRIBUTION.md`.

## Completed 2026-11-18 (0.16.5)

- Published 0.16.5: tag `v0.16.5` at `09f9d05e3bf409497709355fda49c259b86b0327`
  (`main`, promotion #220), GitHub Release marked Latest, npm with SLSA
  provenance, and the MCP Registry entry marked latest. Release workflow
  44414517043 succeeded and the Vercel Production deploy succeeded.
- LobeHub was updated to 0.16.5 (market API: 194 tools).
- Glama synced to `09f9d05` and Auto-Release published 0.16.5 on 2026-11-19.
- Docker catalog #5026 now pins the 0.16.5 release commit; upstream review
  and catalog publication remain pending. See `docs/DISTRIBUTION.md`.

## Completed 2026-11-14 (0.16.4)

- Revalidated Portkey OpenAPI commit `57ddb9ac` (November 10) and backend 1.31.0.
  MCP integration and server tools now support tag fields and list filters.
- Added config `auto_caching` and API-key `last_rotated_at` output.
- Corrected the descriptions of ignored config paging inputs and fixed the
  website's small-screen WebKit table-of-contents menu.
- Patched Hono and its Node adapter to resolve seven dependency alerts, and
  refreshed dependencies with versions older than seven days. Both npm audits
  report zero vulnerabilities.
- Verified 652 server tests, 28 website tests, and 194-tool discovery over both
  container transports. Live read-only smoke: 39 passed, 0 failed, 30 expected
  skips.

## Planned

OCR Python snippets and API-key curl path corrections require no runtime change.
MCP request timeouts already pass through `configurations.request_timeout`;
new organisation API-key scopes are accepted as strings.

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
No maintainer Prisma AIRS tenant is available, and acquiring paid access is
outside this project's maintenance plan. Palo Alto Networks advertises a
[contact-based free trial](https://www.paloaltonetworks.com/blog/network-security/enterprise-grade-ai-security-prisma-airs-and-truefoundry-ai-gateway/),
but free AI Gateway management access has not been verified. A contributor with
an appropriately scoped tenant can supply live contract evidence.

### Later

## Completed 2026-11-02 (0.16.3)

- Added the Star History chart, moved coverage reporting to Codecov and made the smoke suite skip `ping` on upstream 502, 503 and 504.
- Patched runtime dependencies (`redis`, `express-rate-limit`, `jose`) and the website's fumadocs and React versions.

## Completed 2026-11-01 (0.16.2)

- `list_collections` sends the first page when only a page size is given.
- Documented that Portkey ignores paging on `GET /configs`.
- Added security.txt to the site and fixed the docs layout for pages without headings.

## Completed 2026-10-30 (0.16.0)

- Added Node 26 CI coverage and the Node 26 runtime image while retaining Node 24
  as the supported floor and the npm build runtime.
- Refused dot path segments before sending Portkey requests, preserving domain
  restrictions, and separated coverage execution from the OIDC upload job.
- Published the site design, metadata, styled 404, and guide finder improvements.

## Completed 2026-10-25 (0.15.0)

- Moved to the MCP 2026-07-28 specification and the v2 TypeScript SDK in 0.15.0,
  serving modern and older clients from the same endpoint. The release retires
  the HTTP session and replay stores; `MCP_SESSION_MODE`, `MCP_SESSION_TIMEOUT`,
  and `MCP_EVENT_*` now warn and are ignored. The catalog is unchanged at 194
  tools.
- Finalized the versioned compatibility and deprecation table in
  [COMPATIBILITY.md](COMPATIBILITY.md), covering warning behavior, loss of
  sessions, GET-stream/replay and `Last-Event-ID` recovery, interrupted-mutation
  recovery, and the retained Redis rate limiter and concurrency cap.
- Added organisation-scope filters (`include_all_workspaces`,
  `exclude_workspace_slugs`) to the analytics tools.

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
  refreshed to the 0.16.9 release commit `4b1d4a66` (fork commit `57cee3fe`,
  2026-11-27). Upstream maintainer review and catalog publication remain
  pending.
- Awesome MCP Servers: [#13074](https://github.com/punkpeye/awesome-mcp-servers/pull/13074)
  merged on 2026-09-13.
- Glama: 0.16.9 was published on 2026-11-27 after a passing build test (plus a
  stray 1.0.13 from Build & Release's default version). Generated descriptions and quality-score evaluation can lag
  the inventory. See the dated publication record in `docs/DISTRIBUTION.md`.
- Recheck PulseMCP after listing changes reopen. Its legacy record still uses the
  pre-organization namespace and is not currently editable.
- Claim or refresh the stale mcp.so record when its owner workflow is available.
  Treat FindMCP and Enterprise DNA as downstream mirrors unless they publish a
  supported correction path.
- Smithery is directory-only; there is no API, CLI or account publication
  workflow. See `docs/DISTRIBUTION.md`.

## Fixture evidence boundary

Most committed fixtures are live captures. Rate-limit, usage-limit, and MCP
integration list fixtures were refreshed live on 2026-08-27. API-key rotation,
Secret References, analytics additions, usage-limit entities, and deployments
remain documentation-derived for the explicit scope or route outcomes recorded in
`tests/fixtures/manifest.json`.

The live read-only smoke run also confirms unavailable operations through explicit
HTTP 401 or 403 permission responses for the configured credential. Those scope
outcomes are skips; every unexpected response remains a failure.
