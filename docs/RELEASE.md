# Release Process

This project uses stable SemVer tags plus GitHub Releases so package registries
and catalog scanners can detect published versions.

## Publish a New Stable Release (automated)

1. On a dev branch, update `package.json`, `package-lock.json`, `server.json`,
   `lhm.plugin.json`, and `CHANGELOG.md` for the new version. The release
   readiness test keeps all four version-bearing JSON files synchronized.
2. Run `npm run ci`.
3. Open a PR and merge it to `main`.

The CI run includes `npm run verify:tool-quality`, a deterministic preflight
based on Glama's [Tool Definition Quality Score
(TDQS)](https://github.com/glama-ai/tool-definition-quality-score). It inspects
the actual MCP `tools/list` output and rejects missing or tautological
descriptions, undocumented parameters at any nesting depth, missing output schemas,
incomplete annotations, and low selection-guidance coverage. Glama performs
the remaining six-dimension LLM rubric and server-coherence scoring after it
indexes the tagged release.

### npm and MCP Registry publication

Everything after the merge is automatic:

- **`Auto Tag Release`** (`auto-tag.yml`) fires when `package.json` changes on
  `main`. If the version has no existing tag and `server.json` agrees, it
  creates and pushes `vX.Y.Z` and dispatches the `Release` workflow.
- **`Release`** (`release.yml`) re-runs the full CI suite against the tagged
  commit, then runs the publish jobs:
  - **`package-npm`** installs with lifecycle scripts disabled, builds the
    package without OIDC permission, installs that exact tarball into a fresh
    prefix with lifecycle scripts disabled, verifies both executable links,
    initializes stdio, starts the HTTP binary on loopback, and only then uploads
    it as a one-day workflow artifact.
  - **`publish-npm`** downloads and verifies that tarball, then publishes it via
    OIDC trusted publishing with provenance and lifecycle scripts disabled. No
    checkout, dependency install, long-lived npm token, or build step occurs in
    the OIDC-enabled job. It remains idempotent when the version already exists.
  - **`github-release`** publishes a non-prerelease GitHub Release for stable
    tags like `v0.4.0`. Tags containing a hyphen, such as `v0.4.0-beta.1`, are
    published as prereleases and are not marked as the latest release. The
    release body is the matching version section from `CHANGELOG.md` (read
    from the tag itself), with the auto-generated PR list and compare link
    appended; if no section matches, it falls back to the auto-generated
    notes alone.
  - **`publish-registry`** publishes `server.json` to the
    [MCP Registry](https://registry.modelcontextprotocol.io). It authenticates
    via GitHub Actions OIDC, verifies `server.json` matches the tag, and waits
    for the matching npm version (already satisfied since it runs after
    `publish-npm`).

## Publish to LobeHub Marketplace

LobeHub is a manual post-release step. `lhm.plugin.json` is the owner-declared
source for the marketplace listing, so keep its `version` in sync with
`package.json` when cutting a release. Because this is an existing claimed
listing, use `plugin update` (not `plugin publish`) after the npm package and
MCP Registry release are live:

```bash
npm run update:lobehub
```

That script regenerates tools, prompts, resources, and resource templates from
the built server before running `npx -y @lobehub/market-cli plugin update
--dir "$PWD"`. `npm run publish:lobehub` remains a backwards-compatible alias.

The command requires a logged-in LobeHub account with the GitHub `CodesWhat`
org listing claimed. If ownership is lost, reconnect GitHub in LobeHub and
verify that `codeswhat-portkey-admin-mcp` appears in:

```bash
npx -y @lobehub/market-cli plugin list --output json
```

## Refresh Glama

Glama indexes the tagged GitHub repository; it does not consume a separate
versioned manifest from this project. The release must keep `glama.json` at the
repository root with a claimable maintainer, then Glama refreshes the README,
tool schemas, and scores after the release tag reaches GitHub. No source file
should be uploaded through the Glama UI.

After release, verify that the indexed commit, active-development notice,
178-tool inventory, and TDQS score breakdown have refreshed at:

```text
https://glama.ai/mcp/servers/CodesWhat/portkey-admin-mcp
```

If the tagged release has not appeared after Glama's normal crawler window,
use the claimed listing's support/report flow or Glama Discord and provide the
GitHub release URL. The files under `docs/glama-score/` remain dated audit
artifacts; Glama's live Score and Schema tabs are authoritative for a release.

## Post-release catalog verification

Confirm the same version and current Portkey/Prisma AIRS positioning across:

- npm: `https://www.npmjs.com/package/portkey-admin-mcp`
- MCP Registry: `io.github.CodesWhat/portkey-admin-mcp`
- LobeHub: `https://lobehub.com/mcp/codeswhat-portkey-admin-mcp`
- Glama: `https://glama.ai/mcp/servers/CodesWhat/portkey-admin-mcp`

The release is complete only when npm and the MCP Registry show the new
version, LobeHub has been published manually, and Glama has indexed the new
tagged commit.

### One-time setup: npm Trusted Publisher

`publish-npm` requires a Trusted Publisher configured on npmjs.com for the
`portkey-admin-mcp` package: Package Settings → Trusted Publisher → GitHub
Actions, with organization `CodesWhat`, repository `portkey-admin-mcp`, and
workflow filename `release.yml` and environment `release`. Without it the npm
publish step fails with an auth error. Fix the trusted-publisher configuration,
then rerun the failed workflow jobs. Do not publish locally or create a
replacement tag outside the automated release path.

## Backfill an Existing Tag

Use the `Release` workflow's manual dispatch and pass the existing tag name.
The workflow verifies that the tag exists and is reachable from protected
`main` before publishing. An optional `manifest_ref` may point to a corrected
`server.json`, but that ref must also be reachable from protected `main`.
