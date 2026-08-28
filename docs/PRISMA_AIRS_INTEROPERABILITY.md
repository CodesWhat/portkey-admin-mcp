# Prisma AIRS interoperability

Last verified: 2026-08-28

## Short answer

Portkey is now the core AI Gateway technology in Prisma AIRS, but Prisma AIRS AI Gateway is **not currently a drop-in API target** for this MCP server. Keep using this server for the documented Portkey control-plane API. Use Prisma AIRS alongside it through Strata Cloud Manager and, where useful, Palo Alto Networks' security-focused MCP server.

Changing `PORTKEY_BASE_URL` to a Prisma AIRS or Strata Cloud Manager URL will not work: the public products currently expose different management surfaces, credentials, and resource models.

## Current boundary

| Surface | Management interface | Authentication | What this project supports |
|---|---|---|---|
| Portkey Admin API | `https://api.portkey.ai/v1` or a compatible self-hosted control plane | `x-portkey-api-key` | Full support through the 20 existing tool domains |
| Portkey public model catalog | `https://api.portkey.ai/model-configs/...` | None | `get_model_pricing` |
| Prisma AIRS AI Gateway | AI Security in Strata Cloud Manager | Prisma AIRS / SCM tenant credentials | No direct admin adapter yet |
| Prisma AIRS security MCP server | Regional Palo Alto Networks `/mcp` endpoint | `x-pan-token`, OAuth, and optional `x-pan-profile` | Works as a separate MCP server; it scans and secures AI interactions rather than managing Portkey resources |

Palo Alto Networks says the Portkey acquisition makes Portkey the core AI Gateway for Prisma AIRS. Its current AI Gateway instructions direct administrators to Strata Cloud Manager, while the documented Prisma AIRS MCP endpoint is for centralized AI-agent security. No public Prisma AIRS admin contract equivalent to Portkey's users, workspaces, prompts, configs, integrations, or keys is documented today. That last sentence is an inference from the currently published product and API documentation, not a promise that such an API will never exist.

The August 2026 Prisma AIRS additions cover runtime, model, skill, discovery, and
red-team security capabilities. They do not publish a Portkey-compatible AI
Gateway administration contract, so they do not change this boundary.

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

A native Prisma AIRS mode should be added only after Palo Alto Networks publishes a stable management API for AI Gateway. The adapter will need its own:

- base URL and authentication strategy;
- mapping for tenants, workspaces, guardrails, integrations, and logs;
- capability detection rather than assuming Portkey endpoint parity;
- contract fixtures and integration tests against the published API.

That should be a distinct adapter or tool domain, not a silent reinterpretation of `PORTKEY_BASE_URL`, so existing Portkey and self-hosted deployments keep working.

## Official references

- [Palo Alto Networks completes the Portkey acquisition](https://investors.paloaltonetworks.com/news-releases/news-release-details/palo-alto-networks-completes-acquisition-portkey-secure-ai)
- [Configure Prisma AIRS AI Gateway](https://docs.paloaltonetworks.com/ai-runtime-security/administration/configure-ai-gateway)
- [Configure the Prisma AIRS security MCP server](https://docs.paloaltonetworks.com/ai-runtime-security/activation-and-onboarding/prisma-airs-mcp-server-for-centralized-ai-agent-security/configure-mcp-server-security-using-prisma-airs)
- [Portkey OpenAPI](https://github.com/Portkey-AI/openapi)
