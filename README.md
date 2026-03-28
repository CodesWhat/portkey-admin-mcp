<div align="center">

# Portkey Admin MCP Server

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1000&color=FFFFFF&center=true&vCenter=true&width=500&lines=151+tools+for+Portkey+Admin+API;Prompts%2C+Configs%2C+Analytics;Full+MCP+Protocol+1.0+Server">
  <source media="(prefers-color-scheme: light)" srcset="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1000&color=000000&center=true&vCenter=true&width=500&lines=151+tools+for+Portkey+Admin+API;Prompts%2C+Configs%2C+Analytics;Full+MCP+Protocol+1.0+Server">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&pause=1000&color=000000&center=true&vCenter=true&width=500&lines=151+tools+for+Portkey+Admin+API;Prompts%2C+Configs%2C+Analytics;Full+MCP+Protocol+1.0+Server" alt="Typing SVG">
</picture>

MCP server for the [Portkey](https://portkey.ai/) Admin API. Manage prompts, configs, analytics, API keys, and more from any MCP client.

<a href="https://www.npmjs.com/package/portkey-admin-mcp"><img src="https://img.shields.io/npm/v/portkey-admin-mcp.svg" alt="npm"></a>
<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js"></a>
<a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>

> **Beta** — Under active development. Most tools work, some edge cases in limits and MCP integrations may have issues. [Report bugs.](https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/issues)

</div>

---

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

<details>
<summary><strong>Build from source</strong></summary>

```bash
git clone https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp.git
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
| **Tracing** | 3 | Feedback and trace retrieval |
| **Users & Workspaces** | 20 | User management, invites, workspace members |
| **Audit** | 1 | Audit log access |

**151 tools total.** See [ENDPOINTS.md](./ENDPOINTS.md) for the full list with descriptions.

---

## API Key Scopes

Different tools require different API key scopes. A workspace-scoped service key with broad permissions works for most operations. Some features need additional access:

| Feature | Required |
|---------|----------|
| Analytics, log exports, audit logs | Enterprise plan + `analytics.view` scope |
| User management, invites | Organization-level API key |
| Integration models/workspaces | Organization-level API key |
| Prompt completions | `completions.write` scope + billing metadata |

If a tool returns a `403` with Portkey error `AB03`, it means missing scopes — not a broken endpoint.

---

## HTTP Server (Experimental)

> **Status**: The HTTP transport works but hosted deployment is not fully validated for production. Use stdio (npx) for reliable operation.

The server supports Streamable HTTP for remote access:

```bash
PORTKEY_API_KEY=your_key \
MCP_HOST=0.0.0.0 \
MCP_PORT=3000 \
MCP_AUTH_MODE=bearer \
MCP_AUTH_TOKEN=your_secret \
node build/server.js
```

Or via npx (the `portkey-admin-mcp` package includes the HTTP binary):
```bash
PORTKEY_API_KEY=your_key MCP_AUTH_MODE=bearer MCP_AUTH_TOKEN=your_secret \
  npx -y -p portkey-admin-mcp portkey-admin-mcp-http
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORTKEY_API_KEY` | (required) | Your Portkey API key |
| `MCP_HOST` | `127.0.0.1` | Bind address |
| `MCP_PORT` | `3000` | Port |
| `MCP_AUTH_MODE` | `none` | `none`, `bearer`, or `clerk` |
| `MCP_AUTH_TOKEN` | — | Secret for bearer auth |
| `MCP_SESSION_MODE` | `stateful` | `stateful` or `stateless` |
| `MCP_EVENT_STORE` | `off` | `off`, `memory`, or `redis` |
| `MCP_REDIS_URL` | — | Redis URL for shared event store |
| `MCP_TLS_KEY_PATH` | — | TLS key for native HTTPS |
| `MCP_TLS_CERT_PATH` | — | TLS cert for native HTTPS |
| `ALLOWED_ORIGINS` | — | CORS allow-list |
| `MCP_TRUST_PROXY` | `false` | Trust proxy headers (for reverse proxies) |

<details>
<summary><strong>Vercel deployment</strong></summary>

Experimental Vercel support is included. See [docs/VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md) for setup instructions.

Key points:
- Uses stateless mode with Redis event store
- Requires Clerk or bearer auth
- Leave `MCP_TLS_*` unset (Vercel terminates HTTPS)
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

---

<div align="center">

**MIT License** · Inspired by [r-huijts/portkey-admin-mcp-server](https://github.com/r-huijts/portkey-admin-mcp-server)

<a href="#portkey-admin-mcp-server">↑ Back to top</a>

</div>
