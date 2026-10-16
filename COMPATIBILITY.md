# Compatibility and deprecations

Last reviewed: 2026-10-16. Package versions, SDK versions, and negotiated MCP
protocol revisions are separate compatibility boundaries.

## Release lines

| Package release | MCP SDK | MCP protocol | Support and behavior |
| --- | --- | --- | --- |
| 0.14.0 | v1; dependency floor 1.32.1 | Latest supported revision: `2025-11-25` | Current published minor, 194 tools across 22 domains, Node.js 24+. Stateful HTTP sessions and optional replay stores remain active. |
| 0.13.0 | v1; dependency floor 1.31.0 | Latest supported revision: `2025-11-25` | Historical release, 184 tools across 20 domains. Upgrade to the latest published minor for security fixes. |
| Planned migration, minor release number unassigned | v2, exact version to be selected and tested | Native `2026-07-28` plus older clients on the same endpoint | Not shipped. Planned to retire HTTP session and replay stores and change configuration behavior. |

The current SDK supports `2025-11-25`, `2025-06-18`, `2025-03-26`,
`2024-11-05`, and `2024-10-07`. A newer client that negotiates an older
revision can use this server; that fallback does not mean the server natively
supports `2026-07-28`. The migration must verify both modern and older clients
over HTTP and stdio before release.

[SECURITY.md](SECURITY.md) owns the security-support policy: fixes ship on the
latest published minor line; older minor lines do not receive backports.
See [CHANGELOG.md](CHANGELOG.md) for changes in each published release.

## Configuration lifecycle

No deprecation warnings or removals for the settings below ship in 0.14.0.
The planned migration has no assigned package release number. Its release
notes must identify the first warning, ignored-setting, and removal versions
before operators are asked to upgrade.

| Setting or behavior | 0.14.0 | Planned migration | First warning / ignored / removal release |
| --- | --- | --- | --- |
| `MCP_SESSION_MODE`, `MCP_SESSION_TIMEOUT` | Active; stateful mode is the default | Retire session storage; serve older clients without persistent sessions | Unassigned / unassigned / unassigned |
| `MCP_EVENT_STORE`, `MCP_EVENT_TTL_SECONDS`, `MCP_EVENT_STORE_MAX_EVENTS`, `MCP_EVENT_STORE_MAX_BYTES`, `MCP_EVENT_STORE_COMMAND_TIMEOUT_MS` | Active replay configuration | Retire replay storage and warn about obsolete settings | Unassigned / unassigned / unassigned |
| `MCP_EVENT_ENCRYPTION_KEY`, `MCP_REDIS_KEY_PREFIX` | Active Redis replay configuration | Retire with the replay store | Unassigned / unassigned / unassigned |
| HTTP GET stream, `Last-Event-ID` recovery, session identifiers | Active under the configured HTTP mode | Retire legacy sessions and replay; document the resulting recovery changes | Unassigned / unassigned / unassigned |
| `RATE_LIMIT_*` | Active rate-limit configuration | Retained, including shared Redis limiting | No removal planned |
| `RATE_LIMIT_REDIS_URL`, `MCP_REDIS_URL`, `REDIS_URL` | Rate limiter uses these URL sources in that order; replay uses the latter two | Preserve a documented Redis connection path for rate limiting when replay is retired | No removal assigned |
| `MCP_MAX_SESSIONS` | Bounds stateful sessions or active stateless request handlers | Retain the stateless concurrency bound | No removal planned |
| `MCP_TOOL_DOMAINS`, `CORS_ORIGIN` | Supported fallbacks for `PORTKEY_TOOL_DOMAINS`, `ALLOWED_ORIGINS` | No change assigned | No removal planned |

Redis rate limiting and Redis replay are separate features. Retiring the replay
store does not remove the need for a shared rate limiter in multi-instance or
serverless deployments. Do not remove working settings from a 0.14.0 deployment
based on the migration plan.

## Migration preparation

Work starts by 2026-12-01, or earlier if the v1 SDK stops receiving a needed
security fix or announces end of life, a targeted client drops the older
handshake or fails when pinned to `2026-07-28`, or 30 days pass without a v2
server release carrying upgrade notes. Target completion is before 2027-01-27.
These are project planning dates, not announced configuration-removal dates or
an SDK end-of-life guarantee. [ROADMAP.md](ROADMAP.md) tracks the work.

Before that release, operators need a versioned upgrade guide covering:

- warning and removal behavior for every retired setting;
- loss of session affinity, the GET stream, and `Last-Event-ID` recovery;
- how to inspect Portkey state after an interrupted mutation before retrying,
  since an automatic retry can repeat a successful write;
- retained Redis rate-limit configuration and concurrency bounds; and
- client, reverse-proxy, Vercel, and marketplace compatibility checks.

The release must update this table, the README configuration reference,
[architecture](docs/ARCHITECTURE.md), [Vercel guide](docs/VERCEL_DEPLOYMENT.md),
[security assurance case](SECURITY-ASSURANCE.md), and changelog together.
