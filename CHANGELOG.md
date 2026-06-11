# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/CodesWhat/portkey-admin-mcp/compare/v0.3.7...HEAD
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
