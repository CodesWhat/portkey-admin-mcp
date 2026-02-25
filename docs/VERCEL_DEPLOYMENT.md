# Vercel Deployment Guide (Public Repo Safe)

This guide is the canonical setup for hosting this MCP server on Vercel in 2026.

## Recommended Architecture

- Runtime: Vercel Node.js Function (`api/index.ts`)
- Transport: Streamable HTTP (`/mcp`)
- Session mode: `stateless`
- Event store: `redis`
- Auth: `clerk` (preferred for teams) or `bearer` (internal-only)

Why: serverless instances scale and restart; stateless + Redis keeps resumability reliable across instances.

## 1. Prerequisites

- Portkey Admin API key with required scopes
- Redis instance URL (for example Upstash Redis or any managed Redis)
- Vercel project connected to this repository
- Optional but recommended: Clerk app for JWT auth

## 2. Verify Repo Files

These files should already exist:

- `api/index.ts`
- `vercel.json`

`vercel.json` rewrites these routes to the function:

- `/`
- `/mcp`
- `/health`
- `/ready`
- `/auth/info`

## 3. Configure Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

Required:

- `PORTKEY_API_KEY`
- `MCP_SESSION_MODE=stateless`
- `MCP_EVENT_STORE=redis`
- `MCP_REDIS_URL=redis://...`
- `ALLOWED_ORIGINS=https://your-app-domain`
- `MCP_TRUST_PROXY=true`

Recommended:

- `MCP_READY_CHECK_MODE=portkey`
- `RATE_LIMIT_ENABLED=true`

Auth option A (recommended for teams): Clerk JWT

- `MCP_AUTH_MODE=clerk`
- `CLERK_ISSUER=https://<your-clerk-domain>`
- `CLERK_AUDIENCE=<your-audience>` (optional, but recommended)
- `CLERK_JWKS_URL=...` (optional; auto-derived from issuer if omitted)

Auth option B (internal shared token):

- `MCP_AUTH_MODE=bearer`
- `MCP_AUTH_TOKEN=<long-random-secret>`

Do not set:

- `MCP_TLS_KEY_PATH`
- `MCP_TLS_CERT_PATH`
- `MCP_TLS_CA_PATH`

Vercel terminates HTTPS at the edge.

## 4. Deploy

Use Vercel dashboard or CLI:

```bash
vercel
vercel --prod
```

After deploy, your endpoint is:

- `https://<your-project>.vercel.app/mcp`

## 5. Post-Deploy Checks

Unauthenticated endpoints:

```bash
curl -sS https://<your-project>.vercel.app/health
curl -sS https://<your-project>.vercel.app/ready
curl -sS https://<your-project>.vercel.app/auth/info
```

MCP endpoint check:

```bash
MCP_TEST_BASE_URL=https://<your-project>.vercel.app \
MCP_TEST_BEARER_TOKEN=<token-if-using-bearer> \
npm run test:http
```

If using Clerk auth, provide a valid Clerk JWT in:

- `MCP_TEST_AUTH_HEADER='Authorization: Bearer <clerk-jwt>'`

## 6. Public Repo Security Checklist

Treat this as required before making the repo public.

1. Never commit secrets

- Keep `.env` local only (already gitignored).
- Never commit Vercel env exports.
- Never paste real keys in README, issues, or PR comments.

2. Assume key leakage can happen

- Rotate leaked keys immediately in Portkey/Clerk/Redis.
- Prefer short-lived or scoped credentials where supported.

3. Keep auth enabled in production

- Do not run `MCP_AUTH_MODE=none` in hosted environments.

4. Restrict origins

- Set exact domains in `ALLOWED_ORIGINS`.
- Avoid `*` except temporary local debugging.

5. Use least-privilege Portkey API scopes

- Only grant scopes this server actually needs for your workflows.

6. Enable repository protections

- Enable GitHub secret scanning and push protection.
- Require PR reviews before merge to `main`.

7. Keep dependencies current

- Run `npm audit` regularly.
- Patch `jose`, `express`, and `redis` updates promptly.

## 7. Limits and Expected Behavior

- Some Portkey endpoints can still return `403 AB03` if key scopes are missing.
- Vercel Functions are request-duration constrained; this repo sets `maxDuration` in `vercel.json`.
- WebSockets are not required for this server; use Streamable HTTP/SSE.

## 8. Team Operations

For team access:

- Use one shared Vercel project per environment (`staging`, `production`).
- Manage secrets in Vercel project envs, not in local files.
- Keep each environment on a separate Portkey key and Redis namespace.

Suggested prod naming:

- `MCP_REDIS_KEY_PREFIX=portkey-admin-mcp:prod`
- `MCP_REDIS_KEY_PREFIX=portkey-admin-mcp:staging`
