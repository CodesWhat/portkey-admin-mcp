// ============================================================================
// Request Path Matching
// ============================================================================
//
// Dependency-free helpers that canonicalize an Express request path and match
// it against the routes this server dispatches. They live in their own leaf
// module so both the auth middleware and the security middleware can share
// them without importing each other (auth needs isMcpRequestPath, security
// needs isMcpRequestPath and isHealthOrReadyPath). Keeping them here breaks the
// auth <-> security import cycle those cross-imports would otherwise create.

/**
 * Lower-cases a request path and strips a single trailing slash, matching how
 * Express's default (non-strict, case-insensitive) router canonicalizes a path
 * before dispatch. The route-matching predicates below compare against this so
 * they stay in sync with the router instead of using exact string equality,
 * which misses the trailing-slash and case forms Express routes to the same
 * handler.
 */
function canonicalizeRequestPath(path: string): string {
	const normalized = path.toLowerCase();
	return normalized.length > 1 && normalized.endsWith("/")
		? normalized.slice(0, -1)
		: normalized;
}

/**
 * Matches the set of request paths Express dispatches to the `/mcp` route
 * handlers: "/mcp", "/mcp/", and any case variant of either. Used by both
 * rate-limit skip predicates and the auth gate so they stay in sync with the
 * router's actual matching behavior.
 */
export function isMcpRequestPath(path: string): boolean {
	return canonicalizeRequestPath(path) === "/mcp";
}

/**
 * Matches the health and readiness probe paths the same way isMcpRequestPath
 * matches the MCP route: case-insensitive and tolerant of a single trailing
 * slash, so the origin/host/rate-limit skips stay in sync with Express's
 * default router, which dispatches "/health/" and "/HEALTH" to the same
 * handler. Exact-string comparison would let those forms fall through into
 * validation and rate limiting, causing spurious probe failures.
 */
export function isHealthOrReadyPath(path: string): boolean {
	const canonical = canonicalizeRequestPath(path);
	return canonical === "/health" || canonical === "/ready";
}
