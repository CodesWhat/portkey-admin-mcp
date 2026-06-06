<div align="center">

# Portkey Admin MCP Server

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1000&color=FFFFFF&center=true&vCenter=true&width=500&lines=150+tools+for+Portkey+Admin+API;Prompts%2C+Configs%2C+Analytics;Full+MCP+Protocol+1.0+Server">
  <source media="(prefers-color-scheme: light)" srcset="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1000&color=000000&center=true&vCenter=true&width=500&lines=150+tools+for+Portkey+Admin+API;Prompts%2C+Configs%2C+Analytics;Full+MCP+Protocol+1.0+Server">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1000&color=000000&center=true&vCenter=true&width=500&lines=150+tools+for+Portkey+Admin+API;Prompts%2C+Configs%2C+Analytics;Full+MCP+Protocol+1.0+Server" alt="Typing SVG">
</picture>

MCP server for the [Portkey](https://portkey.ai/) Admin API. Manage prompts, configs, analytics, API keys, and more from any MCP client.

<a href="https://www.npmjs.com/package/portkey-admin-mcp"><img src="https://img.shields.io/npm/v/portkey-admin-mcp.svg" alt="npm version"></a>
<a href="https://www.npmjs.com/package/portkey-admin-mcp"><img src="https://img.shields.io/npm/dm/portkey-admin-mcp.svg" alt="npm downloads"></a>
<a href="https://github.com/scttbnsn/portkey-admin-mcp/actions/workflows/ci.yml"><img src="https://github.com/scttbnsn/portkey-admin-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js"></a>
<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
<a href="https://github.com/punkpeye/awesome-mcp-servers"><img src="https://awesome.re/mentioned-badge.svg" alt="Mentioned in Awesome MCP Servers"></a>
<a href="https://lobehub.com/mcp/scttbnsn-portkey-admin-mcp"><img src="https://lobehub.com/badge/mcp/scttbnsn-portkey-admin-mcp?style=flat" alt="LobeHub MCP"></a>

<a href="https://glama.ai/mcp/servers/scttbnsn/portkey-admin-mcp"><img src="https://glama.ai/mcp/servers/scttbnsn/portkey-admin-mcp/badges/card.svg" alt="portkey-admin-mcp MCP server"></a>

</div>

---

> [!IMPORTANT]
> **Maintenance mode.** Portkey was acquired by **Palo Alto Networks** (completed 2026‑05‑29) and is being folded into the Prisma AIRS platform. The Portkey Admin API this server targets is **live and unchanged as of June 2026**, and this project still works end‑to‑end — but it is now in **maintenance mode**: security and dependency patches only, no new features, pending Palo Alto's post‑acquisition API roadmap. If the hosted Admin API is ever deprecated, point `PORTKEY_BASE_URL` at a self‑hosted [Portkey gateway](https://github.com/Portkey-AI/gateway). See [docs/audit-2026-06.md](./docs/audit-2026-06.md) for the full assessment.

## Quick Start

You need a **Portkey API key** with appropriate scopes. Get one from your [Portkey dashboard](https://app.portkey.ai/) under API Keys.

### Claude Code

```bash
claude mcp add -e PORTKEY_API_KEY=your_key portkey-admin -- npx -y portkey-admin-mcp
```

### Cursor / Windsurf / VS Code

Add to your MCP config (`.cursor/mcp.json`, `.windsurf/mcp.json`, or `.vscode/mcp.json`):

```json
{
  "mcpServers": {
    "portkey-admin": {
      "command": "npx",
      "args": ["-y", "portkey-admin-mcp"],
      "env": {
        "PORTKEY_API_KEY": "your_api_key"
      }
    }
  }
}
```

### Run directly

```bash
PORTKEY_API_KEY=your_key npx -y portkey-admin-mcp
```

To expose only a focused subset of tools in stdio clients, set `PORTKEY_TOOL_DOMAINS`:

```bash
PORTKEY_API_KEY=your_key \
PORTKEY_TOOL_DOMAINS=prompts,analytics \
npx -y portkey-admin-mcp
```

<details>
<summary><strong>Build from source</strong></summary>

```bash
git clone https://github.com/scttbnsn/portkey-admin-mcp.git
cd portkey-admin-mcp
npm install && npm run build
```

Then use this config:
```json
{
  "mcpServers": {
    "portkey-admin": {
      "command": "node",
      "args": ["/path/to/portkey-admin-mcp/build/index.js"],
      "env": {
        "PORTKEY_API_KEY": "your_api_key"
      }
    }
  }
}
```

</details>

---

## What You Can Do

| Category | Tools | Examples |
|----------|-------|---------|
| **Prompts** | 14 | Create, version, render, execute, migrate, promote prompts |
| **Prompt Partials** | 7 | Reusable prompt fragments with versioning |
| **Prompt Labels** | 5 | Organize prompt versions (production, staging, dev) |
| **Configs** | 6 | Gateway routing, caching, retry, loadbalancing |
| **API Keys** | 5 | Create and manage scoped API keys |
| **Virtual Keys** | 5 | Manage provider access keys |
| **Collections** | 5 | Group prompts by app or project |
| **Providers** | 5 | Manage AI provider configurations |
| **Integrations** | 10 | Provider integrations, models, workspace access |
| **MCP Integrations** | 10 | External MCP tool integrations |
| **MCP Servers** | 10 | MCP server registry and capabilities |
| **Guardrails** | 5 | Content safety policies |
| **Usage Limits** | 7 | Cost and token consumption limits |
| **Rate Limits** | 5 | Request frequency controls |
| **Analytics** | 20 | Cost, latency, errors, tokens, cache, feedback |
| **Logging** | 8 | Log ingestion and export |
| **Tracing** | 2 | Feedback creation and updates on traces |
| **Users & Workspaces** | 20 | User management, invites, workspace members |
| **Audit** | 1 | Audit log access |

**150 tools total.** See [ENDPOINTS.md](./ENDPOINTS.md) for the full list with descriptions.

---

## API Key Scopes

Most tools work with a **workspace-scoped service key** that has Select All permissions enabled. That covers prompts, configs, virtual/API keys, providers, guardrails, workspace integrations, MCP servers, rate/usage limits, logs, prompt completions, and workspace user management.

### Enterprise-gated tools (28)

The following tools require an **organisation-level scope that is only available on Portkey Enterprise plans**. They return `403 You do not have enough permissions to execute this request` on workspace plans. Their descriptions include an `Enterprise-gated. Returns 403 on non-Enterprise Portkey plans.` suffix so MCP clients know upfront.

| Area | Tools | Required scope |
|---|---|---|
| Analytics (20) | `get_cost_analytics`, `get_request_analytics`, `get_token_analytics`, `get_latency_analytics`, `get_error_analytics`, `get_error_rate_analytics`, `get_cache_hit_latency`, `get_cache_hit_rate`, `get_users_analytics`, `get_error_stacks_analytics`, `get_error_status_codes_analytics`, `get_user_requests_analytics`, `get_rescued_requests_analytics`, `get_feedback_analytics`, `get_feedback_models_analytics`, `get_feedback_scores_analytics`, `get_feedback_weighted_analytics`, `get_analytics_group_users`, `get_analytics_group_models`, `get_analytics_group_metadata` | org-level `analytics.view` |
| Audit | `list_audit_logs` | `audit_logs.list` |
| Org-level integrations | `get_integration`, `list_integration_models`, `list_integration_workspaces` | `organisation_integrations.read` |
| Org-level users | `list_all_users`, `get_user`, `get_user_stats`, `list_user_invites` | `organisation_users.list` / `organisation_users.read` |

### Other scope requirements

| Feature | Required |
|---------|----------|
| Prompt completions (`run_prompt_completion`) | `completions.write` scope + billing metadata (`app`, `env`) |
| Org-level service API key creation via `create_api_key` | `organisation_service_api_keys.create` (Enterprise) |

If a tool returns a `403` with Portkey error `AB03`, it means missing scopes — not a broken endpoint.

---

## HTTP Server (Experimental)

> **Status**: The HTTP transport works but hosted deployment is not fully validated for production. Use stdio (npx) for reliable operation.

The server supports Streamable HTTP for remote access:

```bash
PORTKEY_API_KEY=your_key \
MCP_HOST=127.0.0.1 \
MCP_PORT=3000 \
MCP_PUBLIC_BASE_URL=https://mcp.example.com \
MCP_AUTH_MODE=bearer \
MCP_AUTH_TOKEN=your_secret \
node build/server.js
```

Or via npx (the `portkey-admin-mcp` package includes the HTTP binary):
```bash
PORTKEY_API_KEY=your_key MCP_AUTH_MODE=bearer MCP_AUTH_TOKEN=your_secret \
  npx -y -p portkey-admin-mcp portkey-admin-mcp-http
```

For local-only HTTP use, leave `MCP_HOST` at its default `127.0.0.1`. Set `MCP_HOST=0.0.0.0` only when you intentionally need to accept connections from outside the local machine, such as Docker or a reverse proxy on another interface.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORTKEY_API_KEY` | (required) | Your Portkey API key |
| `PORTKEY_BASE_URL` | `https://api.portkey.ai/v1` | Portkey Admin API base URL. Point at a self-hosted Portkey gateway if needed. Loopback/private-network hosts are rejected unless `PORTKEY_ALLOW_PRIVATE_BASE_URL=true` |
| `PORTKEY_ALLOW_PRIVATE_BASE_URL` | — | Set to `true` to allow a `PORTKEY_BASE_URL` on loopback or a private network (e.g. a self-hosted gateway at `http://localhost:8787`) |
| `PORTKEY_TOOL_DOMAINS` | — | Optional comma-separated stdio/HTTP default tool subset, e.g. `prompts,analytics` |
| `MCP_HOST` | `127.0.0.1` | Bind address |
| `MCP_PORT` | `3000` | Port |
| `MCP_PUBLIC_BASE_URL` | — | Public absolute base URL to advertise from `/auth/info` and the status page; recommended for hosted deployments |
| `MCP_AUTH_MODE` | `none` | `none`, `bearer`, or `clerk` (`none` is blocked for HTTP unless explicitly overridden) |
| `MCP_AUTH_TOKEN` | — | Secret for bearer auth |
| `MCP_ALLOW_UNAUTHENTICATED_HTTP` | — | Set to `true` only for intentional local unauthenticated HTTP debugging |
| `MCP_SESSION_MODE` | `stateful` | `stateful` or `stateless` |
| `MCP_MAX_SESSIONS` | `100` | Maximum concurrent stateful MCP sessions before new initialize requests are rejected |
| `MCP_EVENT_STORE` | `off` | `off`, `memory`, or `redis` |
| `MCP_REDIS_URL` | — | Redis URL for shared event store |
| `MCP_TLS_KEY_PATH` | — | TLS key for native HTTPS |
| `MCP_TLS_CERT_PATH` | — | TLS cert for native HTTPS |
| `ALLOWED_ORIGINS` | — | CORS allow-list; also used to validate the `Host` header (DNS-rebinding protection) when `MCP_AUTH_MODE=none` |
| `MCP_TRUST_PROXY` | `false` | Trust proxy headers (for reverse proxies) |
| `RATE_LIMIT_MAX_BUCKETS` | `10000` | Maximum distinct in-memory rate-limit buckets before new clients share an overflow bucket |

<details>
<summary><strong>Vercel deployment</strong></summary>

Experimental Vercel support is included. See [docs/VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md) for setup instructions.

Key points:
- Uses stateless mode with Redis event store
- Requires Clerk or bearer auth
- Leave `MCP_TLS_*` unset (Vercel terminates HTTPS)
- Set `MCP_PUBLIC_BASE_URL` to your deployment URL so advertised MCP endpoints never depend on request headers
- Vercel does not support WebSockets — Streamable HTTP/SSE only

</details>

<details>
<summary><strong>Docker</strong></summary>

```bash
docker build -t portkey-admin-mcp .
docker run \
  -e PORTKEY_API_KEY=your_key \
  -e MCP_HOST=0.0.0.0 \
  -e MCP_PORT=3000 \
  -e MCP_AUTH_MODE=bearer \
  -e MCP_AUTH_TOKEN=your_secret \
  -p 3000:3000 \
  portkey-admin-mcp
```

</details>

### Health Endpoints

| Path | Purpose |
|------|---------|
| `GET /health` | Server liveness |
| `GET /ready` | Readiness (includes optional Portkey connectivity check) |
| `GET /auth/info` | Auth configuration metadata |

---

## Development

```bash
npm run dev           # stdio with hot reload
npm run dev:http      # HTTP with hot reload
npm test              # unit + contract tests
npm run test:e2e      # MCP protocol tests
npm run test:http     # HTTP endpoint smoke test
npm run ci            # full pipeline (lint + typecheck + test + build + e2e + verify)
```

`npm run dev:http` now requires `MCP_AUTH_MODE=bearer` or `MCP_AUTH_MODE=clerk` by default. For deliberate local-only unauthenticated testing, set `MCP_ALLOW_UNAUTHENTICATED_HTTP=true`.

---

<div align="center">

**MIT License** · Inspired by [r-huijts/portkey-admin-mcp-server](https://github.com/r-huijts/portkey-admin-mcp-server)

<a href="#portkey-admin-mcp-server">↑ Back to top</a>

</div>
