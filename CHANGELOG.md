# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **MCP Integrations** (10 tools) — Full CRUD + metadata, capabilities, workspace access management for Portkey MCP integrations
- **MCP Servers** (10 tools) — Full CRUD + connectivity testing, capabilities, user access management for MCP servers
- **Analytics: 8 new graph endpoints** — error stacks, error status codes, user requests, rescued requests, feedback (4 variants)
- **Analytics: 3 group endpoints** — analytics grouped by user, model, or metadata key with pagination
- **Prompt version management** (2 tools) — `get_prompt_version` and `update_prompt_version` for individual version operations (e.g., assigning labels)
- **Usage limit entities** (2 tools) — `list_usage_limit_entities` and `reset_usage_limit_entity` for entity-level usage tracking
- **API key `expires_at` in update** — `update_api_key` now supports setting or clearing expiration dates

### Fixed

- **Prompt `update_prompt` returns 400 when `string` field included** — Portkey PUT `/prompts/:id` expects `prompt_template`, not `string`. Service now remaps `string` → `prompt_template` before sending to API.
- **Partial `update_prompt_partial` silently drops `description`** — Portkey PUT `/prompts/partials/:id` expects `version_description`, not `description`. Service now remaps before sending.
- **`list_prompt_partials` crashes with `.map is not a function`** — API returns `{ object, total, data }` wrapper, not a plain array. Service now unwraps the response.
- **`list_partial_versions` crashes with `.map is not a function`** — Same wrapped response issue, same fix.
- **`list_prompt_versions` crashes with `.map is not a function`** — Same wrapped response issue, same fix.
- **Guardrails `onFail` type mismatch** — TypeScript interface used `onFail` but Zod schema and API use `on_fail_action`. Aligned the interface.
- **Prompt tool descriptions unclear about multi-message format** — Rewrote `create_prompt` and `update_prompt` descriptions to prominently document the JSON-encoded messages array format.

### Changed

- Tool count: 116 → 151
- Updated README with new tool sections and counts
- Updated E2E test expected tool registry (151 tools)
- Updated contract test for `ListPromptVersionsResponse` wrapped format
