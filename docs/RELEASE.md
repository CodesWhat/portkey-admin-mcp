# Release Process

This project uses stable SemVer tags plus GitHub Releases so package registries
and catalog scanners can detect published versions.

## Publish a New Stable Release

1. Update `package.json`, `package-lock.json`, `server.json`, and
   `CHANGELOG.md` for the new version.
2. Run `npm run ci`.
3. Commit the release changes.
4. Create and push a stable tag:

   ```bash
   git tag v0.4.0
   git push origin v0.4.0
   ```

The `Release` workflow publishes a non-prerelease GitHub Release for stable
tags like `v0.4.0`. Tags containing a hyphen, such as `v0.4.0-beta.1`, are
published as prereleases and are not marked as the latest release.

## Backfill an Existing Tag

Use the `Release` workflow's manual dispatch and pass the existing tag name.
The workflow verifies that the tag exists before publishing a GitHub Release.
