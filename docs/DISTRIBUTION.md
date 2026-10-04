# Distribution and directory inventory

> Last audited: 2026-10-02. Rechecked that day: the Awesome MCP Servers PR, the
> LobeHub listings, the Docker MCP Catalog PR, and Glama. The other downstream
> rows below still reflect 2026-09-08.

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
| [Glama](https://glama.ai/mcp/servers/CodesWhat/portkey-admin-mcp) | Claimed directory and quality listing. On 2026-10-04 the page showed release 0.13.0 and 184 tools, after a repository sync and Build & Release. Its generated description and FAQ still said 150 and 151 tools that day | Indexes GitHub; after each release, use **Repository > Sync Server**, then **Dockerfile > Build & Release**, and verify the version and tool count it shows. The generated description and FAQ text are Glama's and refresh on their own schedule |
| [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers/pull/13074) | Community list entry; the CodesWhat correction (PR #13074) merged on 2026-09-13 | Update the entry through a new PR when the repository owner, Glama badge, or released catalog count changes |

The canonical description for owner-controlled records is:

> Portkey Admin API control-plane MCP server with Prisma AIRS interoperability
> guidance.

Counts belong only in generated or release-specific records. `README.md`,
`ENDPOINTS.md`, and `lhm.plugin.json` are regenerated or verified from the
runtime catalog before release.

## Observed downstream listings

| Surface | State on 2026-09-08 | Maintenance decision |
|---|---|---|
| [LobeHub legacy listing](https://lobehub.com/mcp/scttbnsn-portkey-admin-mcp) | Unpublished on 2026-09-08. On 2026-10-02 the market CLI listed it as `unpublished` at version 0.3.5 and the public page returned 404, while the canonical `codeswhat-portkey-admin-mcp` listing was `published` at 0.12.1 | Nothing to do; only the canonical listing is published |
| [PulseMCP](https://www.pulsemcp.com/servers) | A legacy record uses `io.github.s-b-e-n-s-o-n/portkey-admin-mcp` and an old count; listing changes are paused | Recheck when its submission and correction flow reopens; prefer MCP Registry ingestion |
| [mcp.so](https://mcp.so/servers/portkey-admin-mcp) | Live but stale under the previous owner, with a visible claim control and conflicting counts | Claim and refresh only through its owner workflow; do not automate an undocumented interface |
| [mcpservers.org](https://mcpservers.org/servers/s-b-e-n-s-o-n/portkey-admin-mcp) | Scrapes the current README but retains the previous owner slug and a 151-tool headline | Use its **Request update** flow, then treat the result as downstream indexing rather than a release gate |
| [FindMCP](https://findmcp.app/servers/io-github-s-b-e-n-s-o-n-portkey-admin-mcp) | Mirrors the legacy MCP Registry namespace and old catalog, with no canonical CodesWhat record | Use **Claim this listing** or **Submit Update** for the CodesWhat record and report the old page as duplicate or incorrect |
| [Enterprise DNA](https://enterprisedna.co/directories/mcp/s-b-e-n-s-o-n-portkey-admin-mcp/) | Scraped page under the previous GitHub owner | Treat as a downstream mirror unless it publishes a maintainer update path |

These listings are discoverability mirrors, not release gates. Do not copy their
counts or descriptions back into project metadata.

## Recommended expansion

The [Docker MCP Catalog](https://hub.docker.com/mcp) is curated, has a documented
pull-request submission path, and matches the repository's existing non-root
Docker image and stdio support. The submission is
[docker/mcp-registry#5026](https://github.com/docker/mcp-registry/pull/5026),
open and awaiting maintainer review as of 2026-10-02, and pinned to the 0.12.0
release commit. It isn't complete until Docker merges it and the listing is live.

[Smithery](https://smithery.ai/docs/build/publish) is deferred. Its current
publishing paths expect a public Streamable HTTP endpoint or an MCPB bundle for a
local server. This project intentionally supports npm-based stdio and self-hosted
HTTP, and does not publish either Smithery artifact today.
