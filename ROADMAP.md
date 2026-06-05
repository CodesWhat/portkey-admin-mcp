# Portkey Admin MCP — API Coverage Roadmap

> Last updated: 2026-03-23
> **Status: COMPLETE** — 150 tools covering ~98% of Portkey admin API surface
> **Maintenance mode (2026-06):** No further API-coverage work is planned following the Palo Alto Networks acquisition of Portkey. Security and dependency patches only. See [README](./README.md) and [docs/audit-2026-06.md](./docs/audit-2026-06.md).
> Completed: MCP Integrations (10), MCP Servers (10), Analytics (11), Prompt Versions (2), Usage Limit Entities (2)
> Skipped: Secret References (not a standard admin CRUD endpoint — requires config/provider headers)

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
- `src/services/secrets.service.ts` — service + types
- `src/tools/secrets.tools.ts` — tool registrations

**Tests:**
- [ ] Contract test with recorded fixture
- [ ] E2E: create → get → update → list → delete round-trip
- [ ] Add tool names to `mcp-e2e.test.ts` tool registry check

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

- [ ] Run full `mcp-e2e.test.ts` with all new tools registered
- [ ] Run `contract.test.ts` with all new fixtures
- [ ] Run `unit.test.ts` for any new remap logic

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

**Actual scope (completed 2026-03-23):**
| Phase | New tools | Status |
|-------|-----------|--------|
| 1A (Secret References) | 0 | Skipped — not a standard admin CRUD endpoint |
| 1B (MCP Integrations) | 10 | Done |
| 1C (MCP Servers) | 10 | Done |
| 2A (Analytics Graphs) | 8 | Done |
| 2B (Analytics Groups) | 3 | Done |
| 3A (Prompt Versions) | 2 | Done |
| 3B (Usage Limit Entities) | 2 | Done |
| **Total** | **35** | |

Final tool count: **150 tools** (115 baseline + 35 new)
