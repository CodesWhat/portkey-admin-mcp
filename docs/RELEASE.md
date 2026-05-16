# Release Process

This project uses stable SemVer tags plus GitHub Releases so package registries
and catalog scanners can detect published versions.

## Publish a New Stable Release

1. Update `package.json`, `package-lock.json`, `server.json`, and
   `CHANGELOG.md` for the new version. Keep `server.json`'s top-level
   `version` and `packages[0].version` in sync with `package.json`.
2. Run `npm run ci`.
3. Commit the release changes.
4. Publish the npm package:

   ```bash
   npm publish --access public
   ```

5. Create and push a stable tag:

   ```bash
   git tag v0.4.0
   git push origin v0.4.0
   ```

The `Release` workflow runs two jobs on every pushed `v*` tag:

- **`github-release`** publishes a non-prerelease GitHub Release for stable
  tags like `v0.4.0`. Tags containing a hyphen, such as `v0.4.0-beta.1`, are
  published as prereleases and are not marked as the latest release.
- **`publish-registry`** publishes `server.json` to the
  [MCP Registry](https://registry.modelcontextprotocol.io). It authenticates
  via GitHub Actions OIDC (no secrets required), verifies `server.json`
  matches the tag, and waits for the matching npm version to be available
  before publishing. Publishing npm before pushing the tag (step 4 then 5)
  avoids the wait.

## Backfill an Existing Tag

Use the `Release` workflow's manual dispatch and pass the existing tag name.
The workflow verifies that the tag exists before publishing a GitHub Release.
