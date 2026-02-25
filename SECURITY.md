# Security Policy

## Supported Versions

The latest `main` branch is supported for security fixes.

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected vulnerabilities.

Instead, report privately to the maintainers and include:

- affected version/commit
- reproduction steps
- impact assessment
- suggested fix (if available)

## Secrets and Credentials

This repository is intended to be safe for public hosting.

Rules:

- Never commit API keys, tokens, or `.env` files.
- Store production secrets in your platform secret manager (for example Vercel Environment Variables).
- Rotate leaked credentials immediately.

See deployment hardening guidance:

- [`docs/VERCEL_DEPLOYMENT.md`](./docs/VERCEL_DEPLOYMENT.md)
