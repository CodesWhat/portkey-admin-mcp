import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Logger } from "./logger.js";

export type HttpAuthMode = "none" | "bearer" | "clerk";

export interface HttpAuthConfig {
	mode: HttpAuthMode;
	bearerToken?: string;
	jwksUrl?: string;
	issuer?: string;
	audience?: string[];
}

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
	}

	return {
		mode,
		bearerToken,
		jwksUrl,
		issuer,
		audience,
	};
}

const HTTP_AUTH_CONFIG = getHttpAuthConfigFromEnv();

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

async function verifyClerkToken(
	token: string,
	config: HttpAuthConfig,
): Promise<void> {
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

	await jwtVerify(token, jwks, {
		issuer: config.issuer,
		audience: config.audience,
		clockTolerance: "5s",
	});
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
	if (!req.path.startsWith("/mcp")) {
		next();
		return;
	}

	const config = getHttpAuthConfig();
	if (config.mode === "none") {
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
		if (config.mode === "bearer") {
			if (!config.bearerToken || !timingSafeEqual(token, config.bearerToken)) {
				throw new Error("Bearer token mismatch");
			}
		} else {
			await verifyClerkToken(token, config);
		}

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

		res.status(401).json({ error: "Unauthorized: Token validation failed" });
	}
}
