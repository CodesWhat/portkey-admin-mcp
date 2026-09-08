# Distribution and directory inventory

> Last audited: 2026-09-08

The generated catalog in this repository is the source of truth for tool names,
counts, and descriptions. Public directory pages can lag a release or retain a
legacy repository owner, so they should not be used to validate the runtime.

## Maintained distribution records

| Surface | Current relationship | Update path |
|---|---|---|
| [GitHub](https://github.com/CodesWhat/portkey-admin-mcp) | Canonical source, project description, homepage, and discovery topics | Keep the repository description aligned with package metadata; point the homepage at the npm package |
| [npm](https://www.npmjs.com/package/portkey-admin-mcp) | Canonical package distribution | Automated from a protected release tag using `package.json` |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.CodesWhat/portkey-admin-mcp) | Canonical MCP metadata under `io.github.CodesWhat/portkey-admin-mcp` | Automated after npm publication using `server.json` |
| [LobeHub](https://lobehub.com/mcp/codeswhat-portkey-admin-mcp) | Claimed marketplace listing | Run `npm run update:lobehub` after release; `lhm.plugin.json` is owner-declared metadata |
| [Glama](https://glama.ai/mcp/servers/CodesWhat/portkey-admin-mcp) | Claimed directory and quality listing | Indexes GitHub; use the listing's **Sync Server** control when the tagged commit or catalog lags |
| [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers/pull/13074) | Community list entry; CodesWhat correction is awaiting upstream merge | Keep PR #13074 current with the repository owner, Glama badge, and released catalog count |

The canonical description for owner-controlled records is:

> Portkey Admin API control-plane MCP server with Prisma AIRS interoperability
> guidance.

Counts belong only in generated or release-specific records. `README.md`,
`ENDPOINTS.md`, and `lhm.plugin.json` are regenerated or verified from the
runtime catalog before release.

## Observed downstream listings

| Surface | State on 2026-09-08 | Maintenance decision |
|---|---|---|
| [PulseMCP](https://www.pulsemcp.com/servers) | A legacy record uses `io.github.s-b-e-n-s-o-n/portkey-admin-mcp` and an old count; listing changes are paused | Recheck when its submission and correction flow reopens; prefer MCP Registry ingestion |
| [mcp.so](https://mcp.so/servers/portkey-admin-mcp) | Live but stale under the previous owner, with a visible claim control and conflicting counts | Claim and refresh only through its owner workflow; do not automate an undocumented interface |
| [FindMCP](https://findmcp.app/servers/io-github-s-b-e-n-s-o-n-portkey-admin-mcp) | Mirrors the legacy MCP Registry namespace and old catalog | Allow normal Registry re-ingestion first; request a correction only if the stale record persists |
| [Enterprise DNA](https://enterprisedna.co/directories/mcp/s-b-e-n-s-o-n-portkey-admin-mcp/) | Scraped page under the previous GitHub owner | Treat as a downstream mirror unless it publishes a maintainer update path |

These listings are discoverability mirrors, not release gates. Do not copy their
counts or descriptions back into project metadata.

## Recommended expansion

The [Docker MCP Catalog](https://hub.docker.com/mcp) is the next useful listing.
It is curated, has a documented pull-request submission path, and matches the
repository's existing non-root Docker image and stdio support. The submission
should reference a released commit and pass Docker's image validation before it
is treated as complete.

[Smithery](https://smithery.ai/docs/build/publish) is deferred. Its current
publishing paths expect a public Streamable HTTP endpoint or an MCPB bundle for a
local server. This project intentionally supports npm-based stdio and self-hosted
HTTP, and does not publish either Smithery artifact today.
