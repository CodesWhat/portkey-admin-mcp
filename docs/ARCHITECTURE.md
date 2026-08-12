# Architecture

Portkey Admin MCP is a TypeScript adapter between Model Context Protocol (MCP)
clients and Portkey's Admin API. It exposes the same tool catalog over local
stdio and an optional HTTP transport while keeping API access, validation, and
transport policy in separate layers.

## Component map

| Layer | Main code | Responsibility |
| --- | --- | --- |
| Entrypoints | `src/index.ts`, `src/server.ts` | Start the stdio or HTTP transport and own process shutdown. |
| MCP server | `src/lib/mcp-server.ts` | Create an MCP server, register its workflow resource and prompt, select tool domains, and connect tools to one service facade. |
| Tool adapters | `src/tools/*.tools.ts` | Define MCP schemas and annotations, validate tool input, call a domain service, and curate the MCP result. |
| Service clients | `src/services/*.service.ts` | Map typed domain operations to Portkey Admin API paths and response contracts. |
| HTTP client base | `src/services/base.service.ts` | Validate the upstream URL, attach the Portkey API key, apply timeouts, encode requests, and normalize upstream errors. |
| HTTP runtime | `src/lib/http-app.ts` | Host Streamable HTTP MCP sessions plus health and authorization metadata endpoints. |
| Security and state | `src/lib/auth.ts`, `security.ts`, `session-store.ts`, `event-store.ts`, `limits.ts` | Enforce authentication, origin and network policy, request limits, session ownership, replay protection, and optional Redis-backed event state. |
| Contracts | `src/schemas/contracts/` | Validate the current Portkey response shapes used by contract tests. |

## Request flow

1. An MCP client connects through `StdioServerTransport` or the HTTP runtime.
2. `createMcpServer()` registers all 19 tool domains, or the subset allowed by
   `PORTKEY_TOOL_DOMAINS`.
3. The MCP SDK validates a tool call against its Zod input schema. The shared
   tool wrapper adds the standard success/error envelope and annotations.
4. The tool callback calls its domain client on the shared `PortkeyService`
   facade.
5. `BaseService` builds the authenticated HTTPS request to the configured
   Portkey API, then the domain service validates or normalizes the response.
6. The tool adapter returns a compact MCP result instead of forwarding the raw
   Admin API response.

The Portkey API key is used only by the service layer. Tool results, logs, MCP
session identifiers, and service-cache identifiers do not expose the raw key.

## Transport boundaries

The stdio entrypoint is intended for a local MCP client and relies on the
client's process boundary. The HTTP entrypoint is a network service and adds a
separate policy boundary:

- bearer-token or Clerk JWT authentication;
- allowed-origin, host, and public-base-URL validation;
- body-size, request-rate, and active-session limits;
- stateful sessions with principal ownership, or fresh stateless servers;
- optional encrypted Redis event storage for resumable delivery; and
- readiness and graceful-shutdown handling.

The upstream `PORTKEY_BASE_URL` must be HTTPS unless both development-only
private-network opt-ins are set. Public model-pricing requests use Portkey's
public catalog origin and omit the tenant API key.

## Change boundaries

- Add or change Portkey API behavior in the matching domain service first.
- Keep MCP naming, input validation, output curation, and annotations in the
  matching tool module.
- Register a new domain in `src/tools/index.ts` and expose its client through
  `src/services/index.ts`.
- Put cross-cutting transport, authentication, session, or event behavior in
  `src/lib/`, not in individual tools.

`tests/contract*.test.ts` protect API shapes, the tool suites exercise MCP
callbacks, the service and library suites cover the internal boundaries, and
`tests/mcp-e2e.test.ts` verifies the built server through MCP.
