# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/compare/v0.1.0-beta.4...v0.1.0
[0.1.0-beta.4]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/compare/v0.1.0-beta.3...v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/releases/tag/v0.1.0-beta.3
