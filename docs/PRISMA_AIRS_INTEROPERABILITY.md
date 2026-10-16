# Prisma AIRS interoperability

Last verified: 2026-10-16

## Short answer

Portkey is now the core AI Gateway technology in Prisma AIRS, but Prisma AIRS AI Gateway is **not currently a drop-in API target** for this MCP server. Keep using this server for the documented Portkey control-plane API. Use Prisma AIRS alongside it through Strata Cloud Manager and, where useful, Palo Alto Networks' security-focused MCP server.

Changing `PORTKEY_BASE_URL` to a Prisma AIRS or Strata Cloud Manager URL will not work: the public products currently expose different management surfaces, credentials, and resource models.

## Current boundary

| Surface | Management interface | Authentication | What this project supports |
|---|---|---|---|
| Portkey Admin API | `https://api.portkey.ai/v1` or a compatible self-hosted control plane | `x-portkey-api-key` | Support through 22 tool domains |
| Portkey public model catalog | `https://api.portkey.ai/model-configs/...` | None | `get_model_pricing` |
| Prisma AIRS AI Gateway | Published control-plane and admin APIs under `https://api.apps.paloaltonetworks.com/ai_gw` | `Authorization: Bearer` using Prisma AIRS / SCM credentials | Published management contract available; no direct adapter yet |
| Prisma AIRS security MCP server | Regional Palo Alto Networks `/mcp` endpoint | `x-pan-token`, OAuth, and optional `x-pan-profile` | Works as a separate MCP server; it scans and secures AI interactions rather than managing Portkey resources |

Palo Alto Networks now publishes a Prisma AIRS AI Gateway management OpenAPI,
linked from Portkey's documentation index alongside the Portkey OpenAPI. It
includes configs, integrations, API keys, guardrails, MCP servers, rate/usage
policies, analytics, secret references, and deployments. The earlier August
assessment that no equivalent public management contract existed is superseded.

The two APIs still differ:

- Prisma AIRS uses Bearer authentication. This server sends `x-portkey-api-key`.
- Management routes have separate `/ai_gw/v2` and `/ai_gw/admin/v2` bases, with
  organisation guardrails also published under `/ai_gw/admin/v2/guardrails`.
- API-key creation is `/api-keys/{sub-type}`, without Portkey's scope segment.
- The published Prisma specification omits the top-level prompts, prompt
  partials, collections, labels, users, workspaces, virtual keys, audit logs,
  and log-export management domains. Some user/workspace subresources remain.
- The Prisma specification's README says nothing has been verified against the
  running API; inherited schemas remain unverified and descriptions are mostly
  empty. Its published version is evidence for adapter design, not verified
  production parity.

These differences preserve the recommendation to use separate servers today.
A future adapter must select the right plane per capability, authenticate for
Prisma AIRS, and omit unsupported tools. Replacing only `PORTKEY_BASE_URL`
would send the wrong authentication and some requests to the wrong routes.

## Recommended coexistence

Run the two MCP servers side by side when you need both administration and runtime security:

```json
{
  "mcpServers": {
    "portkey-admin": {
      "command": "npx",
      "args": ["-y", "portkey-admin-mcp"],
      "env": {
        "PORTKEY_API_KEY": "your-portkey-key"
      }
    },
    "prisma-airs-security": {
      "type": "http",
      "url": "https://service.api.aisecurity.paloaltonetworks.com/mcp",
      "headers": {
        "x-pan-token": "your-prisma-airs-key",
        "x-pan-profile": "your-security-profile"
      }
    }
  }
}
```

Use `portkey-admin` for control-plane changes. Use `prisma-airs-security` for the security tools provided by Palo Alto Networks. Choose the documented regional Prisma AIRS endpoint for your tenant, and keep both credentials out of source control.

## When a direct adapter becomes possible

A public management specification is now available. Before shipping a native
Prisma AIRS mode, verify its published contracts against a credentialed tenant.
The adapter will need its own:

- base URL and authentication strategy;
- mapping for tenants, workspaces, guardrails, integrations, and logs;
- capability detection rather than assuming Portkey endpoint parity;
- contract fixtures and integration tests against the published API.

That should be a distinct adapter or tool domain, not a silent reinterpretation of `PORTKEY_BASE_URL`, so existing Portkey and self-hosted deployments keep working.

## Official references

- [Palo Alto Networks completes the Portkey acquisition](https://investors.paloaltonetworks.com/news-releases/news-release-details/palo-alto-networks-completes-acquisition-portkey-secure-ai)
- [Configure Prisma AIRS AI Gateway](https://docs.paloaltonetworks.com/ai-runtime-security/administration/configure-ai-gateway)
- [Configure the Prisma AIRS security MCP server](https://docs.paloaltonetworks.com/ai-runtime-security/activation-and-onboarding/prisma-airs-mcp-server-for-centralized-ai-agent-security/configure-mcp-server-security-using-prisma-airs)
- [Portkey documentation index, linking both specifications](https://portkey.ai/docs/llms.txt)
- [Prisma AIRS management specification and verification limits](https://github.com/PaloAltoNetworks/openapi)
- [Prisma AIRS management server declarations](https://github.com/PaloAltoNetworks/openapi/blob/main/_project/servers.yaml)
- [Prisma AIRS API-key path change](https://github.com/PaloAltoNetworks/openapi/commit/be8e1dc1e893d7034faf2d250973e9f0df1a2784)
- [Portkey OpenAPI](https://github.com/Portkey-AI/openapi)
