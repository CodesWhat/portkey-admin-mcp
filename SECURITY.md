# Security Policy

## Supported Versions

The latest `main` branch is supported for security fixes.

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected vulnerabilities.

Preferred private channel:

- GitHub private vulnerability reporting:
  `https://github.com/CodesWhat/portkey-admin-mcp/security/advisories/new`

If you cannot use GitHub advisories, contact maintainers privately through your organization's established security channel.

Include:

- affected version/commit
- reproduction steps
- impact assessment
- suggested fix (if available)

Response expectations:

- Initial acknowledgement target: within 3 business days
- Status update target: within 7 business days

## Secrets and Credentials

This repository is intended to be safe for public hosting.

Rules:

- Never commit API keys, tokens, or `.env` files.
- Store production secrets in your platform secret manager (for example Vercel Environment Variables).
- Rotate leaked credentials immediately.

See deployment hardening guidance:

- [`docs/VERCEL_DEPLOYMENT.md`](./docs/VERCEL_DEPLOYMENT.md)

## Implementation notes (updated 2026-06-11)

The following describes the current security posture of the HTTP server (`src/lib/http-app.ts`) and service layer.

**HSTS.** The `Strict-Transport-Security` header is only emitted when `config.tls.enabled` is true — i.e., when the app is serving native HTTPS. When TLS is handled externally (reverse proxy, Vercel, etc.) the header is suppressed to avoid downgrade issues in mixed-mode deployments. There is no HSTS header in plain-HTTP mode.

**`/auth/info` endpoint.** This endpoint is intentionally unauthenticated to support client bootstrap (a connecting MCP client must discover auth mode and endpoints before it can obtain a token). The response is limited to: `mode`, `sessionMode`, `eventStoreMode`, `mcpEndpoint`, Clerk config boolean flags (`issuerConfigured`, `jwksConfigured`, `audienceConfigured`), and TLS state. Redis connection details, internal config, and key material are not included.

**Service cache keys.** API keys are stored as `sha256(apiKey)` Map keys in the in-process service cache. Plaintext key material is not retained in the Map after the initial lookup resolves the cache entry.
