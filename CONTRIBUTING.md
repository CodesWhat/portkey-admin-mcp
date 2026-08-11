# Contributing to Portkey Admin MCP

Issues and pull requests are welcome. Use a private GitHub security advisory,
not a public issue, for suspected vulnerabilities. See [`SECURITY.md`](SECURITY.md).

## Contribution process

1. Search existing issues and pull requests for related work.
2. Fork the repository and create a focused branch from `main`.
3. Install Node.js 24+ and npm 12, then run `npm install`.
4. Make the change with tests and documentation where required.
5. Run `npm run ci`.
6. Open a pull request describing the problem, the chosen approach, security or
   compatibility effects, and the verification performed.

Maintainers review pull requests and may request changes. A maintainer merges a
change after the required checks and review policy pass. Opening a pull request
does not guarantee that a proposal will be accepted.

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

It runs linting, unused-code analysis, production and test type checks, unit and
contract tests, the build, MCP tool-quality verification, protocol tests, and
README/tool inventory checks.

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
