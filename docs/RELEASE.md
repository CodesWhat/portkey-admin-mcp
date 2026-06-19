# Release Process

This project uses stable SemVer tags plus GitHub Releases so package registries
and catalog scanners can detect published versions.

## Publish a New Stable Release (automated)

1. On a dev branch, update `package.json`, `package-lock.json`, `server.json`,
   and `CHANGELOG.md` for the new version. Keep `server.json`'s top-level
   `version` and `packages[0].version` in sync with `package.json`.
2. Run `npm run ci`.
3. Open a PR and merge it to `main`.

Everything after the merge is automatic:

- **`Auto Tag Release`** (`auto-tag.yml`) fires when `package.json` changes on
  `main`. If the version has no existing tag and `server.json` agrees, it
  creates and pushes `vX.Y.Z` and dispatches the `Release` workflow.
- **`Release`** (`release.yml`) re-runs the full CI suite against the tagged
  commit, then runs three publish jobs:
  - **`publish-npm`** publishes to npm via OIDC trusted publishing with
    provenance attestation — no npm token is stored in the repo or CI. It
    verifies `package.json` matches the tag and is idempotent (skips if the
    version is already on npm). `prepublishOnly` re-runs `npm run ci` as a
    final gate.
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

LobeHub is a manual post-release step. `lhm.plugin.json` is the source for the
marketplace listing, so keep its `version` in sync with `package.json` when
cutting a release. After the npm package and MCP Registry release are live,
publish the LobeHub version:

```bash
npm run publish:lobehub
```

The command requires a logged-in LobeHub account with the GitHub `CodesWhat`
org listing claimed. If ownership is lost, reconnect GitHub in LobeHub and
verify that `codeswhat-portkey-admin-mcp` appears in:

```bash
npx -y @lobehub/market-cli plugin list --output json
```

### One-time setup: npm Trusted Publisher

`publish-npm` requires a Trusted Publisher configured on npmjs.com for the
`portkey-admin-mcp` package: Package Settings → Trusted Publisher → GitHub
Actions, with organization `CodesWhat`, repository `portkey-admin-mcp`, and
workflow filename `release.yml` (no environment). Without it the npm publish
step fails with an auth error and the manual fallback below applies.

## Manual Fallback

If the automation is unavailable, the old flow still works: `npm publish
--access public` locally from the release commit, then `git tag vX.Y.Z &&
git push origin vX.Y.Z` — the `Release` workflow picks the tag up from there
(`publish-npm` skips because the version already exists on npm).

## Backfill an Existing Tag

Use the `Release` workflow's manual dispatch and pass the existing tag name.
The workflow verifies that the tag exists before publishing a GitHub Release.
