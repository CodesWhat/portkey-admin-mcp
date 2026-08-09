# Portkey Admin MCP — API Coverage Roadmap

> Last reviewed: 2026-08-09
> **Status: ACTIVE** — 171 tools, with compatibility and API-coverage development resumed against Portkey's current official OpenAPI and changelog
> **The 2026-06 maintenance decision is superseded.** Portkey continued publishing control-plane API additions after the Palo Alto Networks acquisition, so new documented surfaces are back in scope. Prisma AIRS itself remains a separate interoperability track; see [the guide](./docs/PRISMA_AIRS_INTEROPERABILITY.md).
> Completed: MCP Integrations (10), MCP Servers (12), Analytics (11), Prompt Versions (2), Usage Limit Entities (2)
> Added 2026-07-14: Secret References became an officially documented Admin API CRUD surface.
> Added 2026-08-09: organisation guardrail defaults/exclusions, single-log reads, export restrictions, SCIM group mappings, MCP server connections, public model pricing, and current integration schemas.
> The unchecked tasks in Phases 1–4 preserve the original implementation plan; Phase 5 is the current compatibility track.

---

## Phase 5: Current Portkey compatibility (August 2026)

### 5A — Organisation governance and logs

| Endpoint | Method | Tool Name | Status |
|---|---|---|---|
| `/admin/organisation/defaults` | GET | `get_organisation_defaults` | Done |
| `/admin/organisation/defaults` | PUT | `update_organisation_defaults` | Done |
| `/workspace-exclusions/input-guardrails` | GET/PUT | `list_input_guardrail_workspace_exclusions`, `update_input_guardrail_workspace_exclusions` | Done |
| `/workspace-exclusions/output-guardrails` | GET/PUT | `list_output_guardrail_workspace_exclusions`, `update_output_guardrail_workspace_exclusions` | Done |
| `/logs/{logId}` | GET | `get_log` | Done |
| `/logs/exports/field-restrictions` | GET | `get_log_export_field_restrictions` | Done |

### 5B — Enterprise directory and MCP connections

| Endpoint | Method | Tool Name | Status |
|---|---|---|---|
| `/scim/workspaces` | GET/POST | `list_scim_workspace_mappings`, `create_scim_workspace_mapping` | Done |
| `/scim/workspaces/{mappingId}` | DELETE | `delete_scim_workspace_mapping` | Done |
| `/scim/groups` | GET | `list_scim_groups` | Done |
| `/mcp-servers/{id}/connections` | GET/DELETE | `list_mcp_server_connections`, `disconnect_mcp_server_connection` | Done |

### 5C — Pricing and schema parity

- [x] Public `/model-configs/pricing/{provider}/{model}` lookup via `get_model_pricing`, using the unauthenticated non-`/v1` catalog base.
- [x] Integration Secret Reference mappings and pricing adjustments.
- [x] Custom/fine-tuned model configuration, custom headers, static pricing, and `allow_all_models`.
- [x] Global/per-workspace access overrides and default-provider creation controls.
- [x] MCP integration Secret Reference mappings.
- [x] Compatibility normalization for current `models` and `workspaces` list response keys.
- [ ] Continue monitoring the official Portkey OpenAPI/changelog for additive control-plane surfaces.
- [ ] Add a native Prisma AIRS adapter only when Palo Alto Networks publishes a stable AI Gateway management API.

---

## Phase 1: New Resource Groups

### 1A — Secret References (5 endpoints)

Full CRUD for secret reference management.

| Endpoint | Method | Tool Name |
|----------|--------|-----------|
| `/secret-references` | POST | `create_secret_reference` |
| `/secret-references` | GET | `list_secret_references` |
| `/secret-references/{id}` | GET | `get_secret_reference` |
| `/secret-references/{id}` | PUT | `update_secret_reference` |
| `/secret-references/{id}` | DELETE | `delete_secret_reference` |

**Files to create:**
- `src/services/secret-references.service.ts` — service + types
- `src/tools/secret-references.tools.ts` — tool registrations

**Tests:**
- [x] Contract tests with documented fixtures and a safe live recorder (live replacement currently blocked by credential permissions)
- [ ] E2E: create → get → update → list → delete round-trip
- [x] Add tool names to `mcp-e2e.test.ts` tool registry check

---

### 1B — MCP Integrations (10 endpoints)

CRUD + sub-resources (metadata, capabilities, workspaces). Follow the `integrations.service.ts` pattern for sub-resources.

| Endpoint | Method | Tool Name |
|----------|--------|-----------|
| `/mcp-integrations` | POST | `create_mcp_integration` |
| `/mcp-integrations` | GET | `list_mcp_integrations` |
| `/mcp-integrations/{id}` | GET | `get_mcp_integration` |
| `/mcp-integrations/{id}` | PUT | `update_mcp_integration` |
| `/mcp-integrations/{id}` | DELETE | `delete_mcp_integration` |
| `/mcp-integrations/{id}/metadata` | GET | `get_mcp_integration_metadata` |
| `/mcp-integrations/{id}/capabilities` | GET | `list_mcp_integration_capabilities` |
| `/mcp-integrations/{id}/capabilities` | PUT | `update_mcp_integration_capabilities` |
| `/mcp-integrations/{id}/workspaces` | GET | `list_mcp_integration_workspaces` |
| `/mcp-integrations/{id}/workspaces` | PUT | `update_mcp_integration_workspaces` |

**Files to create:**
- `src/services/mcp-integrations.service.ts` — service + types
- `src/tools/mcp-integrations.tools.ts` — tool registrations

**Tests:**
- [ ] Contract test with recorded fixture
- [ ] E2E: create → get → update capabilities → list workspaces → delete round-trip
- [ ] Add tool names to `mcp-e2e.test.ts` tool registry check

---

### 1C — MCP Servers (10 endpoints)

CRUD + sub-resources (test, capabilities, user-access). Similar sub-resource pattern.

| Endpoint | Method | Tool Name |
|----------|--------|-----------|
| `/mcp-servers` | POST | `create_mcp_server` |
| `/mcp-servers` | GET | `list_mcp_servers` |
| `/mcp-servers/{id}` | GET | `get_mcp_server` |
| `/mcp-servers/{id}` | PUT | `update_mcp_server` |
| `/mcp-servers/{id}` | DELETE | `delete_mcp_server` |
| `/mcp-servers/{id}/test` | POST | `test_mcp_server` |
| `/mcp-servers/{id}/capabilities` | GET | `list_mcp_server_capabilities` |
| `/mcp-servers/{id}/capabilities` | PUT | `update_mcp_server_capabilities` |
| `/mcp-servers/{id}/user-access` | GET | `list_mcp_server_user_access` |
| `/mcp-servers/{id}/user-access` | PUT | `update_mcp_server_user_access` |

**Files to create:**
- `src/services/mcp-servers.service.ts` — service + types
- `src/tools/mcp-servers.tools.ts` — tool registrations

**Tests:**
- [ ] Contract test with recorded fixture
- [ ] E2E: create → test connectivity → update capabilities → manage user access → delete
- [ ] Add tool names to `mcp-e2e.test.ts` tool registry check

---

## Phase 2: Analytics Coverage

### 2A — Additional Graph Endpoints (8 endpoints)

Extend existing `analytics.service.ts` and `analytics.tools.ts` with missing graph endpoints.

| Endpoint | Tool Name |
|----------|-----------|
| `/analytics/graphs/errors/stacks` | `get_error_stacks_analytics` |
| `/analytics/graphs/errors/status-codes` | `get_error_status_codes_analytics` |
| `/analytics/graphs/users/requests` | `get_user_requests_analytics` |
| `/analytics/graphs/requests/rescued` | `get_rescued_requests_analytics` |
| `/analytics/graphs/feedbacks` | `get_feedback_analytics` |
| `/analytics/graphs/feedbacks/ai-models` | `get_feedback_models_analytics` |
| `/analytics/graphs/feedbacks/scores` | `get_feedback_scores_analytics` |
| `/analytics/graphs/feedbacks/weighted` | `get_feedback_weighted_analytics` |

**Files to modify:**
- `src/services/analytics.service.ts` — add 8 methods
- `src/tools/analytics.tools.ts` — add 8 tool registrations

**Tests:**
- [ ] E2E: call each endpoint and verify response shape
- [ ] Add tool names to `mcp-e2e.test.ts` tool registry check

---

### 2B — Analytics Groups Endpoints (3 endpoints)

New paginated/grouped analytics endpoints. May need different query params than graph endpoints.

| Endpoint | Tool Name |
|----------|-----------|
| `/analytics/groups/users` | `get_analytics_group_users` |
| `/analytics/groups/ai-models` | `get_analytics_group_models` |
| `/analytics/groups/metadata/{key}` | `get_analytics_group_metadata` |

**Files to modify:**
- `src/services/analytics.service.ts` — add 3 methods
- `src/tools/analytics.tools.ts` — add 3 tool registrations

**Tests:**
- [ ] E2E: call each endpoint with sample params
- [ ] Add tool names to `mcp-e2e.test.ts` tool registry check

---

## Phase 3: Minor CRUD Gaps

### 3A — Prompt Version Management (2 endpoints)

Individual version get/update (e.g., assign a label to a specific version).

| Endpoint | Method | Tool Name |
|----------|--------|-----------|
| `/prompts/{id}/versions/{versionId}` | GET | `get_prompt_version` |
| `/prompts/{id}/versions/{versionId}` | PUT | `update_prompt_version` |

**Files to modify:**
- `src/services/prompts.service.ts` — add 2 methods + types
- `src/tools/prompts.tools.ts` — add 2 tool registrations

**Tests:**
- [ ] E2E: create prompt → list versions → get version → update version label → verify

---

### 3B — Usage Limit Entities (2 endpoints)

Entity-level usage tracking and reset.

| Endpoint | Method | Tool Name |
|----------|--------|-----------|
| `/policies/usage-limits/{id}/entities` | GET | `list_usage_limit_entities` |
| `/policies/usage-limits/{id}/entities/{entityId}/reset` | PUT | `reset_usage_limit_entity` |

**Files to modify:**
- `src/services/limits.service.ts` — add 2 methods + types
- `src/tools/limits.tools.ts` — add 2 tool registrations

**Tests:**
- [ ] E2E: create usage limit → list entities → reset entity → verify

---

## Phase 4: Hardening

### 4A — API Response Shape Verification

Before implementing, hit each new endpoint with a raw curl to verify response shapes. Portkey has known inconsistencies between docs and actual API behavior. Record fixtures for contract tests.

- [ ] Secret References: record list + get fixtures
- [ ] MCP Integrations: record list + get fixtures
- [ ] MCP Servers: record list + get fixtures
- [ ] Analytics groups: verify query param format differs from graphs
- [ ] Prompt versions individual: verify GET/PUT field names

### 4B — Field Name Audit

Apply the same audit methodology from this session to all new services:
- [ ] Compare create vs update field names for each new resource
- [ ] Check list response wrapping (`{ data: [...] }` vs plain array)
- [ ] Verify any metadata/description field naming between endpoints

### 4C — Full E2E Suite Run

- [x] Run full `mcp-e2e.test.ts` with all new tools registered
- [x] Run `contract.test.ts` with all new fixtures
- [x] Run unit coverage for service paths, payloads, and redaction logic

---

## Implementation Notes

**Pattern to follow for each new service:**
1. Hit the API with curl to discover actual response shapes
2. Create types from real responses (not docs — they lie)
3. Create service extending `BaseService`
4. Create tools file with Zod schemas
5. Register in `src/services/index.ts` and `src/tools/index.ts`
6. Record fixture, write contract test
7. Add to E2E tool registry
8. Audit create vs update field names

**Actual scope (updated 2026-07-14):**

| Phase | New tools | Status |
|-------|-----------|--------|
| 1A (Secret References) | 5 | Done |
| 1B (MCP Integrations) | 10 | Done |
| 1C (MCP Servers) | 10 | Done |
| 2A (Analytics Graphs) | 8 | Done |
| 2B (Analytics Groups) | 3 | Done |
| 3A (Prompt Versions) | 2 | Done |
| 3B (Usage Limit Entities) | 2 | Done |
| **Total** | **40** | |

Original roadmap count: **156 tools** (115 baseline + 40 roadmap tools + API-key rotation).

Current count: **171 tools** after the 15 Phase 5 compatibility additions.
