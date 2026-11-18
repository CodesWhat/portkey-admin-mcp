# Distribution and directory inventory

> Last release verification: 2026-11-18. GitHub, npm provenance, the MCP
> Registry, and the Vercel production deploy were checked for 0.16.5. The
> LobeHub manual publish, the Glama re-index, and the Docker submission pin
> remain pending or unverified. Other downstream observations retain their
> original dates.

The generated catalog in this repository is the source of truth for tool names,
counts, and descriptions. Public directory pages can lag a release or retain a
legacy repository owner, so they should not be used to validate the runtime.

## Maintained distribution records

| Surface                                                                                                                   | Current relationship                                                                                          | Update path                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GitHub](https://github.com/CodesWhat/portkey-admin-mcp)                                                                  | Canonical source, project description, homepage, and discovery topics                                         | Keep the repository description aligned with package metadata; point the homepage at the npm package                                                                                                                                              |
| [npm](https://www.npmjs.com/package/portkey-admin-mcp)                                                                    | Canonical package distribution                                                                                | Automated from a protected release tag using `package.json`                                                                                                                                                                                       |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.CodesWhat/portkey-admin-mcp) | Canonical MCP metadata under `io.github.CodesWhat/portkey-admin-mcp`                                          | Automated after npm publication using `server.json`                                                                                                                                                                                               |
| [LobeHub](https://lobehub.com/mcp/codeswhat-portkey-admin-mcp)                                                            | Claimed marketplace listing                                                                                   | Run `npm run update:lobehub` after release; `lhm.plugin.json` is owner-declared metadata                                                                                                                                                          |
| [Glama](https://glama.ai/mcp/servers/CodesWhat/portkey-admin-mcp)                                                         | Claimed directory and quality listing; the 2026-10-16 post-release build serves package 0.14.0 with 194 tools | Indexes GitHub; after each release, use **Repository > Sync Server**, then **Dockerfile > Build & Release**, and verify the version and tool count it shows. The generated description and FAQ text are Glama's and refresh on their own schedule |
| [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers/pull/13074)                                         | Community list entry; the CodesWhat correction (PR #13074) merged on 2026-09-13                               | Update the entry through a new PR when the repository owner, Glama badge, or released catalog count changes                                                                                                                                       |

The canonical description for owner-controlled records is:

> Portkey Admin API control-plane MCP server with Prisma AIRS interoperability
> guidance.

Counts belong only in generated or release-specific records. `README.md`,
`ENDPOINTS.md`, and `lhm.plugin.json` are regenerated or verified from the
runtime catalog before release.

### 0.16.5 publication checks, 2026-11-18

- GitHub [v0.16.5](https://github.com/CodesWhat/portkey-admin-mcp/releases/tag/v0.16.5)
  resolves to `09f9d05e3bf409497709355fda49c259b86b0327` (`main`, promotion
  #220). The release was published 2026-11-18T22:52:57Z and is marked Latest.
  [Release workflow 44414517043](https://github.com/CodesWhat/portkey-admin-mcp/actions/runs/44414517043)
  completed successfully.
- npm reports `portkey-admin-mcp@0.16.5` with SLSA provenance
  (`https://slsa.dev/provenance/v1`).
- The official MCP Registry lists `io.github.CodesWhat/portkey-admin-mcp`
  0.16.5 as `isLatest=true`, published 2026-11-18T22:56:35Z.
- The Vercel Production deploy of `09f9d05e` succeeded. The live docs show
  0.16.4 until this manual refresh ships.
- LobeHub: the manual publish for 0.16.5 is pending and unverified.
- Docker submission [#5026](https://github.com/docker/mcp-registry/pull/5026):
  the pin has not been refreshed to the 0.16.5 release commit. Pending and
  unverified; maintainer review and catalog publication also remain pending.
- Glama: the re-index for 0.16.5 is pending and unverified.

### 0.16.4 publication checks, 2026-11-14

- GitHub [v0.16.4](https://github.com/CodesWhat/portkey-admin-mcp/releases/tag/v0.16.4)
  resolves to `17388870d75d4129fa77d06b3df920395e3dad30`.
  [Release workflow 43557844265](https://github.com/CodesWhat/portkey-admin-mcp/actions/runs/43557844265)
  completed successfully. The release body includes the matching changelog.
- npm and the official MCP Registry report 0.16.4. The npm archive matches its
  integrity digest and provenance subject; the provenance names the exact
  release commit, tag, repository, and release workflow.
- The authenticated LobeHub owner CLI reports `codeswhat-portkey-admin-mcp`
  published at 0.16.4. The legacy listing remains unpublished at 0.3.5.
  The public listing returned HTTP 403 during verification, so its rendered
  version was not verified.
- Docker submission [#5026](https://github.com/docker/mcp-registry/pull/5026)
  now pins the 0.16.4 release commit. The upstream PR diff and factual follow-up
  were checked. Maintainer review and catalog publication remain pending.
- Glama's public HTML is reachable and shows the active-development notice,
  but the exact 0.16.4 indexed commit, discovered inventory, build, and score
  breakdown have not been verified. The browser access host is unavailable;
  the claimed sync/build controls need a logged-in browser session. This is an
  outstanding release follow-up, not a successful refresh.

### 0.14.0 publication checks, 2026-10-16

- GitHub [v0.14.0](https://github.com/CodesWhat/portkey-admin-mcp/releases/tag/v0.14.0),
  npm, and the official MCP Registry report 0.14.0. The release workflow passed.
- The authenticated LobeHub owner CLI reports `codeswhat-portkey-admin-mcp`
  published at 0.14.0 across 15 locales, with the English summary updated to
  194 tools. Its public page still showed cached 0.13.0 during the post-publish
  check; owner publication and public-page cache refresh are separate states.
- Glama synced release commit
  [`ccaaaf5593d6ab923a6538a15b018845c91560b0`](https://github.com/CodesWhat/portkey-admin-mcp/commit/ccaaaf5593d6ab923a6538a15b018845c91560b0)
  and completed a successful build. Its server version is 0.14.0 and indexed
  inventory is 194 tools. Glama's separate hosted release number is 1.0.8.
  Before that sync, the same day's check showed 0.13.0 and 184 tools; generated
  description/FAQ text still said 150/151, and the public inventory API returned 401. Those observations describe the earlier scan, not the released server.
- Docker submission [#5026](https://github.com/docker/mcp-registry/pull/5026)
  was refreshed to that release commit with successful validation and
  194-tool discovery. Upstream maintainer review remains outstanding.

## Observed downstream listings

| Surface                                                                                     | Last verified state                                                                                                                                                                                                                  | Maintenance decision                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [LobeHub legacy listing](https://lobehub.com/mcp/scttbnsn-portkey-admin-mcp)                | Unpublished on 2026-09-08. The 2026-10-16 pre-release owner check still showed it unpublished at 0.3.5 while the canonical listing was published at 0.13.0; the canonical listing advanced to 0.14.0 in the post-release check above | Nothing to do; only the canonical listing is published                                                                     |
| [PulseMCP](https://www.pulsemcp.com/servers)                                                | A legacy record uses `io.github.s-b-e-n-s-o-n/portkey-admin-mcp` and an old count; listing changes are paused                                                                                                                        | Recheck when its submission and correction flow reopens; prefer MCP Registry ingestion                                     |
| [mcp.so](https://mcp.so/servers/portkey-admin-mcp)                                          | Live but stale under the previous owner, with a visible claim control and conflicting counts                                                                                                                                         | Claim and refresh only through its owner workflow; do not automate an undocumented interface                               |
| [mcpservers.org](https://mcpservers.org/servers/s-b-e-n-s-o-n/portkey-admin-mcp)            | Scrapes the current README but retains the previous owner slug and a 151-tool headline                                                                                                                                               | Use its **Request update** flow, then treat the result as downstream indexing rather than a release gate                   |
| [FindMCP](https://findmcp.app/servers/io-github-s-b-e-n-s-o-n-portkey-admin-mcp)            | Mirrors the legacy MCP Registry namespace and old catalog, with no canonical CodesWhat record                                                                                                                                        | Use **Claim this listing** or **Submit Update** for the CodesWhat record and report the old page as duplicate or incorrect |
| [Enterprise DNA](https://enterprisedna.co/directories/mcp/s-b-e-n-s-o-n-portkey-admin-mcp/) | Scraped page under the previous GitHub owner                                                                                                                                                                                         | Treat as a downstream mirror unless it publishes a maintainer update path                                                  |

These listings are discoverability mirrors, not release gates. Do not copy their
counts or descriptions back into project metadata.

## Recommended expansion

The [Docker MCP Catalog](https://hub.docker.com/mcp) is curated, has a documented
pull-request submission path, and matches the repository's existing non-root
Docker image and stdio support. The submission is
[docker/mcp-registry#5026](https://github.com/docker/mcp-registry/pull/5026),
open and awaiting maintainer review as of 2026-11-14, with the 0.16.4 source pin (the 0.16.5 pin refresh is pending). Its `source.commit` is the
release pin; refresh that pin, the PR release description, and discovery evidence
after publication. It is not listed until Docker merges it and the catalog is live.

[Smithery](https://smithery.ai/) shut down its API, CLI, SDKs and accounts on
2026-10-31 and is now a directory only
([source](https://www.smithery.ai/future)), so there is nothing to publish to
there. This project intentionally supports npm-based stdio and self-hosted HTTP,
and does not publish a Smithery artifact.
