# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.2] - 2026-08-04

Maintenance and dependency-security patch. No Portkey Admin API or MCP tool-surface changes; the 156-tool inventory is unchanged.

### Security

- Upgrade transitive `ip-address` to 10.4.0, closing two medium advisories reached through `express-rate-limit`. A CIDR suffix on a parsed address suppressed special-use classification, and IPv4-mapped and NAT64 IPv6 addresses were misclassified; both allowed SSRF and trust-boundary checks to be bypassed. GitHub Dependabot reports no remaining alerts.

### Changed

- Update non-major npm dependencies: `@biomejs/biome` 2.5.6, `express-rate-limit` 8.6.1, `jose` 6.2.7, `knip` 6.29.0, and `redis` 6.2.0.
- Move the CI Redis service image to `redis:8.8-alpine`.
- Bump the pinned `packageManager` to `npm@12.0.2`. This is a build-tooling pin only and does not affect the published package; npm 12 requires Node `^22.22.2 || ^24.15.0 || >=26`, which the Node 24 toolchain used in CI and the Docker image already satisfies.

### Removed

- Drop the unused `BaseService` and `validateUrl` re-exports from the services barrel. Neither was ever imported through it, and knip 6.29 flags them. Both remain exported from `src/services/base.service.ts`, where every consumer already imports them.

## [0.6.1] - 2026-07-28

Maintenance and dependency-security patch. No Portkey Admin API or MCP tool-surface changes; the 156-tool inventory is unchanged.

### Security

- Upgrade `@modelcontextprotocol/sdk` to 1.30.0, allowing the patched `@hono/node-server` 2.0.12 and closing the Windows encoded-backslash path-traversal advisory (GHSA-frvp-7c67-39w9).
- Upgrade transitive `fast-uri` to 3.1.4, closing the host-confusion advisory (GHSA-v2hh-gcrm-f6hx). GitHub Dependabot and `npm audit` report no remaining vulnerabilities.

### Fixed

- Resolve the verified npm tarball artifact to an absolute path before publishing, preventing npm from misinterpreting the relative tarball path as a GitHub repository shorthand.

### Changed

- Update non-major npm dependencies and pinned GitHub Actions, including `actions/setup-node` 7.0.0 and `actions/checkout` 7.0.1.

## [0.6.0] - 2026-07-20

Security-hardening release. Remediates all eight findings (two high, four medium, two low) from the 2026-07-20 best-practices review; each fix ships with regression tests or configuration assertions. See [security_best_practices_report.md](./security_best_practices_report.md) for the full evidence and verification log. No Portkey Admin API tool surface changes — the 156-tool inventory is unchanged.

**Several changes are breaking for HTTP/hosted deployments and require operator action:**

- Production Redis (`MCP_EVENT_STORE=redis` / `RATE_LIMIT_STORE=redis`) now requires a `rediss://` URL on non-loopback hosts.
- Redis replay now requires `MCP_EVENT_ENCRYPTION_KEY` (base64 32-byte AES key; generate with `openssl rand -base64 32`).
- Clerk mode now requires at least one authorization policy (`CLERK_ALLOWED_SUBJECTS`, `CLERK_ALLOWED_ORGANIZATION_IDS`, `CLERK_ALLOWED_ROLES`, or `CLERK_REQUIRED_PERMISSIONS`); a valid JWT alone is no longer sufficient.
- Production HTTP must choose a rate-limit topology explicitly: `RATE_LIMIT_STORE=redis`, or `RATE_LIMIT_SINGLE_PROCESS=true` for a single long-lived process.
- Outbound Portkey calls are HTTPS-only by default; a plaintext self-hosted gateway now needs `PORTKEY_ALLOW_INSECURE_HTTP=true` in addition to `PORTKEY_ALLOW_PRIVATE_BASE_URL`.
- `MCP_EVENT_TTL_SECONDS` default drops from `3600` to `300`.

### Security

- **SEC-001 (High):** `PORTKEY_TOOL_DOMAINS`/`MCP_TOOL_DOMAINS` is now a hard server-side allowlist. The HTTP `?tools=` query can only narrow it; a requested domain outside the configured set is rejected instead of silently overriding it, closing an authorization bypass where a caller could re-enable excluded key/user/secret mutation tools.
- **SEC-002 (High):** Clerk mode now authorizes the verified subject rather than granting the shared `PORTKEY_API_KEY` to any valid token. It requires at least one explicit subject/organization/role/permission policy, evaluates every configured constraint, and attaches a normalized principal to the request. **Breaking:** existing Clerk deployments must add a policy.
- **SEC-003 (Medium):** Sessions, in-memory and Redis replay events, per-stream leases, and replay cursors are bound to an opaque principal digest and equality-checked on every POST/GET/DELETE/replay. Raw session and event IDs are no longer logged; logs use capability fingerprints.
- **SEC-004 (Medium):** Credentialed Portkey requests use `redirect: "manual"` so `x-portkey-api-key` can never follow a redirect to another origin, and default to HTTPS. **Breaking:** plaintext private gateways require the new `PORTKEY_ALLOW_INSECURE_HTTP=true` opt-in alongside `PORTKEY_ALLOW_PRIVATE_BASE_URL`.
- **SEC-005 (Medium):** Redis replay payloads are encrypted with AES-256-GCM using `MCP_EVENT_ENCRYPTION_KEY`, non-loopback production Redis requires `rediss://`, events carry an enforced owner, and default retention drops to 300 seconds. **Breaking:** `redis://` in production and a missing encryption key are now rejected.
- **SEC-006 (Medium):** Renovate enforces a repository-wide seven-day minimum release age and no longer automerges lockfile maintenance or devDependency updates. The release pipeline packages the tarball in a non-OIDC job and publishes only that verified artifact.
- **SEC-007 (Low):** Added a distributed rate limiter — an atomic pre-authentication bucket keyed by normalized trusted IP and a post-authentication bucket keyed by principal plus IP, both Redis-backed and IPv6-subnet-normalized. **Breaking:** production must set `RATE_LIMIT_STORE=redis` or `RATE_LIMIT_SINGLE_PROCESS=true`; the process-local limiter remains only as defense in depth.
- **SEC-008 (Low):** The runtime container removes npm, npx, and npm's global module tree after installing production dependencies, dropping the bundled `tar`/`undici` advisories from the image.

### Added

- `PORTKEY_ALLOW_INSECURE_HTTP`, `MCP_EVENT_ENCRYPTION_KEY`, `RATE_LIMIT_STORE`, `RATE_LIMIT_SINGLE_PROCESS`, `RATE_LIMIT_REDIS_URL`, `RATE_LIMIT_REDIS_KEY_PREFIX`, and the Clerk authorization variables (`CLERK_ALLOWED_SUBJECTS`, `CLERK_ALLOWED_ORGANIZATION_IDS`, `CLERK_ALLOWED_ROLES`, `CLERK_REQUIRED_PERMISSIONS`) — documented in the README env-var table, `.env.example`, and `docs/VERCEL_DEPLOYMENT.md`.
- `express-rate-limit` (8.x) promoted to a direct dependency for the defense-in-depth Express limiter.
- `security_best_practices_report.md` — the full remediation report with per-finding evidence, mitigations, and the verification matrix (npm audit, Trivy, Gitleaks, Semgrep, Zizmor, Actionlint, live Redis integration).

### Changed

- `MCP_EVENT_TTL_SECONDS` default `3600` → `300`, shortening the window in which replay data lives at rest.
- `RATE_LIMIT_MAX_BUCKETS` now applies only in explicit memory mode.
- The Vercel guide, `.env.example`, and Dockerfile document the required `rediss://`, replay encryption key, and explicit rate-limit topology for production.

## [0.5.0] - 2026-07-14

### Added

- Type-check the test suite in local and hosted CI, align Node type definitions with the Node 24 runtime, and pin the expected npm version through `packageManager`.
- Add stateless `GET /mcp` redelivery from `Last-Event-ID`, including detached completion when a client disconnects before an in-flight POST result is ready.
- Add `rotate_api_key` and five Secret Reference CRUD tools, plus documented-response fixtures, contracts, and a safe disposable live-fixture recorder.

### Changed

- Upgrade to node-redis 6.1 and TypeScript 7.0 while preserving the Redis event store's RESP2, timeout, and keepalive behavior.
- Keep the stateless event store opt-in (`off` by default); `memory` enables single-instance replay and `redis` enables cross-instance replay.
- Require integer `current_page` and `page_size` values across all paginated tools.

### Security

- Pin the MCP Registry publisher to v1.7.9 and verify its official SHA-256 checksum before executing it in the OIDC-enabled release job.
- Harden unauthenticated loopback Host validation for IPv4 and bracketed IPv6, including rejection of malformed IPv6 authority suffixes.
- Use opaque replay cursors and per-stream memory/Redis leases so cursors cannot be guessed and concurrent replay connections cannot duplicate delivery.

### Fixed

- Run release CI and registry publishing against the requested tag during manual/automatic dispatches instead of implicitly checking out `main`.
- Normalize trailing slashes in `PORTKEY_BASE_URL`, strictly validate integer environment settings, and apply the configured graceful-shutdown timeout consistently.
- Accept post-initialization MCP requests without a protocol header by using negotiated/backwards-compatible behavior, while continuing to reject unsupported or mismatched versions.
- Return controlled JSON for malformed request bodies instead of Express's default HTML error response.
- Restore the missing 0.4.1 changelog boundary and clearly label the June audit and completed roadmap as historical snapshots.

## [0.4.2] - 2026-07-02

### Fixed

- `migrate_prompt`'s 0.4.1 description enumerated only two of the three `action` return values; the common re-run case returns `unchanged` (prompt found, content identical, no new version created). The description now covers all three outcomes plus the `message` field.
- The LobeHub manifest generator inherited the caller's environment, so a stray `PORTKEY_TOOL_DOMAINS`/`MCP_TOOL_DOMAINS` export made it silently write a truncated manifest (reproduced: 34 of 150 tools). It now strips both variables, refuses to write fewer tools than the manifest already has, and carries each tool's `annotations` through to the manifest (previously dropped).
- Pin the actionlint bootstrap script in CI to a commit SHA — the tag-based raw URL was the one remaining mutable reference in the hardened workflows.
- Correct two claims in the 0.4.1 changelog entry (mirrored to its GitHub Release): the six tools carry the first *hand-authored* annotations, not the first annotations, and the manifest drift was 29 tool entries, not 34.

## [0.4.1] - 2026-07-02

### Changed

- Rewrite the six lowest-scoring tool descriptions (Glama TDQS): `update_config`, `update_integration`, `create_integration`, `update_mcp_integration_capabilities`, `update_mcp_integration_workspaces`, and `migrate_prompt` now disclose side effects and reversibility, name sibling tools and where to source parameter values, and enumerate return fields. These six are also the first tools to carry explicit hand-authored MCP annotations (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`), overriding the operation-type-inferred annotations every tool has carried since 0.2.0.

### Fixed

- The LobeHub manifest (`lhm.plugin.json`) had drifted from the server: 29 tool entries were out of date — the six rewritten descriptions plus 0.4.0's pagination schema changes, including a `list_guardrails` schema still advertising a `page_size` maximum of 1000 that the server rejects at 100. The tools array is regenerated from the live server over MCP `tools/list` (new `scripts/generate-lobehub-tools.mjs`, wired into `publish:lobehub` so it can't drift again), which also picks up the Enterprise-gating notes the server appends at registration.
- `glama.json` maintainers listed the GitHub org instead of a username, which Glama's claim flow can't match; restored `scttbnsn` so the org-hosted server page can be claimed.

## [0.4.0] - 2026-07-02

Maintenance release: dependency security patches, a Docker base-image CVE fix, and CI/repo hardening. Two breaking changes: the minimum Node.js version rises to 24, and `page_size` caps tighten on three list tools (callers passing values above 100 are now rejected at input validation). No other Portkey Admin API surface changes.

### Security

- Update transitive `hono` to 4.12.27, closing five published advisories including GHSA-88fw-hqm2-52qc (CORS credential-reflection, CVSS 7.1). Bump `tsx` to 4.22.5 so its nested `esbuild` clears GHSA-g7r4-m6w7-qqqr. `npm audit`: 0 vulnerabilities.
- Bump the Docker base image from `node:24.12-alpine` to `node:24.18-alpine`, picking up the Node 24.17.0 LTS security release (CVE-2026-48618 TLS wildcard-hostname bypass, CVE-2026-48933 WebCrypto DoS).
- Add `.dockerignore` so `.env`, `.git`, and local credentials never enter the Docker build context.
- Harden CI: workflow-level least-privilege `permissions` block, the optional staging secret scoped to the single smoke step that uses it, and `actions/checkout`/`actions/setup-node` pinned to release commit SHAs (checkout moves v6 → v7).
- Harden the release pipeline to zizmor-clean: job-scoped permissions replace the workflow-level `contents: write`, checkouts stop persisting git credentials where jobs run dependency scripts, npm caching is off in the publish jobs, and the CI gate receives its one secret explicitly instead of `secrets: inherit`. CI gains an `actionlint` workflow-lint job, PR dependency review, and per-branch concurrency; CodeQL default setup is enabled on the repo.

### Added

- LobeHub marketplace support: `lhm.plugin.json` manifest, a `publish:lobehub` npm script, and a documented publish flow in `docs/RELEASE.md`; the README badge switched to the themed `mcp-full` LobeHub badge.
- Prerelease versions (any `-` tag, e.g. `0.5.0-rc.1`) now publish to the `rc` npm dist-tag instead of `latest`.

### Changed

- **Minimum Node.js version is now 24** (`engines.node: ">=24"`). Node 20 reached end of life on 2026-04-30; the build target, CI, and the Docker image already ran Node 24.
- **Breaking:** cap `page_size` at 100 on `list_workspaces` and `get_user_stats`, and align `list_guardrails` down from 1000 to 100, matching every other list tool. Requests with larger values are rejected by input validation instead of forwarded.
- Correct the `update_config` description — all routing/cache/retry fields are editable, not just name/status — and point `update_integration` at its `update_integration_models`/`update_integration_workspaces` siblings.
- Adopt the shared CodesWhat Renovate preset for dependency automation; refresh all in-range dependencies (helmet 8.2.0, jose 6.2.3, zod 4.4.3, typescript 6.0.3, biome 2.5.2 with config migration, knip 6.24.0, esbuild 0.28.1).
- README: animated 3D header icon; drop the typing-SVG banner.

### Fixed

- README's Docker HTTP example never set `MCP_TRANSPORT=http`, so as documented it silently started the stdio server instead of the HTTP server it was configuring.
- Repair `npm run test:http` (`scripts/test-mcp-http.sh`): send the required `MCP-Protocol-Version` header after initialize, default to `localhost` (default host validation rejects `127.0.0.1`), and stop false-positiving on the `error` property inside tool `outputSchema`s.

## [0.3.8] - 2026-06-18

Marketplace validation release for LobeHub and other MCP catalogs. No Portkey Admin API surface changes.

### Added

- Register a built-in `plan_portkey_admin_workflow` MCP prompt so clients and catalogs can discover an invokable prompt; the prompt validates argument lengths, embeds the workflow guide as an MCP resource, and reminds clients to treat user task text as lower-priority context.
- Register a static `portkey-admin://docs/workflow-guide` MCP resource with safe usage guidance and assistant-priority annotations for discovery-first Portkey Admin workflows.
- Add MCP e2e coverage for prompt/resource capabilities, listing, prompt rendering, resource reading, and no-key catalog inspection.

### Changed

- Allow the shared MCP service factory to initialize without `PORTKEY_API_KEY` so marketplaces can inspect server capabilities before users provide secrets. Direct `PortkeyService` construction and actual Admin API calls still require real credentials.
- GitHub Releases now use the matching `CHANGELOG.md` version section as the release body (with the auto-generated PR list appended), instead of auto-generated notes alone.

### Fixed

- Use LobeHub's lowercase `codeswhat-portkey-admin-mcp` badge slug so owner-claim scans match the marketplace page exactly.

## [0.3.7] - 2026-06-11

Security hardening, pagination params, compact tool responses, and a major test-coverage expansion from a four-domain code review. Tool-param additions are additive; no breaking API surface changes.

### Security

- Sanitize the caller-supplied `MCP-Protocol-Version` header before echoing it in HTTP error responses — truncated to 64 chars and restricted to `[A-Za-z0-9._-]`, closing an unvalidated-input reflection path.
- Remove Redis configuration details from the unauthenticated `/auth/info` response to reduce infrastructure fingerprinting.
- Send `Strict-Transport-Security` only when TLS is enabled, instead of emitting HSTS on plain-HTTP responses.
- Emit a startup warning when `ALLOWED_ORIGINS=*` is combined with `MCP_AUTH_MODE=none` — wildcard CORS with no auth gate is a dangerous misconfiguration, now surfaced at boot rather than silently permitted.
- Hash service-cache map keys with SHA-256 so plaintext API keys are never used as in-process cache identifiers.
- Route health checks through `BaseService` so they receive the same SSRF URL validation and structured error parsing as every other upstream call (previously a bespoke fetch path bypassed both).
- `create_api_key` description now warns that the key secret is returned exactly once and will appear in MCP transcripts and LLM context — store it securely immediately.

### Added

- **Pagination params on six list tools** — `list_virtual_keys`, `list_configs`, `list_all_users`, `list_user_invites`, `list_mcp_server_capabilities`, and `list_mcp_server_user_access` now accept optional `current_page`/`page_size` inputs, forwarded to the Portkey Admin API; the two MCP-server lists also surface `has_more` so truncated results are no longer indistinguishable from complete ones.
- **Cross-field validation for `create_api_key`** — the workspace key type now requires `workspace_id` at the Zod schema layer instead of failing inside the handler.
- **140 new tests** across 5 new test files: unit coverage for 13 previously untested tool modules, Clerk JWT auth mode, `DELETE /mcp` and SSE `GET /mcp` session endpoints, abort/timeout and upstream-error propagation paths, query-string and pagination edge cases, and contract schemas with live-recorded fixtures for workspaces and users. Total suite: 269 tests (253 unit/integration + 16 e2e).

### Changed

- **Compact JSON tool responses** (~157 call sites) — tool responses no longer pretty-print with 2-space indent, reducing response token usage on every tool call.
- **Lazy Redis import** — the `redis` client module now loads only when the Redis event store is actually constructed, trimming cold-start weight when the event store is `off` or `memory`.
- **`create_integration`/`update_integration` preserve empty strings** — explicitly provided empty-string values (e.g. `custom_host`) are now sent to the API instead of being silently dropped by truthiness checks.
- **`migrate_prompt`/`promote_prompt`** internal prompt lookups now request a small page instead of a full listing.
- **`PORTKEY_BASE_URL` validated once** per service container instead of once per domain service, so misconfiguration fails fast with a single clear error.
- **HTTP transport repositioned as proof of concept** — README and the Vercel guide now state there is no hosted version and stdio is the supported transport.

## [0.3.6] - 2026-06-05

Corrects the MCP Registry namespace case. No tool schema or API surface changes.

### Fixed

- Publish under `io.github.CodesWhat/portkey-admin-mcp`, matching the exact GitHub organization login case, instead of the lowercased `io.github.codeswhat` shipped in 0.3.5 — the registry's namespace authorization is case-sensitive and rejected the lowercase form with `403`. `package.json` `mcpName` and `server.json` `name` updated to match; the npm package name (`portkey-admin-mcp`) is unchanged.

## [0.3.5] - 2026-06-05

Moved the project to the **CodesWhat** organization following the `s-b-e-n-s-o-n` → `scttbnsn` GitHub handle rename, consolidating it alongside the other CodesWhat open-source projects. No tool schema or API surface changes.

### Changed

- Repo moved to `github.com/CodesWhat/portkey-admin-mcp`; MCP Registry namespace migrated from `io.github.s-b-e-n-s-o-n/portkey-admin-mcp` to `io.github.codeswhat/portkey-admin-mcp` (`server.json` `name`, `package.json` `mcpName`, repository/homepage/bugs URLs). The old handle's registry namespace can no longer be verified, so it is retired.
- The npm package name (`portkey-admin-mcp`) is unchanged — existing `npx portkey-admin-mcp` installs keep working — and the package now lives under the `codeswhat` npm org.

## [0.3.4] - 2026-06-05

Follow-up hardening release clearing the remaining low/medium items from the v0.3.3 audit (`docs/audit-2026-06.md`). No tool schema or API surface changes.

### Security

- Redact outbound request debug logs: log query-param *keys* only, never the composed URL, so identifiers in query values cannot leak into logs.
- Validate Redis event-store stream/event ids against `^[\w-]{1,128}$` before key construction, preventing key injection via a malformed `Last-Event-ID` header. Unknown/malformed ids resolve to "not found" instead of erroring.

### Changed

- Gate the release workflow on the full CI suite: `release.yml` now calls `ci.yml` (made reusable via `workflow_call`) and both the GitHub Release and MCP Registry publish jobs `need` it, so a broken tag can never ship.

### Added

- `tests/fixtures/manifest.json` records fixture provenance (`recordedAt`, source, list); `record:fixtures` now stamps it on every re-record, and the contract suite asserts it stays in sync with `tests/fixtures/responses/`.

## [0.3.3] - 2026-06-04

Maintenance and security release following the Palo Alto Networks acquisition of Portkey (completed 2026-05-29). The Portkey Admin API remains live and unchanged; this release hardens the HTTP transport, patches transitive CVEs, and marks the project as maintenance-only. No tool schema or API surface changes.

### Security

- Wire `Host`-header validation into the HTTP transport for `MCP_AUTH_MODE=none` deployments, closing a DNS-rebinding gap where the existing `isAllowedHost` check was defined but never called. Authenticated (`bearer`/`clerk`) modes are unaffected.
- Harden `PORTKEY_BASE_URL` validation against SSRF: loopback, private (RFC-1918), CGNAT, and link-local hosts (including cloud metadata `169.254.169.254`) are now rejected by default. Set `PORTKEY_ALLOW_PRIVATE_BASE_URL=true` to allow a self-hosted gateway on a private address. Internal DNS names remain allowed.
- Patch transitive advisories via lockfile refresh (`fast-uri`, `hono`, `qs`, `ip-address`/`express-rate-limit`).

### Fixed

- Return HTTP `404` (not `400`) for requests against an unknown MCP session id, per the MCP spec, so clients re-initialize correctly.
- Correct tool annotations for `run_prompt_completion` and `test_mcp_server`: these are side-effecting and no longer carry `readOnlyHint: true`.

### Changed

- The project is now in **maintenance mode** (security/dependency patches only) pending Palo Alto's post-acquisition Admin API roadmap. Added a status notice to the README and a full assessment under `docs/audit-2026-06.md`.
- Documented the previously-undocumented `PORTKEY_BASE_URL` environment variable and the new `PORTKEY_ALLOW_PRIVATE_BASE_URL` opt-out.
- Corrected the `ROADMAP.md` tool count (151 → 150, arithmetic fix) and marked the roadmap as maintenance-mode.

## [0.3.2] - 2026-04-16

Follow-up description-quality pass targeting the 13 tools that Glama's TDQS rubric left in the B-tier band. Adds a reproducible scoring harness under `docs/glama-score/` and `scripts/glama-score/` so future audits are one command. No behavior, schema, or API surface changes.

### Changed

- Tightened 13 tool descriptions to A-tier TDQS (≥3.5): `cancel_log_export`, `create_config`, `get_guardrail`, `update_guardrail`, `list_prompt_partials`, `publish_partial`, `publish_prompt`, `resend_user_invite`, `update_api_key`, `update_integration_workspaces`, `update_prompt_label`, `update_usage_limit`, `update_workspace`. Each gains one named-sibling disambiguation clause (`unlike X which Y`) plus one behavioral clause covering immediacy, scope, or immutability.
- Rubric-based scoring of all 150 current descriptions against the reverse-engineered Glama TDQS rubric puts the server at mean 3.81, 150/150 at A-tier (up from baseline mean 3.14 at v1.0.0 with 61 C-tier tools).

### Added

- `docs/glama-score/` — audit artifacts: the v1.0.0 Glama scan (`scores.json`, `scores.csv`), per-dimension justifications bucketed by score, the rewrite plan with per-tool checklist, and the post-fix re-score (`current-scores.json`, `diff.json`).
- `scripts/glama-score/` — reproducible audit tooling: `extract-current.mjs` pulls every `(name, description)` pair from `src/tools/*.tools.ts`, `score-tools.mjs` re-scores via the Anthropic Messages API with the rubric prompt-cached, and `diff-scores.mjs` emits the baseline-vs-current delta.

## [0.3.1] - 2026-04-16

Maintenance release. Description-quality pass across every MCP tool and a routine patch-level dependency refresh. No behavior, schema, or API surface changes.

### Changed

- All 150 tool descriptions rewritten to lead with returned scope (named fields/shapes), clarify workflow boundaries, and link sibling tools — total description payload shrinks ~14% while becoming more useful to LLM callers on every session start.
- `create_prompt`, `get_prompt`, and `update_prompt` retain a one-line hint pointing callers at the structured `messages` alias while documenting the legacy JSON-encoded `string` multi-message format.
- `create_api_key` ("the secret is only returned once"), `delete_api_key` ("cannot be undone"), and `insert_log` (failure mode for unmatched `request_provider`) sharpened for safety-critical wording.
- Voice/casing normalized across analytics tools (`Get X` rather than mixed `Return X`/`Returns X`) and MCP tools (lowercase `id` rather than mixed `ID`/`id`).

### Added

- Three description-quality test blocks in `tests/unit.test.ts` enforcing: workflow/scope/sibling guidance for weak tool families, A-rated/infra tool standards, and a high-risk sweep over `delete_*` / `create_api_key` / `create_virtual_key` / `run_prompt_completion` / `insert_log` requiring irreversibility, access, billable, or failure semantics in the description. Test count 101 → 102.
- Shared `before()` setup in the description-quality suite to register all tools once with a `descriptionFor()` helper, replacing per-test `registerAllTools` rebuilds.

### Dependencies

- `@biomejs/biome` 2.4.10 → 2.4.12
- `@types/node` 25.5.2 → 25.6.0
- `dotenv` 17.4.1 → 17.4.2
- `knip` 6.3.0 → 6.4.1
- `lefthook` 2.1.5 → 2.1.6
- `redis` 5.11.0 → 5.12.1
- 0 vulnerabilities; full `npm run ci` (lint + knip + typecheck + 102 unit tests + build + 16 e2e tests + readme tool verification) green.

## [0.3.0] - 2026-04-14

Tool surface refinement release. Cleans up a phantom endpoint, adds structured input aliases for LLM ergonomics, enables stdio/HTTP tool domain subsetting, and flags the 28 tools that are Enterprise-gated so clients know up front.

### Added

- **`PORTKEY_TOOL_DOMAINS`** environment variable — stdio and HTTP clients can now expose only a focused subset of tools (e.g. `prompts,analytics`) instead of all 150. Validated against `TOOL_DOMAIN_NAMES` on startup with a clear error listing valid domains. Complements the pre-existing HTTP-only `?tools=` query parameter.
- **Structured input aliases** for prompt creation/update/migration — `create_prompt`, `update_prompt`, and `migrate_prompt` now accept a first-class `messages` array (system/user/assistant with typed content blocks) alongside the legacy JSON-encoded `string`. The server serializes `messages` into the legacy format before calling Portkey, so both forms keep working.
- **Structured filter aliases** on every analytics tool — `status_codes[]`, `virtual_key_slugs[]`, `config_slugs[]`, `trace_ids[]`, `span_ids[]`, `provider_models[]`, `metadata_filter{}`, and array-aware `api_key_ids[]`. LLM callers can now pass native arrays/objects; the server normalizes to Portkey's legacy comma-separated query params.
- **Enterprise-gated annotation** on the 28 tools that require Portkey Enterprise plan scopes — 20 analytics tools, `list_audit_logs`, 3 org-level integration reads, and 4 org-level user reads now carry an `Enterprise-gated. Returns 403 on non-Enterprise Portkey plans.` suffix in their descriptions. Verified against the Portkey dashboard — these scope groups are not offered to workspace plans.
- Glama MCP server registry card badge in README and `glama.json` ownership manifest.

### Removed

- **BREAKING**: `get_trace` tool removed. Portkey's Admin API does not expose `GET /logs/{id}` — the endpoint returns `405 Method Not Allowed` for every valid-looking id and is absent from the official Portkey SDK. Single-trace retrieval is not a supported operation; use `create_log_export` with a `trace_id` filter to export the data you need. This drops tool count from 151 → 150.

### Changed

- All destructive-op descriptions (`delete_*`, `remove_*`, `reset_*`) tightened for Glama TDQS scoring — each now documents cascade effects and a safety/audit step, matching the pattern of the already-strong `delete_virtual_key` / `delete_api_key` descriptions. Bumps min-TDQS on destructive tools and lifts the overall description quality score.
- All 150 tool descriptions pass through a quality review for the Glama TDQS rubric — purpose clarity, usage guidelines, behavioral transparency, parameter semantics.
- `src/services/tracing.service.ts` no longer exports `Trace`, `TraceSpan`, or `GetTraceResponse` types (removed with `get_trace`).
- README `API Key Scopes` section rewritten to call out Enterprise gating explicitly, list every affected tool, and note that workspace service keys with Select All cover the non-Enterprise surface.
- SECURITY.md advisory URL updated to the personal-repo location.

### Fixed

- `get_trace` was previously documented and registered but had never worked against the real Portkey API. Removing it eliminates a silent failure path for LLM clients that would otherwise hit a 405.

## [0.2.0] - 2026-04-08

Major hardening release. Fixes critical MCP spec compliance issues, adds tool annotations and structured responses, and significantly improves security defaults.

### Added

- **MCP tool annotations** on all 151 tools — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` inferred from tool operation type
- **`outputSchema`** on all tools via `registerTool()` — consistent `{ok, data}` / `{ok, error}` envelope for predictable LLM parsing
- **Server instructions** — LLM guidance for tool selection ("Use list_\* tools for discovery…")
- **`MCP-Protocol-Version` header validation** — rejects post-init requests missing or mismatching the negotiated protocol version (spec 2025-06-18)
- **Per-request stateless MCP servers** — each stateless request creates a fresh `McpServer` + transport, preventing cross-client data leaks (GHSA-345p-7cg4-v4c7)
- **Dynamic tool loading** via `?tools=prompts,analytics` query parameter — register only relevant tool domains per session to reduce token bloat
- **Session capacity management** — `MCP_MAX_SESSIONS` config (default 100) with `tryReserve()`/`releaseReservation()` to prevent overcommit during concurrent initializations
- **`MCP_PUBLIC_BASE_URL`** — explicit public URL for `/auth/info` and status page, avoiding Host header trust
- **`MCP_ALLOW_UNAUTHENTICATED_HTTP`** — explicit opt-in for unauthenticated HTTP debugging (auth enforcement blocks `MCP_AUTH_MODE=none` by default)
- **`RATE_LIMIT_MAX_BUCKETS`** — caps in-memory rate-limit buckets (default 10,000) with overflow sharing to bound memory
- **Helmet** middleware for automatic HTTP security headers (CSP, HSTS, X-Content-Type-Options, etc.)
- **Curated tool responses** — list results include pagination metadata (`total`, `has_more`, `next_offset`), analytics include `point_count`, prompt versions formatted compactly
- **Global tool error wrapper** — unhandled exceptions in tool callbacks return `isError: true` instead of crashing the MCP protocol
- **HTTP server integration tests** — protocol version, session capacity, tool domain filtering, HSTS, auth rejection
- **108 tests total** (93 unit + 15 E2E), up from ~40

### Fixed

- **`z.union()` in `ToolChoiceSchema` silently produced empty schema** — replaced with flat `z.object()` + discriminator field (SDK bug #1643)
- **Bearer token timing-safe comparison leaked token length** — now compares fixed-length SHA-256 digests
- **Rate limiter used raw `X-Forwarded-For` instead of `req.ip`** — trivially spoofable; now respects Express `trust proxy` setting
- **`ALLOWED_ORIGINS` re-parsed on every request** — now cached at module load
- **Default HTTP bind address was `0.0.0.0`** — changed to `127.0.0.1` to prevent accidental network exposure
- **Config JSON responses returned raw strings** — `getConfig()` and `updateConfig()` now parse `config` field into typed objects
- **`getPromptVersion()` returned `Record<string, unknown>`** — now typed as `RawGetPromptResponse`
- **CI badge pointed to wrong GitHub org** (SYPartners → scttbnsn)
- **Hardcoded `app`/`env` enums in prompt tools** — replaced with `z.string()` to allow arbitrary identifiers

### Changed

- **Default HTTP host**: `0.0.0.0` → `127.0.0.1` (set `MCP_HOST=0.0.0.0` explicitly for Docker/reverse proxy)
- **Service facade**: `PortkeyService` no longer delegates 400+ methods — domain services are now public readonly properties (`service.users`, `service.analytics`, etc.)
- **`BaseService`**: consolidated 4 HTTP methods into single `executeRequest()` with shared logging/error handling
- **HTTP app architecture**: extracted from `server.ts` into `lib/http-app.ts` for testability and reuse (Vercel, standalone, tests)
- **`InMemoryEventStore`**: throttled cleanup (every 30s instead of every write), per-event expiry checks, proper stream-index removal
- **`RedisEventStore`**: batched replay reads into single pipeline
- **Analytics tool responses**: shared formatting helpers hoisted to module level, all responses include `point_count`
- All dependencies updated to latest (zod v4, express v5, MCP SDK v1.29+)
- Removed dependabot config (replaced with manual dep management)
- Added lefthook for pre-commit lint and pre-push checks
- Added knip for unused code detection

## [0.1.0] - 2026-03-28

First stable release. Graduates from beta with 151 tools covering ~98% of the Portkey Admin API surface.

### Added

- **MCP Integrations** (10 tools) — Full CRUD + metadata, capabilities, workspace access management for Portkey MCP integrations
- **MCP Servers** (10 tools) — Full CRUD + connectivity testing, capabilities, user access management for MCP servers
- **Analytics: 8 new graph endpoints** — error stacks, error status codes, user requests, rescued requests, feedback (4 variants)
- **Analytics: 3 group endpoints** — analytics grouped by user, model, or metadata key with pagination
- **Prompt version management** (2 tools) — `get_prompt_version` and `update_prompt_version` for individual version operations (e.g., assigning labels)
- **Usage limit entities** (2 tools) — `list_usage_limit_entities` and `reset_usage_limit_entity` for entity-level usage tracking
- **API key `expires_at` in update** — `update_api_key` now supports setting or clearing expiration dates
- `.github/CODEOWNERS` for default code ownership
- `.github/dependabot.yml` for automated weekly dependency updates (npm + GitHub Actions)
- Contract test for `GetPromptResponseSchema` with omitted `versions` field

### Fixed

- **7 CVEs patched** — undici, hono, path-to-regexp, express-rate-limit, @hono/node-server, ajv, qs (5 high, 1 moderate, 1 low)
- **`GetPromptResponseSchema.versions` too strict** — now optional with `[]` default, matching runtime API behavior
- **`create_mcp_integration` silent failure** — now returns `isError` when `auth_type=headers` without `custom_headers`
- **`update_prompt_version` allows no-op** — now rejects calls with undefined `label_id` (must pass explicit value or `null`)
- **Prompt `update_prompt` returns 400 when `string` field included** — Service now remaps `string` → `prompt_template` before sending to API
- **Partial `update_prompt_partial` silently drops `description`** — Service now remaps `description` → `version_description`
- **`list_prompt_partials` crashes with `.map is not a function`** — API returns wrapped response, service now unwraps
- **`list_partial_versions`, `list_prompt_versions`** — Same wrapped response fix
- **Guardrails `onFail` type mismatch** — Aligned TypeScript interface with Zod schema (`on_fail_action`)
- Sanitized real org/workspace/user UUIDs in test fixtures with synthetic values
- Deleted unused `virtual-keys-get.json` test fixture

### Changed

- Tool count: 116 → 151
- ENDPOINTS.md totals updated from 140+/107+ to 151/131
- Prompt tool descriptions clarified for multi-message JSON array format

## [0.1.0-beta.4] - 2026-03-28

### Changed

- Pointed package URLs to personal repo for npm publishing
- README badge centering and footer improvements

## [0.1.0-beta.3] - 2026-03-02

### Added

- Initial public release with 116 tools
- Stdio and HTTP transports
- Clerk JWT and bearer token authentication
- Redis event store for stateless mode
- Vercel deployment support
- Contract tests, E2E tests, security tests

[Unreleased]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.6.2...HEAD
[0.6.2]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.8...v0.4.0
[0.3.8]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.1.0-beta.4...v0.1.0
[0.1.0-beta.4]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.1.0-beta.3...v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/CodesWhat/portkey-admin-mcp/releases/tag/v0.1.0-beta.3
