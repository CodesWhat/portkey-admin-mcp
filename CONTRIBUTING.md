# Contributing to Portkey Admin MCP

Issues and pull requests are welcome. Use a private GitHub security advisory,
not a public issue, for suspected vulnerabilities. See [`SECURITY.md`](SECURITY.md).

## Contribution process

1. Search existing issues and pull requests for related work.
2. Fork the repository and create a focused branch from the active `dev/<minor>`
   line, currently `dev/0.14`.
3. Install Node.js 24+, npm 12, and the free [Qlty CLI](https://docs.qlty.sh/cli/quickstart), then run `npm install`. Qlty Cloud login is not required for CLI checks.
4. Make the change with tests and documentation where required.
5. Run `npm run ci`.
6. Open a pull request into that development line describing the problem, the
   chosen approach, security or compatibility effects, and the verification
   performed.

Maintainers review pull requests and may request changes. A maintainer merges a
change after the required checks and review policy pass. Opening a pull request
does not guarantee that a proposal will be accepted.

Maintainers schedule CodeRabbit reviews explicitly. Automatic reviews and reviews
on each push are disabled. Maintainers request an incremental review after a fix
batch, and merge only after the required checks and review policy pass.
Ordinary dependency updates await dashboard approval; urgent security updates
retain their existing exception.

Maintainers promote the reviewed development line to protected `main` through
a separate pull request. Version changes on `main` start the automated release
flow. [The release guide](docs/RELEASE.md) owns the active-line and promotion
procedure; Renovate targets the same development line. A new minor line starts
when its release scope is assigned, rather than from an assumed next version.

## Acceptable contributions

- Keep changes focused. Do not mix unrelated refactoring into a fix or feature.
- Use TypeScript and the existing ESM, service, schema, and tool-registration
  patterns.
- Keep tool names and input contracts backwards compatible unless the change is
  explicitly approved as a breaking release.
- Run Biome rather than hand-formatting TypeScript or JSON.
- Add automated tests for major new functionality and regression tests for bug
  fixes where a stable reproducer is possible.
- Update `ENDPOINTS.md`, the README, roadmap, or deployment documentation when
  public behavior changes.
- Never commit API keys, tokens, `.env` files, production data, or Vercel
  environment exports.
- Keep dependencies necessary and review their license, maintenance, and
  security impact before adding them.

The complete local gate is:

```bash
npm run ci
```

It runs Qlty CLI checks, linting, unused-code analysis, production and test type checks, unit and
contract tests, the build, MCP tool-quality verification, protocol tests, and
README/tool inventory checks.

The pre-commit hook keeps the staged Biome check. Pre-push also runs
`npm run quality`, which checks all tracked files with Qlty's configured lint
and security plugins and fails on findings or tool errors. CI runs that same
command inside the existing required `checks` job. `qlty smells --all` reports
duplication and complexity locally and in CI; those existing findings remain
advisory.
Each CI run publishes `quality-reports` artifacts containing the local check
results, duplication/complexity report, and metrics. These reports identify
the analyzed commit through the workflow run and are retained for 14 days.

Qlty Cloud still owns the hosted maintainability badge and hosted issue
history. Coverage goes to Codecov instead: the separate Coverage workflow
uploads the report there on every PR and push, the status checks are
informational, and the coverage badge and PR comparison come from Codecov.
Cloud analysis limits do not affect the standalone CLI or the 80% coverage
floor enforced by GitHub Actions. No supported import of local `check`, `smells`, or `metrics`
results was found in the [CLI documentation](https://docs.qlty.sh/cli-vs-cloud)
or the [public API](https://api.qlty.sh/openapi.json), so local enforcement does
not refresh the official maintainability badge. Keeping that badge current
still requires Cloud analysis. See the [analysis-minute billing rules](https://docs.qlty.sh/cloud/billing/analysis-minutes).
The required check names remain `actionlint`, `dependency-review`, and `checks`.

## Commit messages

Use Conventional Commits:

```text
<type>(<optional-scope>): <imperative description>
```

Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, and
`chore`. Keep the subject concise, lowercase, and without a trailing period.

## License

By contributing, you agree that your contribution is licensed under the
repository's [MIT License](LICENSE).
