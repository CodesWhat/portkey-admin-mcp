# Verify a Published Release

Stable npm releases are built from a version tag by
`.github/workflows/release.yml`. The workflow first runs the full CI suite,
builds one npm tarball in a job without OIDC publish permission, and then
publishes that exact artifact with npm Trusted Publishing and provenance.

## Verify npm signatures and provenance

Choose the exact version you plan to run. In a new empty directory, install it
without lifecycle scripts and ask npm to verify registry signatures and
provenance attestations:

```bash
npm init -y
npm install --ignore-scripts --save-exact portkey-admin-mcp@0.11.0
npm audit signatures
```

Replace `0.11.0` with the intended version. A successful audit reports verified
registry signatures and provenance for the installed dependency tree. Treat a
missing or invalid signature or attestation as a failed verification and do not
run that installation.

You can also open the version on
[npm](https://www.npmjs.com/package/portkey-admin-mcp?activeTab=versions), follow
its provenance link, and confirm that the attestation identifies:

- repository `CodesWhat/portkey-admin-mcp`;
- workflow `.github/workflows/release.yml`; and
- the expected version tag and source commit.

The npm provenance attestation connects the registry package to the GitHub
Actions build identity. It does not claim that separately generated GitHub
Release source archives are byte-for-byte identical to the npm tarball.

## Verify project metadata

Confirm that the selected version agrees across these public records:

- the package version shown by `npm view portkey-admin-mcp@0.11.0 version`;
- the matching `v0.11.0` tag and GitHub Release; and
- the version in `package.json` and `server.json` at that tag.

Before publication, the release workflow checks these version relationships,
installs its exact packed archive into a fresh prefix, verifies both executable
links, initializes stdio, and starts the HTTP executable on loopback.
See [the release process](./RELEASE.md) for the maintainer workflow and failure
handling.
