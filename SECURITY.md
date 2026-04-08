# Security Policy

## Supported Versions

The latest `main` branch is supported for security fixes.

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected vulnerabilities.

Preferred private channel:

- GitHub private vulnerability reporting:
  `https://github.com/s-b-e-n-s-o-n/portkey-admin-mcp/security/advisories/new`

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
