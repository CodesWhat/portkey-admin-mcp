# Security Best-Practices Report

**Repository:** `portkey-admin-mcp`
**Reviewed:** 2026-07-20
**Commit:** `e2f6cf65b7ac2863060d8600fc3e5028e54dabab`
**Scope:** TypeScript/Node 24 source, Express HTTP transport, MCP authorization and state, outbound Portkey client, Redis event storage, dependencies, container, package contents, and GitHub Actions.

## Executive summary

No critical vulnerability, committed live secret, or directly vulnerable application dependency was confirmed. The original audit identified eight findings: two high, four medium, and two low. All eight are remediated in the current working tree and are covered by regression tests or configuration assertions; final verification results are recorded below.

The two high-priority authorization gaps were:

1. A caller-supplied `?tools=` value overrides the server's configured `PORTKEY_TOOL_DOMAINS` subset instead of being constrained by it.
2. Clerk mode authenticates a JWT but does not authorize the subject, role, organization, workspace, or allowed tool domains. Any valid token for the configured issuer/audience receives the authority of the shared `PORTKEY_API_KEY`.

The remaining issues concerned cross-user session/replay isolation, Portkey credential forwarding across HTTP redirects, sensitive replay data in Redis, supply-chain hardening, distributed rate limiting, and npm-only packages retained in the runtime container. Their original evidence is preserved below for audit traceability.

## Remediation status

| Finding | Status | Implemented control |
|---|---|---|
| SEC-001 | Fixed | Server tool domains are an allowlist; HTTP `?tools=` can only narrow it, with rejection tests for expansion attempts |
| SEC-002 | Fixed | Clerk requires at least one explicit subject/organization/role/permission policy, evaluates all configured constraints, and retains a normalized principal |
| SEC-003 | Fixed | Sessions, memory events, Redis events, leases, and replay cursors are bound to a principal digest; logs use capability fingerprints |
| SEC-004 | Fixed | Credentialed Portkey calls use manual redirects; plaintext and private upstreams require separate explicit opt-ins |
| SEC-005 | Fixed | Production Redis requires TLS, replay payloads use AES-256-GCM, owners are enforced, and default retention is 300 seconds |
| SEC-006 | Fixed | Renovate waits seven days with no automerge; packaging occurs without OIDC and publishing consumes only the verified tarball artifact |
| SEC-007 | Fixed | Production requires explicit single-process memory mode or atomic shared Redis buckets for pre-authentication IP attempts and authenticated principal-plus-IP work |
| SEC-008 | Fixed | The runtime image removes npm/npx and npm's global module tree after installing production dependencies |

## High severity

### SEC-001 — Client-selected tool domains override the configured server subset

**Status:** Fixed in the current working tree.

- **Rule ID:** AUTHZ-ALLOWLIST-001 / EXPRESS-INPUT-001
- **Severity:** High
- **Location:** `src/lib/http-app.ts:232-269`, `src/lib/http-app.ts:726-767`, `src/lib/http-app.ts:857-861`, `src/lib/mcp-server.ts:147-175`, `src/lib/mcp-server.ts:221-224`
- **Evidence:** The HTTP layer accepts any recognized domain from `req.query.tools` and passes it as `options.toolDomains`. `createMcpServer` uses `options.toolDomains ?? parseConfiguredToolDomains()`, so any supplied query value takes precedence over `PORTKEY_TOOL_DOMAINS`/`MCP_TOOL_DOMAINS` rather than being intersected with the configured set. A synthetic runtime check with `PORTKEY_TOOL_DOMAINS=prompts` and requested domains `keys` registered all 11 key tools, including `create_api_key`, and registered no prompt creation tool.
- **Impact:** An authenticated HTTP caller can re-enable sensitive domains that an operator believed were excluded, including key, user, workspace, secret-reference, or other mutation tools. If the shared Portkey credential has the corresponding scopes, this becomes an application-level authorization bypass.
- **Fix:** Resolve the server-configured domain allowlist once, then reject every requested domain outside it. Use the intersection only if client-side catalog narrowing is required. Add stateful and stateless tests proving that `PORTKEY_TOOL_DOMAINS=prompts` rejects `?tools=keys`.
- **Mitigation:** Until fixed, do not rely on tool-domain configuration as a security boundary. Scope `PORTKEY_API_KEY` so excluded operations are rejected by Portkey itself, and avoid exposing dynamic `?tools=` selection on hosted deployments.
- **False-positive notes:** Risk is lower if `PORTKEY_TOOL_DOMAINS` is intentionally only a catalog default and the downstream Portkey key already enforces the exact desired permissions. The code and MCP workflow guide also describe the setting as exposing a focused subset, so operators can reasonably interpret it as a boundary.

### SEC-002 — Clerk mode authenticates users but grants the shared admin identity to all of them

**Status:** Fixed in the current working tree.

- **Rule ID:** AUTHZ-CLAIMS-001
- **Severity:** High
- **Location:** `src/lib/auth.ts:167-191`, `src/lib/auth.ts:202-236`, `src/lib/mcp-server.ts:196-224`, `docs/VERCEL_DEPLOYMENT.md:7-15`, `docs/VERCEL_DEPLOYMENT.md:58-63`
- **Evidence:** `jwtVerify` checks only `issuer`, `audience`, signature, and standard JWT validity. The verified payload is discarded; no `sub`, organization, role, permission, or allowlist decision is made. The request then receives tools backed by one process-wide `PORTKEY_API_KEY`. The deployment guide recommends Clerk for teams.
- **Impact:** Any user able to obtain a valid JWT for the configured audience can exercise the full authority of the shared Portkey key, including destructive administration and API-key issuance/rotation where downstream scopes permit it. A normal application user can therefore become a Portkey administrator.
- **Fix:** Return the verified payload from `verifyClerkToken`, require a stable subject and trusted organization/role/permission claim, attach an immutable principal/authorization context to the request, and enforce a server-side tool/action policy. Prefer per-user or per-role downstream credentials when available.
- **Mitigation:** Restrict the Clerk application to an admin-only user population, use a dedicated audience, keep the Portkey key least-privileged, and deploy separate instances/keys for different trust groups.
- **False-positive notes:** This is an accepted trust model only if every identity that can mint a token for the configured audience is deliberately a full Portkey administrator. That assumption is not stated in the team deployment guidance.

## Medium severity

### SEC-003 — Stateful sessions and replay streams are not bound to the authenticated principal

**Status:** Fixed in the current working tree.

- **Rule ID:** AUTHZ-OBJECT-001
- **Severity:** Medium
- **Location:** `src/lib/http-app.ts:774-803`, `src/lib/http-app.ts:826-846`, `src/lib/http-app.ts:946-1024`, `src/lib/http-app.ts:1080-1123`, `src/lib/http-app.ts:1151-1180`, `src/lib/session-store.ts:17-26`, `src/lib/event-store.ts:282-320`, `src/lib/event-store.ts:356-406`
- **Evidence:** Session lookup and mutation use only the bearer `Mcp-Session-Id`; replay lookup uses only `Last-Event-ID`. Neither `SessionEntry` nor stored Redis events contain an authenticated owner. Raw session IDs are also emitted at info level in `src/lib/http-app.ts:838-846`.
- **Impact:** In Clerk/team deployments, a valid user who obtains another user's session or event ID can interact with, close, or replay that user's MCP stream. Replayed messages can contain admin data or one-time credentials. UUID entropy prevents guessing, but IDs can appear in client telemetry, shared logs, diagnostics, or support bundles.
- **Fix:** Derive a stable principal during authentication, store its opaque digest with each session and replay stream, and enforce equality on every POST/GET/DELETE/replay operation. Stop logging raw capability IDs; log a keyed digest or short correlation identifier instead.
- **Mitigation:** Prefer stateless mode with the event store off for single-request operations, tightly restrict log access, shorten session/event TTLs, and use a separate instance per trust group.
- **False-positive notes:** Static bearer mode intentionally represents one shared principal, so cross-user isolation is not meaningful there. This becomes material when Clerk is used for multiple people or when bearer tokens differ behind another gateway.

### SEC-004 — The Portkey API key follows redirects and can be sent over plaintext HTTP

**Status:** Fixed in the current working tree.

- **Rule ID:** OUTBOUND-CREDENTIAL-001 / EXPRESS-SSRF-001
- **Severity:** Medium
- **Location:** `src/services/base.service.ts:75-98`, `src/services/base.service.ts:135-149`, `src/services/base.service.ts:176-182`, `src/lib/fetch.ts:23-39`, `README.md:195-197`
- **Evidence:** `validateUrl` accepts both `http:` and `https:`. Every request carries `x-portkey-api-key`, while `fetchWithTimeout` leaves Fetch's default `redirect: "follow"` behavior enabled. An isolated Node 24.18.0 test performed during this review confirmed that a custom `x-portkey-api-key` header is forwarded to a different localhost origin after a 302 redirect.
- **Impact:** A compromised/misconfigured upstream, unsafe self-hosted gateway, or plaintext network path can disclose the long-lived Portkey credential to another origin or an on-path observer.
- **Fix:** Default to HTTPS only. Require a separate explicit opt-in for plaintext private gateways. Set `redirect: "manual"` for authenticated outbound calls and, if redirects are required, follow only a small number of same-origin HTTPS redirects after re-validating every target; never forward the credential across origins.
- **Mitigation:** Keep the default `https://api.portkey.ai/v1`, use egress allowlists, and use short-lived/least-privileged credentials for self-hosted gateways.
- **False-positive notes:** The default Portkey URL is HTTPS and controlled by Portkey, so exploitation requires an upstream redirect, environment misconfiguration, compromise, or an intentionally insecure self-hosted deployment.

### SEC-005 — Redis replay persists complete sensitive MCP messages without application-layer protection

**Status:** Fixed in the current working tree.

- **Rule ID:** DATA-AT-REST-001
- **Severity:** Medium
- **Location:** `src/lib/config.ts:130-147`, `src/lib/event-store.ts:240-251`, `src/lib/event-store.ts:282-306`, `src/lib/event-store.ts:356-406`, `src/tools/keys.tools.ts:440-485`, `src/tools/keys.tools.ts:654-680`, `docs/VERCEL_DEPLOYMENT.md:43-50`
- **Evidence:** Redis events store `JSON.stringify(message)` verbatim for a default one-hour TTL. API-key creation and rotation intentionally place one-time secrets in MCP results. Redis configuration accepts `redis://` and the deployment guide uses that scheme as its example; no transport-security check, encryption envelope, or sensitive-result policy is applied.
- **Impact:** Anyone with Redis access, a Redis traffic vantage point on a plaintext connection, or a leaked replay cursor can recover admin responses and potentially newly issued credentials.
- **Fix:** Require `rediss://` for non-loopback production Redis, use ACL-scoped credentials and a dedicated namespace, and encrypt event payloads with a rotating application-held key. Consider disabling persistence/replay for secret-producing tools or storing a non-replayable tombstone after the initial secret response.
- **Mitigation:** Set a much shorter `MCP_EVENT_TTL_SECONDS`, isolate Redis per environment, enable provider-side TLS/encryption and access logging, and exclude key/secret-reference domains from replay-enabled instances.
- **False-positive notes:** The issue does not apply when `MCP_EVENT_STORE=off`. Managed Redis may already provide TLS and disk encryption, but the application does not require or verify either.

### SEC-006 — Automated dependency updates lack a local release-age gate

**Status:** Fixed in the current working tree.

- **Rule ID:** SUPPLY-CHAIN-001
- **Severity:** Medium
- **Location:** `renovate.json:3-15`, `.github/workflows/release.yml:106-188`
- **Evidence:** Renovate automerges lockfile maintenance and non-major devDependency updates; lockfile maintenance explicitly sets `minimumReleaseAge` to `null`, and the devDependency rule has no local minimum. Semgrep reported `renovate-missing-minimum-release-age`. The npm publishing job grants `id-token: write`, runs `npm ci` with lifecycle scripts, then rebuilds and publishes from that workspace.
- **Impact:** A newly compromised dependency release that satisfies the automerge policy can execute during CI/release installation and can tamper with the build that is published. CI success is not a reliable detector for intentionally malicious install/build code.
- **Fix:** Apply a repository-wide release-age delay (for example 7 days), require review for packages with install scripts or build/publish influence, and avoid automatic lockfile updates that introduce versions younger than the delay. Consider producing and attesting an exact tarball in a constrained build job and publishing that reviewed artifact.
- **Mitigation:** Keep SHA-pinned actions, dependency review, immutable lockfiles, npm provenance, and branch protection. Use Renovate grouping/dashboards rather than immediate automerge for high-impact toolchain packages.
- **False-positive notes:** The inherited `CodesWhat/.github` preset may define a global delay for some package rules, but the local `null` and automerge settings make that protection unclear and should be made explicit in this repository.

## Low severity

### SEC-007 — In-memory rate limiting does not provide a deployment-wide abuse limit

**Status:** Fixed in the current working tree.

- **Rule ID:** EXPRESS-AUTH-001 / EXPRESS-DOS-001
- **Severity:** Low
- **Location:** `src/lib/security.ts:233-253`, `src/lib/security.ts:286-371`, `docs/VERCEL_DEPLOYMENT.md:52-56`
- **Evidence:** Token buckets are stored in a process-local `Map`. The Vercel/serverless guide recommends enabling this limiter even though cold starts and horizontal instances create independent buckets.
- **Impact:** A caller can receive a fresh allowance on new instances, and aggregate traffic can exceed the configured limit. This weakens brute-force/abuse and resource-exhaustion protection for a privileged API.
- **Fix:** Enforce the primary limit at the edge/API gateway or use Redis-backed atomic buckets: one keyed by trusted source IP before authentication and another keyed by authenticated principal plus trusted IP afterward. Retain the local limiter only as defense in depth.
- **Mitigation:** Use Vercel/WAF limits and Portkey-side quotas, and keep `MCP_MAX_SESSIONS` conservative.
- **False-positive notes:** The current implementation is adequate for a single long-lived process when `trust proxy` matches the actual proxy topology.

### SEC-008 — The production image retains vulnerable npm-only packages

**Status:** Fixed in the current working tree.

- **Rule ID:** CONTAINER-DEPS-001
- **Severity:** Low (scanner reports include one High CVE)
- **Location:** `Dockerfile:7`, `Dockerfile:27-40`
- **Evidence:** Trivy found no Alpine OS vulnerabilities, but found five advisories in npm's bundled packages under `/usr/local/lib/node_modules/npm/node_modules`: `tar@7.5.15` and `undici@6.26.0`. These include [CVE-2026-53655](https://nvd.nist.gov/vuln/detail/CVE-2026-53655) and scanner-reported [CVE-2026-12151](https://nvd.nist.gov/vuln/detail/CVE-2026-12151). The application's npm dependency tree contains neither package, and Node 24's runtime Fetch uses the fixed Undici 7 line, so direct application reachability was not demonstrated.
- **Impact:** The vulnerable code remains available if npm is invoked inside a compromised or operational container, and it increases scanner noise and post-exploitation surface.
- **Fix:** Move to an updated immutable Node image digest once available, or remove npm/npx and their global module tree from the final runtime image after installing production dependencies. Re-scan the final built image.
- **Mitigation:** The container already runs as non-root and the runtime command invokes only `node`, which substantially lowers exploitability.
- **False-positive notes:** One Trivy Undici record conflicts with current NVD fixed-version metadata, and the affected copy is npm-internal rather than Node's runtime Fetch implementation. Treat the image finding as hardening, not evidence that the HTTP client is directly vulnerable.

## Positive controls observed

- HTTP startup fails closed when authentication mode is `none` unless an explicit local-debug override is set.
- Bearer tokens are compared as fixed-length SHA-256 digests with `timingSafeEqual`.
- Clerk configuration requires HTTPS issuer/JWKS URLs and validates issuer and audience.
- Request size, session capacity, replay concurrency, event TTL, path segments, Redis key identifiers, and query-domain names are bounded/validated.
- Helmet, CORS/origin validation, host validation for unauthenticated local mode, generic JSON-RPC 500 responses, and non-root container execution are present.
- The Portkey API key is not logged, service cache keys use a per-process HMAC, and ordinary request logs omit query values and bodies.
- GitHub Actions are SHA-pinned with least-privilege job permissions; Zizmor and Actionlint reported no findings.
- The npm package dry run contained only `LICENSE`, `README.md`, `package.json`, and the two built entrypoints.

## Verification performed

| Check | Result |
|---|---|
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 0 vulnerabilities |
| Trivy filesystem vulnerability/misconfiguration scan | 0 findings |
| Trivy final runtime-image scan | 0 Alpine OS vulnerabilities; 0 Node.js vulnerabilities |
| Runtime-image inspection | Runs as UID 1001 with Node 24.18.0; npm, npx, and npm's global module tree are absent |
| Gitleaks working directory and full history | No tracked live secret confirmed; the directory scan correctly detected 3 gitignored local credential files and 8 synthetic tracked test/fixture values, while the history scan found 11 synthetic test/fixture hits |
| Semgrep OWASP/Node/TypeScript rules | 0 findings across 113 rules and 108 scanned files |
| Zizmor | No findings (1 ignored result and 16 explicit suppressions) |
| Actionlint | 0 findings |
| Lint, dead-code analysis, source/test typecheck, and build | Passed |
| Repository tests | 296 passed, 0 failed |
| MCP end-to-end tests | 24 passed, 0 failed |
| Live Redis integration tests | 2 passed: encrypted replay and atomic shared rate limiting |
| README tool inventory | 156 tools across 19 files verified |
| npm package dry run | 5 expected files; no local config/secrets |
| Configured domain authorization | Stateful and stateless HTTP regression tests reject requests outside `PORTKEY_TOOL_DOMAINS` |
| Redirect credential behavior | All credentialed HTTP verbs are regression-tested with `redirect: "manual"` |

## Completed remediation order

1. Constrained requested tool domains to the configured server allowlist (SEC-001).
2. Defined and enforced the Clerk authorization model (SEC-002).
3. Bound sessions and replay streams to the authenticated principal (SEC-003).
4. Stopped credentialed redirects and required explicit insecure/private upstream opt-ins (SEC-004).
5. Encrypted Redis replay data, required production TLS, and shortened retention (SEC-005).
6. Applied supply-chain, distributed rate-limit, and runtime-container hardening (SEC-006 through SEC-008).
