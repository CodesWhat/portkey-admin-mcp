# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **CI badge pointed to wrong GitHub org** (SYPartners → s-b-e-n-s-o-n)
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

[Unreleased]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/compare/v0.1.0-beta.4...v0.1.0
[0.1.0-beta.4]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/compare/v0.1.0-beta.3...v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/releases/tag/v0.1.0-beta.3
