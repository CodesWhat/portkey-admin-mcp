# Portkey Admin MCP Security Assurance Case

Last reviewed: 2026-08-11

This document maps the project's security requirements to its threat model,
implementation controls, and public verification evidence. It complements
[`SECURITY.md`](SECURITY.md) and the deployment guidance in
[`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md).

## Security requirements and limits

Portkey Admin MCP is intended to:

- keep Portkey credentials out of MCP tool schemas, logs, cache keys, and client
  responses;
- authenticate hosted HTTP transports by default and require an explicit local
  development acknowledgement to run them without authentication;
- validate MCP tool input before constructing Portkey API requests;
- encode path segments and construct query parameters without string injection;
- bound request bodies, rate-limit clients, and constrain replay state; and
- publish npm and MCP Registry releases only after the tagged source passes the
  complete CI gate.

The server acts with the scopes of the configured Portkey API key. It cannot
reduce permissions that Portkey itself grants to that key. A client allowed to
invoke administrative write tools can change the corresponding Portkey tenant.
Operators must use least-privilege keys, restrict exposed tools with
`PORTKEY_TOOL_DOMAINS`, and protect the MCP transport.

## Threat model and trust boundaries

Threat actors include an unauthenticated HTTP client, an authenticated but
over-privileged MCP client, a caller supplying malicious tool arguments, hostile
or malformed Portkey responses, a compromised Redis or hosting environment, and
a contributor or dependency attempting to alter a release.

The principal trust boundaries are:

1. **MCP client to transport.** Stdio inherits local process access. Hosted HTTP
   crosses an authentication, origin, rate-limit, and request-size boundary.
2. **Tool arguments to service request.** Zod schemas and cross-field validation
   turn untrusted JSON into encoded paths, query parameters, and request bodies.
3. **Service to Portkey API.** The configured key crosses to an external admin
   API. Responses are untrusted and may contain tenant data.
4. **HTTP process to Redis and Clerk.** Hosted session, replay, rate-limit, and
   identity state cross external-service boundaries and require TLS and scoped
   credentials.
5. **Source to package and registry entry.** Review, CI, a prebuilt tarball, OIDC
   publication, provenance, and catalog verification protect releases.

## Claims and evidence

### Fail-safe transport defaults and complete mediation

The HTTP server requires bearer or Clerk authentication by default. Deliberate
unauthenticated local testing requires `MCP_ALLOW_UNAUTHENTICATED_HTTP=true`.
Authentication, origin handling, request limits, rate limiting, and security
headers are applied by the shared HTTP application before MCP requests reach
tool handlers.

Evidence: [`src/lib/http-app.ts`](src/lib/http-app.ts),
[`tests/http-server.test.ts`](tests/http-server.test.ts),
[`tests/auth-clerk.test.ts`](tests/auth-clerk.test.ts), and the configuration in
[`README.md`](README.md).

### Input validation and credential handling

Registered tools use explicit schemas, descriptions, and annotations. Cross-
field rules are normalized into the same error envelope. Path segments are
encoded, query parameters are constructed from validated values, and service
errors are converted without exposing configured credentials. The in-process
service cache stores a SHA-256 key digest rather than a plaintext API key.

Evidence: [`src/tools/`](src/tools), [`src/services/`](src/services),
[`src/lib/`](src/lib), [`tests/security.test.ts`](tests/security.test.ts), and
the tool-specific test suites under [`tests/`](tests).

### Least privilege, hosted state, and secrets

Tool domains can be restricted at startup. Deployment guidance requires exact
origins, authenticated production transports, TLS Redis connections, separate
environment credentials, short replay retention, and secrets stored outside the
repository. Redis replay records are encrypted when configured for stateless
hosted operation.

Evidence: [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md),
[`SECURITY.md`](SECURITY.md), and configuration tests in
[`tests/config.test.ts`](tests/config.test.ts).

### Test, dependency, and release controls

CI applies Biome, unused-code analysis, production and test type checks,
dependency review, unit and contract tests, build verification, MCP protocol
tests, release-readiness checks, and tool-definition quality checks. The release
workflow re-runs CI for the tag, builds a tarball without publication authority,
and passes that exact artifact to an OIDC-enabled npm publish job with provenance.
The MCP Registry publish also uses GitHub OIDC.

Evidence: [`.github/workflows/ci.yml`](.github/workflows/ci.yml),
[`.github/workflows/release.yml`](.github/workflows/release.yml),
[`docs/RELEASE.md`](docs/RELEASE.md), and the public
[release history](https://github.com/CodesWhat/portkey-admin-mcp/releases).

## Residual risk

A stolen Portkey key or authorized MCP identity can perform every operation its
scopes allow. Portkey API changes may create semantic drift before fixtures and
contracts detect it. Some enterprise-only endpoints cannot be live-recorded
with the available test account, as documented in [`ROADMAP.md`](ROADMAP.md).
Operators remain responsible for least-privilege scopes, transport access,
credential rotation, Redis and identity-provider security, and reviewing tool
domains before deployment.
