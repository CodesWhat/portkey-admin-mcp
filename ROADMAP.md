# Portkey Admin MCP — API Coverage Roadmap

> Last reviewed: 2026-08-11
> **Status: ACTIVE** — 171 tools, with compatibility and API-coverage development resumed against Portkey's current official OpenAPI and changelog
> **The 2026-06 maintenance decision is superseded.** Portkey continued publishing control-plane API additions after the Palo Alto Networks acquisition, so new documented surfaces are back in scope. Prisma AIRS itself remains a separate interoperability track; see [the guide](./docs/PRISMA_AIRS_INTEROPERABILITY.md).
> Completed: MCP Integrations (10), MCP Servers (12), Analytics (11), Prompt Versions (2), Usage Limit Entities (2)
> Added 2026-07-14: Secret References became an officially documented Admin API CRUD surface.
> Added 2026-08-09: organisation guardrail defaults/exclusions, single-log reads, export restrictions, SCIM group mappings, MCP server connections, public model pricing, and current integration schemas.
> The unchecked tasks in Phases 1–4 preserve the original implementation plan; Phase 5 is the current compatibility track.
> Added 2026-08-09: Phase 6 tracks code-health findings from a full-app review (security, performance, quality, testing), including the tradeoffs deliberately left in place.

This direction covers at least the next twelve months, through August 2027.
Unchecked work is prioritized by API drift, security impact, and user demand;
it is not a commitment to a specific release date.

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

## Phase 6: Code health (August 2026 full-app review)

Findings from a four-track review (security, performance, quality, testing) of the
whole application on 2026-08-09. Security came back clean; the work below is
maintainability, context cost, and test coverage.

### 6A — Tools layer

| # | Finding | Status |
|---|---|---|
| 1 | ~180 hand-rolled `{ content: [{ type: "text", text: JSON.stringify(x) }] }` envelopes with no shared helper; `normalizeToolResult` then re-parses that text to build `structuredContent` | Done — `jsonResult()` in `src/tools/utils.ts` |
| 2 | `analytics.tools.ts` had 9 tools with byte-identical bodies differing only in name/description/service method | Done — table-driven registration |
| 3 | `keys.tools.ts` inlined response mapping in both list/get pairs, unlike every sibling module's `format<Resource>()` convention | Done |
| 4 | `user_id` validated with `.uuid()` on `add_workspace_member` but bare `z.string()` on the get/update/remove siblings | Done |
| 5 | SCIM tools use 0-based `page` while all 171 other list tools use 1-based `current_page`, undocumented — LLM clients silently mis-paginate | Done — noted in parameter description |
| 6 | `TOOL_SUCCESS_DATA_SCHEMAS` covers 6 of 171 tools with no stated rollout intent; reads like an abandoned migration | Done — documented as deliberate incremental adoption |

### 6B — Transport and services

| # | Finding | Status |
|---|---|---|
| 7 | `createHttpAppRuntime()` is ~1090 lines with all route handlers as inline closures | Done — extracted to named handler factories |
| 8 | `BaseService` fabricates `{} as T` for 204 No Content responses, a silent type lie | Done — explicit no-content result type |

### 6C — Test coverage

Suite is 534/534 green; aggregate coverage is 99.36% lines / 92.61% branches /
99.01% functions, with an enforced 80% line floor. Gaps closed:

- [x] Clerk auth happy path. `tests/auth-clerk.test.ts` had a test titled "calls next() when jwtVerify resolves" whose body was `assert.ok(true)`, with a comment claiming integration coverage in `mcp-e2e.test.ts` — that file has zero Clerk references. The success path of the auth mode gating production JWT deployments had no test at all.
- [x] `BaseService.executeRequest` non-ok (4xx/5xx) branch driven through a mocked `fetch`, not a hand-built `FetchError`.
- [x] `BaseService.getPublic()` real implementation (unauthenticated catalog base URL, omitted API-key header) rather than stubbing the method away.
- [x] Behavioural tests for the 9 untested `keys.tools.ts` callbacks and 5 untested `users.tools.ts` callbacks.
- [x] 413 payload-too-large response, previously unreferenced by any test.
- [x] Unicode, control-character, and injection-style strings through path-segment encoding and free-text fields.
- [x] Per-tool query construction and response curation for representative analytics tools.

### 6D — Accepted tradeoffs and deferred work

- **Standard output-schema envelope stays on all 171 tools.** It costs ~104 KB of
  the ~387 KB `tools/list` payload (~25K tokens), and 166 tools carry the identical
  ~625-byte fragment. Dropping it is *not* an option: `scripts/check-tool-definition-quality.mjs`
  fails the build on a missing output schema, and that gate exists to hold the Glama
  TDQS score. The context cost is the price of the score. The real operator lever is
  scoping `PORTKEY_TOOL_DOMAINS` / `?tools=`, which is now documented as a context-cost
  control and not just an access-control one.
- **Per-request server rebuild in stateless mode is accepted.** `createMcpServer()`
  costs ~1.15 ms and ~1.5 MB per request (measured, 500-iteration steady state).
  The SDK binds one server per transport, so there is no way around it. Previously
  reasoned through in `docs/audit-2026-06.md`; re-confirmed here with numbers.
- [x] **Standardize validation style.** Done in 0.9.0, but not the way this item
  originally proposed. Converting handler checks to `superRefine` as written would have
  made errors *worse*: a `superRefine` schema bypasses the SDK's argument validation and
  throws a ZodError into the tool wrapper, which rendered `ZodError.message` — a JSON dump
  of the raw issue array — so a client saw `Tool "create_api_key" failed: [\n {\n "code":
  "custom", ...` where the handler checks gave a clean sentence. The fix was central
  rather than per-tool: `formatZodIssues` in `src/tools/index.ts` flattens issues to
  readable text, and validation failures now carry an `Invalid arguments for "<tool>"`
  prefix that distinguishes a caller error from a tool malfunction. Only once both styles
  produced the same clean envelope was converting the handler checks worth doing.
  With that in place all 10 cross-field rules now follow one pattern: the raw shape stays
  the registered `inputSchema`, and a sibling `superRefine` schema is parsed inside the
  handler. That covers the 7 former handler checks (`configs`, `integrations`, `labels`,
  `mcp-integrations`, `prompts` ×3) plus `get_log` and `create_scim_workspace_mapping`,
  which used to register the refined schema directly and so answered with the SDK's own
  unenveloped `MCP error -32602` string. Registering the refined schema buys nothing —
  a `superRefine` is not expressible in JSON Schema, so `tools/list` is byte-identical
  either way — while costing the standard error envelope.
- **Four contract fixtures are permanently documentation-derived.** `api-keys-rotate`
  and the three `secret-references` fixtures in `tests/fixtures/manifest.json` cannot be
  live-recorded: the endpoints need organisation scopes that no available Portkey key
  carries, so `record:fixtures` gets a 403. This is a standing limitation of the account,
  not a blocked task — do not reopen it looking for a better credential. The other 10
  fixtures are live-captured and remain the real drift detector. If drift on the
  documented four ever matters, the only route is Portkey granting the scope.
- **Unauthenticated `/ready` and `GET /` stay open, by decision.** `/ready` in `portkey`
  check mode confirms a working `PORTKEY_API_KEY` to any caller, and `GET /` renders
  auth/session/event-store mode. The security review rated both notes rather than
  findings: no secret is exposed, and gating them would break the health checks and
  setup-verification flow they exist to serve. Reviewed 2026-08-09 and accepted as-is.

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
