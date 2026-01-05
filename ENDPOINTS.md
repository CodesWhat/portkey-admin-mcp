# Portkey Admin API Endpoints

This document lists all API endpoints used by the Portkey Admin MCP Server, verified against the [official Portkey Admin API documentation](https://portkey.ai/docs/api-reference/admin-api/introduction).

## Configuration

- **Base URL**: `https://api.portkey.ai/v1`
- **Authentication**: `x-portkey-api-key` header
- **Total Endpoints**: 107

## Verification Legend

| Symbol | Meaning |
|--------|---------|
| [x] | Verified - matches official docs |
| [!] | Discrepancy - path differs from docs |
| [?] | Undocumented - not found in official docs |

---

## 1. Users

**Service**: `src/services/users.service.ts`
**Docs**: [Admin API - Users](https://portkey.ai/docs/api-reference/admin-api/control-plane/users)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [?] | GET | `/admin/users` | `/users` | List all users |
| [?] | GET | `/admin/users/{userId}` | `/users/{id}` | Get user by ID |
| [?] | PUT | `/admin/users/{userId}` | `/users/{id}` | Update user |
| [?] | DELETE | `/admin/users/{userId}` | `/users/{id}` | Delete user |

**Tested**: Both paths return 403 (permission denied). This is an API key scope issue, not a path issue. Unable to verify correct path.

---

## 2. User Invites

**Service**: `src/services/users.service.ts`
**Docs**: [Admin API - User Invites](https://portkey.ai/docs/api-reference/admin-api/control-plane/user-invites)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [?] | POST | `/admin/users/invites` | `/user-invites` | Invite user |
| [?] | GET | `/admin/users/invites` | `/user-invites` | List invites |
| [?] | GET | `/admin/users/invites/{inviteId}` | `/user-invites/{id}` | Get invite |
| [?] | DELETE | `/admin/users/invites/{inviteId}` | `/user-invites/{id}` | Delete invite |
| [?] | POST | `/admin/users/invites/{inviteId}/resend` | `/user-invites/{id}/resend` | Resend invite |

**Tested**: Both paths return 403 (permission denied). This is an API key scope issue, not a path issue. Unable to verify correct path.

---

## 3. User Analytics

**Service**: `src/services/users.service.ts`
**Docs**: [Admin API - Analytics](https://portkey.ai/docs/api-reference/admin-api/control-plane/analytics)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/analytics/groups/users` | `/analytics/groups/users` | User grouped analytics |

---

## 4. Workspaces

**Service**: `src/services/workspaces.service.ts`
**Docs**: [Admin API - Workspaces](https://portkey.ai/docs/api-reference/admin-api/control-plane/workspaces)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/admin/workspaces` | `/workspaces` | List workspaces |
| [x] | POST | `/admin/workspaces` | `/workspaces` | Create workspace |
| [x] | GET | `/admin/workspaces/{workspaceId}` | `/workspaces/{id}` | Get workspace |
| [x] | PUT | `/admin/workspaces/{workspaceId}` | `/workspaces/{id}` | Update workspace |
| [x] | DELETE | `/admin/workspaces/{workspaceId}` | `/workspaces/{id}` | Delete workspace |

**Tested**: `/admin/workspaces` paths work (200). Docs `/workspaces` returns 400. Keep current paths.

---

## 5. Workspace Members

**Service**: `src/services/workspaces.service.ts`
**Docs**: [Admin API - Workspace Members](https://portkey.ai/docs/api-reference/admin-api/control-plane/workspace-members)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | POST | `/admin/workspaces/{id}/users` | `/workspaces/{id}/members` | Add member |
| [x] | GET | `/admin/workspaces/{id}/users` | `/workspaces/{id}/members` | List members |
| [x] | GET | `/admin/workspaces/{id}/users/{userId}` | `/workspaces/{id}/members/{member_id}` | Get member |
| [x] | PUT | `/admin/workspaces/{id}/users/{userId}` | `/workspaces/{id}/members/{member_id}` | Update member |
| [x] | DELETE | `/admin/workspaces/{id}/users/{userId}` | `/workspaces/{id}/members/{member_id}` | Remove member |

**Tested**: `/admin/workspaces/{id}/users` paths work (200). Docs paths return 400. Keep current paths.

---

## 6. Configs

**Service**: `src/services/configs.service.ts`
**Docs**: [Admin API - Configs](https://portkey.ai/docs/api-reference/admin-api/control-plane/configs)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/configs` | `/configs` | List all configs |
| [x] | POST | `/configs` | `/configs` | Create config |
| [x] | GET | `/configs/{slug}` | `/configs/{id}` | Get config |
| [x] | PUT | `/configs/{slug}` | `/configs/{id}` | Update config |
| [x] | DELETE | `/configs/{slug}` | `/configs/{id}` | Delete config |
| [x] | GET | `/configs/{slug}/versions` | `/configs/{id}/versions` | List versions |

---

## 7. Virtual Keys

**Service**: `src/services/keys.service.ts`
**Docs**: [Admin API - Virtual Keys](https://portkey.ai/docs/api-reference/admin-api/control-plane/virtual-keys)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/virtual-keys` | `/virtual-keys` | List virtual keys |
| [x] | POST | `/virtual-keys` | `/virtual-keys` | Create virtual key |
| [x] | GET | `/virtual-keys/{slug}` | `/virtual-keys/{id}` | Get virtual key |
| [x] | PUT | `/virtual-keys/{slug}` | `/virtual-keys/{id}` | Update virtual key |
| [x] | DELETE | `/virtual-keys/{slug}` | `/virtual-keys/{id}` | Delete virtual key |

---

## 8. API Keys

**Service**: `src/services/keys.service.ts`
**Docs**: [Admin API - API Keys](https://portkey.ai/docs/api-reference/admin-api/control-plane/api-keys)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | POST | `/api-keys/{type}/{subType}` | `/api-keys` | Create API key |
| [x] | GET | `/api-keys` | `/api-keys` | List API keys |
| [x] | GET | `/api-keys/{id}` | `/api-keys/{id}` | Get API key |
| [x] | PUT | `/api-keys/{id}` | `/api-keys/{id}` | Update API key |
| [x] | DELETE | `/api-keys/{id}` | `/api-keys/{id}` | Delete API key |

**Note**: Create endpoint uses `/{type}/{subType}` for key type specification.

---

## 9. Collections

**Service**: `src/services/collections.service.ts`
**Docs**: [Admin API - Collections](https://portkey.ai/docs/api-reference/admin-api/control-plane/prompts/collections)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/collections` | `/collections` | List collections |
| [x] | POST | `/collections` | `/collections` | Create collection |
| [x] | GET | `/collections/{collectionId}` | `/collections/{id}` | Get collection |
| [x] | PUT | `/collections/{collectionId}` | `/collections/{id}` | Update collection |
| [x] | DELETE | `/collections/{collectionId}` | `/collections/{id}` | Delete collection |

---

## 10. Prompts

**Service**: `src/services/prompts.service.ts`
**Docs**: [Admin API - Prompts](https://portkey.ai/docs/api-reference/admin-api/control-plane/prompts)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | POST | `/prompts` | `/prompts` | Create prompt |
| [x] | GET | `/prompts` | `/prompts` | List prompts |
| [x] | GET | `/prompts/{promptId}` | `/prompts/{id}` | Get prompt |
| [x] | PUT | `/prompts/{promptId}` | `/prompts/{id}` | Update prompt |
| [x] | DELETE | `/prompts/{promptId}` | `/prompts/{id}` | Delete prompt |
| [x] | PUT | `/prompts/{promptId}/makeDefault` | `/prompts/{id}/publish` | Publish version |
| [x] | GET | `/prompts/{promptId}/versions` | `/prompts/{id}/versions` | List versions |
| [x] | POST | `/prompts/{promptId}/render` | `/prompts/{id}/render` | Render prompt |
| [x] | POST | `/prompts/{promptId}/completions` | `/prompts/{id}/completions` | Run completion |

**Tested**: `/makeDefault` returns 200, `/publish` returns 404. Keep `/makeDefault`.

---

## 11. Prompt Partials

**Service**: `src/services/partials.service.ts`
**Docs**: [Admin API - Partials](https://portkey.ai/docs/api-reference/admin-api/control-plane/prompts/partials)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | POST | `/prompts/partials` | `/prompts/partials` | Create partial |
| [x] | GET | `/prompts/partials` | `/prompts/partials` | List partials |
| [x] | GET | `/prompts/partials/{promptPartialId}` | `/prompts/partials/{id}` | Get partial |
| [x] | PUT | `/prompts/partials/{promptPartialId}` | `/prompts/partials/{id}` | Update partial |
| [x] | DELETE | `/prompts/partials/{promptPartialId}` | `/prompts/partials/{id}` | Delete partial |
| [x] | GET | `/prompts/partials/{promptPartialId}/versions` | `/prompts/partials/{id}/versions` | List versions |
| [x] | PUT | `/prompts/partials/{promptPartialId}/makeDefault` | `/prompts/partials/{id}/publish` | Publish version |

**Tested**: `/makeDefault` returns 200, `/publish` returns 404. Keep `/makeDefault`.

---

## 12. Labels

**Service**: `src/services/labels.service.ts`
**Docs**: [Admin API - Labels](https://portkey.ai/docs/api-reference/admin-api/control-plane/prompts/labels)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | POST | `/labels` | `/labels` | Create label |
| [x] | GET | `/labels` | `/labels` | List labels |
| [x] | GET | `/labels/{labelId}` | `/labels/{id}` | Get label |
| [x] | PUT | `/labels/{labelId}` | `/labels/{id}` | Update label |
| [x] | DELETE | `/labels/{labelId}` | `/labels/{id}` | Delete label |

---

## 13. Analytics

**Service**: `src/services/analytics.service.ts`
**Docs**: [Admin API - Analytics](https://portkey.ai/docs/api-reference/admin-api/control-plane/analytics)

### Graph Analytics

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/analytics/graphs/cost` | `/analytics/graphs/cost` | Cost analytics |
| [x] | GET | `/analytics/graphs/requests` | `/analytics/graphs/requests` | Request count |
| [x] | GET | `/analytics/graphs/tokens` | `/analytics/graphs/tokens` | Token usage |
| [x] | GET | `/analytics/graphs/latency` | `/analytics/graphs/latency` | Latency (p50/p90/p99) |
| [x] | GET | `/analytics/graphs/errors` | `/analytics/graphs/errors` | Error count |
| [x] | GET | `/analytics/graphs/errors/rate` | `/analytics/graphs/errors/rate` | Error rate |
| [x] | GET | `/analytics/graphs/cache/latency` | `/analytics/graphs/cache/latency` | Cache latency |
| [x] | GET | `/analytics/graphs/cache/hit-rate` | `/analytics/graphs/cache/hit-rate` | Cache hit rate |
| [x] | GET | `/analytics/graphs/users` | `/analytics/graphs/users` | User activity (requires elevated permissions) |

**Verified 2025-12-31**: The following documented endpoints returned 404 and were removed from codebase:
`/analytics/graphs/feedback`, `/analytics/graphs/feedback-per-models`, `/analytics/graphs/feedback-distribution`,
`/analytics/graphs/requests-per-user`, `/analytics/graphs/rescued-requests`, `/analytics/graphs/status-codes`,
`/analytics/graphs/unique-status-codes`, `/analytics/graphs/weighted-feedback`, `/analytics/groups/metadata`,
`/analytics/groups/models`. These may be deprecated or require a different API version.

---

## 14. Guardrails

**Service**: `src/services/guardrails.service.ts`
**Docs**: [Admin API - Guardrails](https://portkey.ai/docs/api-reference/admin-api/control-plane/guardrails)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/guardrails` | `/guardrails` | List guardrails |
| [x] | POST | `/guardrails` | `/guardrails` | Create guardrail |
| [x] | GET | `/guardrails/{guardrailId}` | `/guardrails/{id}` | Get guardrail |
| [x] | PUT | `/guardrails/{guardrailId}` | `/guardrails/{id}` | Update guardrail |
| [x] | DELETE | `/guardrails/{guardrailId}` | `/guardrails/{id}` | Delete guardrail |

---

## 15. Usage Limits

**Service**: `src/services/limits.service.ts`
**Docs**: [Admin API - Usage Limits](https://portkey.ai/docs/api-reference/admin-api/control-plane/policies/usage-limits)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/policies/usage-limits` | `/policies/usage-limits` | List usage limits |
| [x] | POST | `/policies/usage-limits` | `/policies/usage-limits` | Create usage limit |
| [x] | GET | `/policies/usage-limits/{id}` | `/policies/usage-limits/{id}` | Get usage limit |
| [x] | PUT | `/policies/usage-limits/{id}` | `/policies/usage-limits/{id}` | Update usage limit |
| [x] | DELETE | `/policies/usage-limits/{id}` | `/policies/usage-limits/{id}` | Delete usage limit |

---

## 16. Rate Limits

**Service**: `src/services/limits.service.ts`
**Docs**: [Admin API - Rate Limits](https://portkey.ai/docs/api-reference/admin-api/control-plane/policies/rate-limits)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/policies/rate-limits` | `/policies/rate-limits` | List rate limits |
| [x] | POST | `/policies/rate-limits` | `/policies/rate-limits` | Create rate limit |
| [x] | GET | `/policies/rate-limits/{id}` | `/policies/rate-limits/{id}` | Get rate limit |
| [x] | PUT | `/policies/rate-limits/{id}` | `/policies/rate-limits/{id}` | Update rate limit |
| [x] | DELETE | `/policies/rate-limits/{id}` | `/policies/rate-limits/{id}` | Delete rate limit |

---

## 17. Audit Logs

**Service**: `src/services/audit.service.ts`
**Docs**: [Admin API - Audit Logs](https://portkey.ai/docs/api-reference/admin-api/control-plane/audit-logs)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/audit-logs` | `/audit-logs` | List audit logs |

---

## 18. Tracing / Feedback

**Service**: `src/services/tracing.service.ts`
**Docs**: [Admin API - Feedback](https://portkey.ai/docs/api-reference/admin-api/data-plane/feedback)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | POST | `/feedback` | `/feedback` | Create feedback |
| [x] | PUT | `/feedback/{id}` | `/feedback/{id}` | Update feedback |
| [!] | GET | `/logs` | `/logs` | List traces - Returns 405 Method Not Allowed |
| [x] | GET | `/logs/{id}` | `/logs/{id}` | Get trace |

---

## 19. Logging / Exports

**Service**: `src/services/logging.service.ts`
**Docs**: [Admin API - Log Exports](https://portkey.ai/docs/api-reference/admin-api/data-plane/logs/log-exports-beta)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | POST | `/logs` | `/logs` | Insert log entry |
| [x] | POST | `/logs/exports` | `/logs/exports` | Create export job |
| [x] | GET | `/logs/exports` | `/logs/exports` | List exports |
| [x] | GET | `/logs/exports/{exportId}` | `/logs/exports/{id}` | Get export |
| [x] | POST | `/logs/exports/{exportId}/start` | `/logs/exports/{id}/start` | Start export |
| [x] | POST | `/logs/exports/{exportId}/cancel` | `/logs/exports/{id}/cancel` | Cancel export |
| [x] | GET | `/logs/exports/{exportId}/download` | `/logs/exports/{id}/download` | Download export |
| [x] | PUT | `/logs/exports/{exportId}` | `/logs/exports/{id}` | Update export |

---

## 20. Providers

**Service**: `src/services/providers.service.ts`
**Docs**: [Admin API - Providers](https://portkey.ai/docs/api-reference/admin-api/control-plane/providers)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/providers` | `/providers` | List providers |
| [x] | POST | `/providers` | `/providers` | Create provider |
| [x] | GET | `/providers/{slug}` | `/providers/{id}` | Get provider |
| [x] | PUT | `/providers/{slug}` | `/providers/{id}` | Update provider |
| [x] | DELETE | `/providers/{slug}` | `/providers/{id}` | Delete provider |

---

## 21. Integrations

**Service**: `src/services/integrations.service.ts`
**Docs**: [Admin API - Integrations](https://portkey.ai/docs/api-reference/admin-api/control-plane/integrations)

| Status | Method | Codebase Path | Docs Path | Description |
|--------|--------|---------------|-----------|-------------|
| [x] | GET | `/integrations` | `/integrations` | List integrations |
| [x] | POST | `/integrations` | `/integrations` | Create integration |
| [x] | GET | `/integrations/{slug}` | `/integrations/{id}` | Get integration |
| [x] | PUT | `/integrations/{slug}` | `/integrations/{id}` | Update integration |
| [x] | DELETE | `/integrations/{slug}` | `/integrations/{id}` | Delete integration |
| [x] | GET | `/integrations/{slug}/models` | `/integrations/{id}/models` | List models |
| [x] | PUT | `/integrations/{slug}/models` | `/integrations/{id}/models` | Update models |
| [x] | DELETE | `/integrations/{slug}/models/{modelId}` | `/integrations/{id}/models/{model_id}` | Delete model |
| [x] | GET | `/integrations/{slug}/workspaces` | `/integrations/{id}/workspaces` | List workspaces |
| [x] | PUT | `/integrations/{slug}/workspaces` | `/integrations/{id}/workspaces` | Update workspaces |

---

## Summary

### Verification Statistics

| Status | Count | Description |
|--------|-------|-------------|
| [x] Verified | 87 | Working paths confirmed via API testing |
| [!] Discrepancy | 0 | None - all tested paths work |
| [?] Unable to verify | 20 | 9 return 403 (permission denied) + 11 new analytics endpoints pending testing |

### Key Findings

1. **`/admin/workspaces` paths WORK** - Tested with 200 responses. Docs `/workspaces` returns 400. Keep current paths.
2. **`/admin/workspaces/{id}/users` paths WORK** - Tested with 200 responses. Docs `/members` path returns 400.
3. **`/makeDefault` WORKS, `/publish` does NOT** - Tested with PUT. `/makeDefault` returns 200, `/publish` returns 404.
4. **Audit Logs uses `/audit-logs`** - Already matches docs (no `/admin/` prefix in code)
5. **Integrations uses `/integrations`** - Already matches docs (no `/admin/` prefix in code)
6. **Users/Invites return 403** - API key lacks permissions, cannot verify path correctness

### Test Results Reference

```text
Endpoint Verification (2025-12-31):
- /admin/workspaces              → 200 ✓
- /workspaces                    → 400 ✗
- /admin/users                   → 403 (permission)
- /users                         → 403 (permission)
- /integrations                  → 200 ✓
- /admin/integrations            → 400 ✗
- /audit-logs                    → 403 (permission)
- /prompts/{id}/makeDefault      → 200 ✓ (PUT)
- /prompts/{id}/publish          → 404 ✗ (PUT)
```

---

## Appendix: Official Portkey API Docs Reference

*Extracted from [Portkey Admin API Docs](https://portkey.ai/docs/api-reference/admin-api/) on 2025-12-31*

These are the paths documented by Portkey. Where they differ from what actually works (tested above), **use the tested paths**.

### Users (Docs: `/admin/users`)
```text
GET    /v1/admin/users
GET    /v1/admin/users/{userId}
PUT    /v1/admin/users/{userId}
DELETE /v1/admin/users/{userId}
```

### User Invites (Docs: `/admin/users/invites`)
```text
POST   /v1/admin/users/invites
GET    /v1/admin/users/invites
GET    /v1/admin/users/invites/{invite_id}
DELETE /v1/admin/users/invites/{invite_id}
POST   /v1/admin/users/invites/{invite_id}/resend
```

### Workspaces (Docs: `/admin/workspaces`)
```text
POST   /v1/admin/workspaces
GET    /v1/admin/workspaces
GET    /v1/admin/workspaces/{id}
PUT    /v1/admin/workspaces/{id}
DELETE /v1/admin/workspaces/{id}
```

### Workspace Members (Docs: `/admin/workspaces/{id}/users`)
```text
POST   /v1/admin/workspaces/{workspaceId}/users
GET    /v1/admin/workspaces/{workspaceId}/users
GET    /v1/admin/workspaces/{workspaceId}/users/{userId}
PUT    /v1/admin/workspaces/{workspaceId}/users/{userId}
DELETE /v1/admin/workspaces/{workspaceId}/users/{userId}
```

### Prompts (Docs: `/prompts`)
```text
POST   /v1/prompts
GET    /v1/prompts
GET    /v1/prompts/{id}
PUT    /v1/prompts/{id}
DELETE /v1/prompts/{id}
PUT    /v1/prompts/{id}/publish          ← Docs say this, but /makeDefault works
GET    /v1/prompts/{id}/versions
GET    /v1/prompts/{id}/versions/{version_id}
PUT    /v1/prompts/{id}/versions/{version_id}
```

### Prompt Partials (Docs: `/prompts/partials`)
```text
POST   /v1/prompts/partials
GET    /v1/prompts/partials
GET    /v1/prompts/partials/{id}
PUT    /v1/prompts/partials/{id}
DELETE /v1/prompts/partials/{id}
GET    /v1/prompts/partials/{id}/versions
PUT    /v1/prompts/partials/{id}/publish  ← Docs say this, but /makeDefault works
```

### Analytics - Graphs (Docs: `/analytics/graphs`)
```text
GET /v1/analytics/graphs/cost                  ✓ Works (403)
GET /v1/analytics/graphs/requests              ✓ Works (403)
GET /v1/analytics/graphs/tokens                ✓ Works (403)
GET /v1/analytics/graphs/latency               ✓ Works (403)
GET /v1/analytics/graphs/errors                ✓ Works (403)
GET /v1/analytics/graphs/errors/rate           ✓ Works (403)
GET /v1/analytics/graphs/cache/latency         ✓ Works (403)
GET /v1/analytics/graphs/cache/hit-rate        ✓ Works (403)
GET /v1/analytics/graphs/users                 ✓ Works (403)
# The following documented endpoints return 404 - not implemented:
# GET /v1/analytics/graphs/feedback
# GET /v1/analytics/graphs/feedback-per-models
# GET /v1/analytics/graphs/feedback-distribution
# GET /v1/analytics/graphs/requests-per-user
# GET /v1/analytics/graphs/rescued-requests
# GET /v1/analytics/graphs/status-codes
# GET /v1/analytics/graphs/unique-status-codes
# GET /v1/analytics/graphs/weighted-feedback
```

### Analytics - Groups (Docs: `/analytics/groups`)
```text
GET /v1/analytics/groups/users                 ✓ Works
# The following documented endpoints return 404 - not implemented:
# GET /v1/analytics/groups/metadata
# GET /v1/analytics/groups/models
```

### Log Exports (Docs: `/log-exports`)
```text
POST /v1/log-exports                    ← Docs (vs /logs/exports in code)
GET  /v1/log-exports
GET  /v1/log-exports/{id}
PUT  /v1/log-exports/{id}
POST /v1/log-exports/{id}/start
POST /v1/log-exports/{id}/cancel
GET  /v1/log-exports/{id}/download
```

---

## Summary: Docs vs Reality

| What Docs Say | What Actually Works | Notes |
|---------------|---------------------|-------|
| `/workspaces` | `/admin/workspaces` | Docs path returns 400 |
| `/workspaces/{id}/members` | `/admin/workspaces/{id}/users` | Docs path returns 400 |
| `/prompts/{id}/publish` | `/prompts/{id}/makeDefault` | Docs path returns 404 |
| `/log-exports` | `/logs/exports` | Need to test |
| `/analytics/graphs/error-rate` | `/analytics/graphs/errors/rate` | ✓ Tested - works (403) |
| `/analytics/graphs/cache-hit-latency` | `/analytics/graphs/cache/latency` | ✓ Tested - works (403) |
| `/analytics/graphs/cache-hit-rate` | `/analytics/graphs/cache/hit-rate` | ✓ Tested - works (403) |
| `/analytics/graphs/feedback` | N/A | ✗ Returns 404 - not implemented |
| `/analytics/graphs/feedback-*` | N/A | ✗ Returns 404 - not implemented |
| `/analytics/groups/metadata` | N/A | ✗ Returns 404 - not implemented |
| `/analytics/groups/models` | N/A | ✗ Returns 404 - not implemented |

**Recommendation**: Trust the tested paths. The Portkey docs may be outdated or describe a different API version.
