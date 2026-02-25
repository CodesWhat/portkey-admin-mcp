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
		throw new Error(
			"MCP_AUTH_MODE=bearer requires MCP_AUTH_TOKEN to be set",
		);
	}

	if (mode === "clerk") {
		const missing: string[] = [];
		if (!issuer) {
			missing.push("CLERK_ISSUER");
		}
		if (!audience || audience.length === 0) {
			missing.push("CLERK_AUDIENCE");
		}
		if (!jwksUrl) {
			missing.push("CLERK_JWKS_URL");
		}
		if (missing.length > 0) {
			throw new Error(
				`MCP_AUTH_MODE=clerk requires ${missing.join(", ")} to be set`,
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

function extractBearerToken(req: Request): string | null {
	const authHeader = req.headers.authorization;
	if (!authHeader) {
		return null;
	}

	const [scheme, token] = authHeader.split(" ");
	if (scheme !== AUTH_SCHEMES.bearer || !token?.trim()) {
		return null;
	}

	return token.trim();
}

function timingSafeEqual(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);

	if (left.length !== right.length) {
		return false;
	}
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
