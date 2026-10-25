# Compatibility and deprecations

Last reviewed: 2026-10-25. Package versions, SDK versions, and negotiated MCP
protocol revisions are separate compatibility boundaries.

## Release lines

| Package release | MCP SDK | MCP protocol | Support and behavior |
| --- | --- | --- | --- |
| 0.14.1 | v1; dependency floor 1.32.1 | Latest supported revision: `2025-11-25` | Current published minor, 194 tools across 22 domains, Node.js 24+. Stateful HTTP sessions and optional replay stores remain active. |
| 0.13.0 | v1; dependency floor 1.31.0 | Latest supported revision: `2025-11-25` | Historical release, 184 tools across 20 domains. Upgrade to the latest published minor for security fixes. |
| 0.15.0 target, unreleased candidate | server/client 2.3.1, Node adapter 2.1.1 (exact pins) | Native `2026-07-28` plus older clients on the same endpoint | Not shipped. Local candidate retires HTTP session and replay stores; warnings ignore obsolete settings. First warnings and ignored settings start in 0.15.0; session/replay behavior is removed in that release. |

The published 0.14.x SDK supports `2025-11-25`, `2025-06-18`, `2025-03-26`,
`2024-11-05`, and `2024-10-07`. A newer client that negotiates an older
revision can use this server; that fallback does not mean the server natively
supports `2026-07-28`. The candidate tests modern auto/pinned clients and default legacy clients over HTTP and stdio. Client products, deployed proxies and marketplace acceptance still need release validation.

[SECURITY.md](https://github.com/CodesWhat/portkey-admin-mcp/blob/main/SECURITY.md) owns the security-support policy: fixes ship on the
latest published minor line; older minor lines do not receive backports.
See [CHANGELOG.md](https://github.com/CodesWhat/portkey-admin-mcp/blob/main/CHANGELOG.md) for changes in each published release.

## Configuration lifecycle

No deprecation warnings or removals for the settings below ship in 0.14.x.
The SDK v2 migration targets 0.15.0. In that minor, the listed settings warn and
are ignored, and the underlying session/replay behavior is removed. There is no
intermediate warning-only release. Obsolete names remain recognized for warnings;
this does not retain their former functionality. Nothing here changes 0.14.x.

| Setting or behavior | 0.14.x | Planned migration | First warning / ignored / removal release |
| --- | --- | --- | --- |
| `MCP_SESSION_MODE`, `MCP_SESSION_TIMEOUT` | Active; stateful mode is the default | Candidate ignores settings with a warning; older clients use stateless requests | 0.15.0 / 0.15.0 / 0.15.0 |
| `MCP_EVENT_STORE`, `MCP_EVENT_TTL_SECONDS`, `MCP_EVENT_STORE_MAX_EVENTS`, `MCP_EVENT_STORE_MAX_BYTES`, `MCP_EVENT_STORE_COMMAND_TIMEOUT_MS` | Active replay configuration | Candidate ignores settings with a warning; GET/DELETE return 405 | 0.15.0 / 0.15.0 / 0.15.0 |
| `MCP_EVENT_ENCRYPTION_KEY`, `MCP_REDIS_KEY_PREFIX` | Active Redis replay configuration | Candidate ignores settings with a warning | 0.15.0 / 0.15.0 / 0.15.0 |
| HTTP GET stream, `Last-Event-ID` recovery, session identifiers | Active under the configured HTTP mode | Candidate returns no session IDs; GET/DELETE return 405 | 0.15.0 / 0.15.0 / 0.15.0 |
| `RATE_LIMIT_*` | Active rate-limit configuration | Retained, including shared Redis limiting | No removal planned |
| `RATE_LIMIT_REDIS_URL`, `MCP_REDIS_URL`, `REDIS_URL` | Rate limiter uses these URL sources in that order; replay uses the latter two | Preserve a documented Redis connection path for rate limiting when replay is retired | No removal assigned |
| `MCP_MAX_SESSIONS` | Bounds stateful sessions or active stateless request handlers | Retain the stateless concurrency bound | No removal planned |
| `MCP_TOOL_DOMAINS`, `CORS_ORIGIN` | Supported fallbacks for `PORTKEY_TOOL_DOMAINS`, `ALLOWED_ORIGINS` | No change assigned | No removal planned |

Redis rate limiting and Redis replay are separate features. Retiring the replay
store does not remove the need for a shared rate limiter in multi-instance or
serverless deployments. Do not remove working settings from a 0.14.x deployment
based on the migration plan.

## Migration preparation

Local migration work began in October 2026. The original start-by date was
2026-12-01, or earlier if the v1 SDK stops receiving a needed
security fix or announces end of life, a targeted client drops the older
handshake or fails when pinned to `2026-07-28`, or 30 days pass without a v2
server release carrying upgrade notes. Target completion is before 2027-01-27.
These are project planning dates, not announced configuration-removal dates or
an SDK end-of-life guarantee. [ROADMAP.md](https://github.com/CodesWhat/portkey-admin-mcp/blob/main/ROADMAP.md) tracks the work.

Before that release, operators need a versioned upgrade guide covering:

- warning and removal behavior for every retired setting;
- loss of session affinity, the GET stream, and `Last-Event-ID` recovery;
- how to inspect Portkey state after an interrupted mutation before retrying,
  since an automatic retry can repeat a successful write;
- retained Redis rate-limit configuration and concurrency bounds; and
- client, reverse-proxy, Vercel, and marketplace compatibility checks.

The release must update this table, the README configuration reference,
[architecture](https://github.com/CodesWhat/portkey-admin-mcp/blob/main/docs/ARCHITECTURE.md), [Vercel guide](docs/VERCEL_DEPLOYMENT.md),
[security assurance case](https://github.com/CodesWhat/portkey-admin-mcp/blob/main/SECURITY-ASSURANCE.md), and changelog together.

## Unreleased candidate: interrupted requests

The SDK v2 candidate keeps older `initialize` clients working on `/mcp` without
persistent HTTP sessions. Modern clients use `server/discover` on the same URL.
Clients and proxies must forward `MCP-Protocol-Version`, `Mcp-Method` and, for
named operations such as `tools/call`, `Mcp-Name`. Tool filters apply to every
request; reuse the same `?tools=` URL throughout a client workflow.

GET streams, DELETE session operations and `Last-Event-ID` replay are retired.
A disconnected request can still have changed Portkey state even when its result
was lost. Do not automatically replay a write:

1. Save the operation name, target workspace/resource ID and intended change
   without recording credentials or secret values.
2. Reconnect and use the matching `get_*` or `list_*` tool, or the Portkey
   dashboard, to inspect whether the change completed. For creates, correlate
   the intended name/metadata and time; a missing response is not proof of failure.
3. If the desired state already exists, continue from that resource. If failure
   is confirmed, retry once intentionally. If the outcome is still ambiguous,
   inspect the upstream audit/usage records or ask the tenant administrator before
   repeating creates, completions or other operations with side effects.

Reads can be requested again. Neither transport reconnect nor a successful new
handshake proves a previous mutation failed. There is no exactly-once guarantee.
`MCP_MAX_SESSIONS` now caps concurrent request handlers; it does not restore
sessions or replay. Redis remains available for shared rate limiting through
`RATE_LIMIT_REDIS_URL`, `MCP_REDIS_URL`, then `REDIS_URL`. No replay encryption key
is needed by the candidate. Keep deployed 0.14.x settings until upgrading to the
versioned minor; the first warning, ignored-setting and feature-removal release is 0.15.0.
Package metadata and release artifacts must be prepared for that minor only after
the current 0.14.1 maintenance lane is finished.
