import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { Logger } from "./logger.js";
import { isMcpRequestPath } from "./request-path.js";

export type HttpAuthMode = "none" | "bearer" | "clerk";

export interface HttpAuthConfig {
	mode: HttpAuthMode;
	bearerToken?: string;
	jwksUrl?: string;
	issuer?: string;
	audience?: string[];
	allowedSubjects?: string[];
	allowedOrganizationIds?: string[];
	allowedRoles?: string[];
	requiredPermissions?: string[];
}

export interface AuthPrincipal {
	id: string;
	mode: HttpAuthMode;
	subject?: string;
	organizationId?: string;
	roles: string[];
	permissions: string[];
}

export function getPrincipalOwnerKey(principal: AuthPrincipal): string {
	return crypto.createHash("sha256").update(principal.id, "utf8").digest("hex");
}

class ClerkAuthorizationError extends Error {}

const AUTH_SCHEMES = {
	bearer: "Bearer",
} as const;
const ALLOW_UNAUTHENTICATED_HTTP_ENV = "MCP_ALLOW_UNAUTHENTICATED_HTTP";

function parseCsv(raw: string | undefined): string[] | undefined {
	if (!raw) {
		return undefined;
	}
	const parts = raw
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	return parts.length > 0 ? parts : undefined;
}

function resolveClerkJwksUrl(
	jwksUrl: string | undefined,
	issuer: string | undefined,
): string | undefined {
	if (jwksUrl?.trim()) {
		return jwksUrl.trim();
	}
	if (!issuer?.trim()) {
		return undefined;
	}
	return `${issuer.replace(/\/+$/, "")}/.well-known/jwks.json`;
}

function isValidHttpsUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" && Boolean(parsed.hostname);
	} catch {
		return false;
	}
}

function isExplicitlyEnabled(value: string | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	return normalized === "true" || normalized === "1";
}

function getHttpAuthConfigFromEnv(): HttpAuthConfig {
	const mode = (process.env.MCP_AUTH_MODE?.trim().toLowerCase() ||
		"none") as HttpAuthMode;

	if (!["none", "bearer", "clerk"].includes(mode)) {
		throw new Error(
			`Invalid MCP_AUTH_MODE value: ${mode}. Must be 'none', 'bearer', or 'clerk'`,
		);
	}

	const bearerToken = process.env.MCP_AUTH_TOKEN?.trim();
	const issuer = process.env.CLERK_ISSUER?.trim();
	const audience = parseCsv(process.env.CLERK_AUDIENCE);
	const jwksUrl = resolveClerkJwksUrl(
		process.env.CLERK_JWKS_URL?.trim(),
		issuer,
	);
	const allowedSubjects = parseCsv(process.env.CLERK_ALLOWED_SUBJECTS);
	const allowedOrganizationIds = parseCsv(
		process.env.CLERK_ALLOWED_ORGANIZATION_IDS,
	);
	const allowedRoles = parseCsv(process.env.CLERK_ALLOWED_ROLES);
	const requiredPermissions = parseCsv(process.env.CLERK_REQUIRED_PERMISSIONS);

	if (mode === "bearer" && !bearerToken) {
		throw new Error("MCP_AUTH_MODE=bearer requires MCP_AUTH_TOKEN to be set");
	}

	if (mode === "clerk") {
		const missing: string[] = [];
		const invalid: string[] = [];
		if (!issuer) {
			missing.push("CLERK_ISSUER");
		} else if (!isValidHttpsUrl(issuer)) {
			invalid.push("CLERK_ISSUER");
		}
		if (!audience || audience.length === 0) {
			missing.push("CLERK_AUDIENCE");
		}
		if (!jwksUrl) {
			missing.push("CLERK_JWKS_URL");
		} else if (!isValidHttpsUrl(jwksUrl)) {
			invalid.push("CLERK_JWKS_URL");
		}
		if (missing.length > 0 || invalid.length > 0) {
			const issues: string[] = [];
			if (missing.length > 0) {
				issues.push(`missing: ${missing.join(", ")}`);
			}
			if (invalid.length > 0) {
				issues.push(`invalid https URL: ${invalid.join(", ")}`);
			}
			throw new Error(
				`MCP_AUTH_MODE=clerk configuration error (${issues.join("; ")})`,
			);
		}
		if (!allowedSubjects && !allowedOrganizationIds) {
			throw new Error(
				"MCP_AUTH_MODE=clerk requires an identity-bound authorization policy. Set CLERK_ALLOWED_SUBJECTS or CLERK_ALLOWED_ORGANIZATION_IDS. CLERK_ALLOWED_ROLES and CLERK_REQUIRED_PERMISSIONS can narrow the policy but can't authorize on their own.",
			);
		}
	}

	return {
		mode,
		bearerToken,
		jwksUrl,
		issuer,
		audience,
		allowedSubjects,
		allowedOrganizationIds,
		allowedRoles,
		requiredPermissions,
	};
}

let HTTP_AUTH_CONFIG = getHttpAuthConfigFromEnv();

export function getHttpAuthConfig(): HttpAuthConfig {
	return HTTP_AUTH_CONFIG;
}

export function assertSafeHttpAuthConfig(
	config: HttpAuthConfig = getHttpAuthConfig(),
): void {
	if (config.mode !== "none") {
		return;
	}
	if (isExplicitlyEnabled(process.env[ALLOW_UNAUTHENTICATED_HTTP_ENV])) {
		return;
	}
	throw new Error(
		`MCP_AUTH_MODE=none is not allowed for HTTP transport. Set MCP_AUTH_MODE=bearer or MCP_AUTH_MODE=clerk, or explicitly override with ${ALLOW_UNAUTHENTICATED_HTTP_ENV}=true for local-only debugging.`,
	);
}

function extractBearerToken(req: Request): string | null {
	const authHeader = req.headers.authorization;
	if (!authHeader) {
		return null;
	}

	const [scheme, token, ...rest] = authHeader.trim().split(/\s+/);
	if (
		rest.length > 0 ||
		scheme?.toLowerCase() !== AUTH_SCHEMES.bearer.toLowerCase() ||
		!token?.trim()
	) {
		return null;
	}

	return token.trim();
}

function timingSafeEqual(a: string, b: string): boolean {
	// Compare fixed-length digests so token length differences do not short-circuit.
	const left = crypto.createHash("sha256").update(a, "utf8").digest();
	const right = crypto.createHash("sha256").update(b, "utf8").digest();
	return crypto.timingSafeEqual(left, right);
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function resetHttpAuthStateForTest(): void {
	jwksCache.clear();
	HTTP_AUTH_CONFIG = getHttpAuthConfigFromEnv();
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((item) => {
		const normalized = asString(item);
		return normalized ? [normalized] : [];
	});
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

/**
 * Decodes the org-scoped permissions of a Clerk v2 session token, following
 * jwtPayloadParser (parsePermissions and buildOrgPermissions) in
 * https://github.com/clerk/javascript/blob/main/packages/shared/src/jwtPayloadParser.ts
 * and the session token docs at
 * https://clerk.com/docs/guides/sessions/session-tokens (see "Decode o.fpm
 * manually").
 *
 * - `fea` is a comma-separated list of `<scope>:<feature>` entries. Only the
 *   org-scoped ones (`o`, `ou`, `uo`) count, in order.
 * - `o.per` is a comma-separated list of permission names.
 * - `o.fpm` is a comma-separated list of decimal bitmasks, one per org-scoped
 *   feature. Bit N (least significant first) selects the Nth `o.per` entry.
 *
 * Masks are decoded with BigInt so they can be wider than 32 bits. Like
 * Clerk's parser, an invalid mask skips only its own feature, so a valid mask
 * for another feature can still grant. Structurally malformed input (missing
 * claims, a `fea` entry without a scope) grants nothing.
 */
function decodeClerkV2Permissions(
	features: unknown,
	per: unknown,
	fpm: unknown,
): string[] {
	if (
		typeof features !== "string" ||
		typeof per !== "string" ||
		typeof fpm !== "string" ||
		!per ||
		!fpm
	) {
		return [];
	}

	const orgFeatures: string[] = [];
	for (const part of features.split(",")) {
		const entry = part.trim();
		const colon = entry.indexOf(":");
		if (colon === -1) {
			return [];
		}
		const scope = entry.slice(0, colon);
		const feature = entry.slice(colon + 1);
		if (scope === "o" || scope === "ou" || scope === "uo") {
			orgFeatures.push(feature);
		}
	}

	const permissionNames = per.split(",").map((name) => name.trim());
	const masks = fpm.split(",").map((mask) => mask.trim());
	const granted: string[] = [];
	for (const [featureIndex, feature] of orgFeatures.entries()) {
		const rawMask = masks[featureIndex];
		if (!feature || rawMask === undefined || !/^\d+$/.test(rawMask)) {
			continue;
		}
		const mask = BigInt(rawMask);
		for (const [permissionIndex, name] of permissionNames.entries()) {
			if (name && (mask >> BigInt(permissionIndex)) & 1n) {
				granted.push(`org:${feature}:${name}`);
			}
		}
	}
	return granted;
}

export function authorizeClerkClaims(
	payload: JWTPayload,
	config: HttpAuthConfig,
): AuthPrincipal {
	const subject = asString(payload.sub);
	if (!subject) {
		throw new ClerkAuthorizationError("Clerk token is missing a subject");
	}

	let organizationId: string | undefined;
	let roles: string[];
	let permissions: string[];
	if (payload.v === 2) {
		// Session token v2 carries the active organization in the compact `o` claim.
		const organization =
			typeof payload.o === "object" && payload.o !== null
				? (payload.o as Record<string, unknown>)
				: undefined;
		organizationId = asString(organization?.id);
		const role = asString(organization?.rol);
		// Top-level `roles` and `permissions` arrays are custom session-template
		// claims. They merge in alongside the decoded compact claims.
		roles = unique([
			...(role ? [`org:${role}`] : []),
			...asStringArray(payload.roles),
		]);
		permissions = unique([
			...decodeClerkV2Permissions(
				payload.fea,
				organization?.per,
				organization?.fpm,
			),
			...asStringArray(payload.permissions),
		]);
	} else {
		organizationId = asString(payload.org_id);
		roles = unique(
			[asString(payload.org_role), ...asStringArray(payload.roles)].filter(
				(role): role is string => Boolean(role),
			),
		);
		permissions = unique([
			...asStringArray(payload.org_permissions),
			...asStringArray(payload.permissions),
		]);
	}

	if (config.allowedSubjects && !config.allowedSubjects.includes(subject)) {
		throw new ClerkAuthorizationError("Clerk subject is not authorized");
	}
	if (
		config.allowedOrganizationIds &&
		(!organizationId || !config.allowedOrganizationIds.includes(organizationId))
	) {
		throw new ClerkAuthorizationError("Clerk organization is not authorized");
	}
	if (
		config.allowedRoles &&
		!roles.some((role) => config.allowedRoles?.includes(role))
	) {
		throw new ClerkAuthorizationError("Clerk role is not authorized");
	}
	if (
		config.requiredPermissions &&
		!config.requiredPermissions.every((permission) =>
			permissions.includes(permission),
		)
	) {
		throw new ClerkAuthorizationError(
			"Clerk token is missing a required permission",
		);
	}

	return {
		id: `clerk:${config.issuer}:${subject}`,
		mode: "clerk",
		subject,
		organizationId,
		roles,
		permissions,
	};
}

async function verifyClerkToken(
	token: string,
	config: HttpAuthConfig,
): Promise<AuthPrincipal> {
	if (!config.jwksUrl) {
		throw new Error("Missing Clerk JWKS URL configuration");
	}
	if (!config.issuer) {
		throw new Error("Missing Clerk issuer configuration");
	}
	if (!config.audience || config.audience.length === 0) {
		throw new Error("Missing Clerk audience configuration");
	}

	let jwks = jwksCache.get(config.jwksUrl);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(config.jwksUrl));
		jwksCache.set(config.jwksUrl, jwks);
	}

	const { payload } = await jwtVerify(token, jwks, {
		issuer: config.issuer,
		audience: config.audience,
		clockTolerance: "5s",
	});

	// Pending sessions still have unfinished tasks (MFA setup, password reset).
	// https://clerk.com/docs/guides/sessions/manual-jwt-verification
	if (payload.sts === "pending") {
		throw new Error("Clerk session is pending");
	}

	return authorizeClerkClaims(payload, config);
}

/**
 * HTTP auth middleware for MCP endpoints.
 *
 * Modes:
 * - none: no authentication
 * - bearer: static shared token via MCP_AUTH_TOKEN
 * - clerk: JWT verification against Clerk JWKS
 */
export async function mcpAuthMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> {
	// Only protect MCP protocol endpoints; health probes remain unauthenticated.
	// Uses the shared canonical matcher so the auth gate, the rate limiters, and
	// the router agree on exactly which paths are the MCP endpoint (case- and
	// trailing-slash-insensitive, matching Express 5's default routing).
	if (!isMcpRequestPath(req.path)) {
		next();
		return;
	}

	const config = getHttpAuthConfig();
	if (config.mode === "none") {
		res.locals.authPrincipal = {
			id: "anonymous",
			mode: "none",
			roles: [],
			permissions: [],
		} satisfies AuthPrincipal;
		next();
		return;
	}

	const token = extractBearerToken(req);
	if (!token) {
		res.status(401).json({
			error: "Unauthorized: Missing or invalid Authorization Bearer token",
		});
		return;
	}

	try {
		let principal: AuthPrincipal;
		if (config.mode === "bearer") {
			if (!config.bearerToken || !timingSafeEqual(token, config.bearerToken)) {
				throw new Error("Bearer token mismatch");
			}
			principal = {
				id: `bearer:${crypto.createHash("sha256").update(token, "utf8").digest("hex")}`,
				mode: "bearer",
				roles: [],
				permissions: [],
			};
		} else {
			principal = await verifyClerkToken(token, config);
		}

		res.locals.authPrincipal = principal;
		next();
	} catch (error) {
		Logger.warn("MCP auth failed", {
			method: req.method,
			path: req.path,
			metadata: {
				mode: config.mode,
				reason: error instanceof Error ? error.message : "Unknown error",
			},
		});

		if (error instanceof ClerkAuthorizationError) {
			res.status(403).json({ error: "Forbidden: Principal is not authorized" });
			return;
		}

		res.status(401).json({ error: "Unauthorized: Token validation failed" });
	}
}
