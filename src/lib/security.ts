/**
 * Security utilities for MCP Server
 * Origin validation and rate limiting middleware
 */

import type { NextFunction, Request, Response } from "express";
import { Logger } from "./logger.js";

// ============================================================================
// Origin Validation
// ============================================================================

function parseOrigins(raw: string): string[] {
	return raw
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
}

export function getAllowedOrigins(): string[] {
	const envOrigins = process.env.ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN;
	if (envOrigins) {
		const parsed = parseOrigins(envOrigins);
		if (parsed.length > 0) {
			return parsed;
		}
	}
	return ["http://localhost", "https://localhost"];
}

/**
 * Validate if the origin is in the allowed list
 */
export function validateOrigin(origin: string | undefined): boolean {
	if (!origin) {
		return true; // Allow requests without origin (e.g., server-to-server, CLI)
	}

	const allowedOrigins = getAllowedOrigins();
	if (allowedOrigins.includes("*")) {
		return true;
	}
	const normalizedOrigin = origin.toLowerCase();

	return allowedOrigins.some((allowed) => {
		const normalizedAllowed = allowed.toLowerCase();
		// Exact match
		if (normalizedAllowed === normalizedOrigin) {
			return true;
		}
		// Check if origin starts with allowed (for ports like localhost:3000)
		if (normalizedOrigin.startsWith(normalizedAllowed)) {
			const remaining = normalizedOrigin.slice(normalizedAllowed.length);
			// Must be followed by a port or nothing
			return remaining === "" || remaining.startsWith(":");
		}
		return false;
	});
}

/**
 * Check if a host is allowed
 */
export function isAllowedHost(host: string): boolean {
	const allowedOrigins = getAllowedOrigins();
	if (allowedOrigins.includes("*")) {
		return true;
	}
	const normalizedHost = host.toLowerCase();

	return allowedOrigins.some((allowed) => {
		try {
			const url = new URL(allowed.toLowerCase());
			// Match hostname (ignoring port in host check)
			const hostWithoutPort = normalizedHost.split(":")[0];
			return url.hostname === hostWithoutPort;
		} catch {
			// If not a valid URL, do direct comparison
			return allowed.includes(normalizedHost);
		}
	});
}

/**
 * Express middleware for origin validation
 */
export function originValidationMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	// Skip for health/ready endpoints
	if (req.path === "/health" || req.path === "/ready") {
		next();
		return;
	}

	const origin = req.headers.origin as string | undefined;

	if (!validateOrigin(origin)) {
		Logger.warn("Origin validation failed", {
			path: req.path,
			method: req.method,
			metadata: { origin, ip: req.ip },
		});
		res.status(403).json({ error: "Forbidden: Origin not allowed" });
		return;
	}

	next();
}

// ============================================================================
// Rate Limiting (Token Bucket Algorithm)
// ============================================================================

interface RateLimitConfig {
	enabled: boolean;
	maxTokens: number;
	windowMs: number;
	refillRate: number;
}

interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

// Cache rate limit config at module load
const RATE_LIMIT_CONFIG: RateLimitConfig = {
	enabled: process.env.RATE_LIMIT_ENABLED !== "false",
	maxTokens: Number.parseInt(process.env.RATE_LIMIT_MAX || "60", 10),
	windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
	refillRate: Number.parseInt(process.env.RATE_LIMIT_REFILL || "60", 10),
};

function getRateLimitConfig(): RateLimitConfig {
	return RATE_LIMIT_CONFIG;
}

// In-memory token buckets (keyed by client identifier)
const buckets = new Map<string, TokenBucket>();

function getClientIdentifier(req: Request): string {
	// Use IP address as client identifier
	return (
		(req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
		req.ip ||
		"unknown"
	);
}

function refillBucket(bucket: TokenBucket, config: RateLimitConfig): void {
	const now = Date.now();
	const elapsedMs = now - bucket.lastRefill;
	const tokensToAdd = Math.floor(
		(elapsedMs / config.windowMs) * config.refillRate,
	);

	if (tokensToAdd > 0) {
		bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
		bucket.lastRefill = now;
	}
}

function consumeToken(clientId: string, config: RateLimitConfig): boolean {
	let bucket = buckets.get(clientId);

	if (!bucket) {
		bucket = {
			tokens: config.maxTokens,
			lastRefill: Date.now(),
		};
		buckets.set(clientId, bucket);
	}

	refillBucket(bucket, config);

	if (bucket.tokens > 0) {
		bucket.tokens -= 1;
		return true;
	}

	return false;
}

/**
 * Express middleware for rate limiting using token bucket algorithm
 */
export function rateLimitMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const config = getRateLimitConfig();

	// Skip if rate limiting is disabled
	if (!config.enabled) {
		next();
		return;
	}

	// Skip for health/ready endpoints
	if (req.path === "/health" || req.path === "/ready") {
		next();
		return;
	}

	const clientId = getClientIdentifier(req);

	if (!consumeToken(clientId, config)) {
		const bucket = buckets.get(clientId);
		const retryAfterMs = bucket
			? Math.ceil(config.windowMs / config.refillRate)
			: config.windowMs;

		Logger.warn("Rate limit exceeded", {
			path: req.path,
			method: req.method,
			metadata: { clientId, retryAfterMs },
		});

		res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
		res.status(429).json({ error: "Too Many Requests" });
		return;
	}

	next();
}

// Cleanup old buckets periodically (every 5 minutes).
// unref() prevents this background timer from blocking process shutdown.
const cleanupTimer = setInterval(
	() => {
		const now = Date.now();
		const config = getRateLimitConfig();
		const staleThreshold = config.windowMs * 2;

		for (const [clientId, bucket] of buckets.entries()) {
			if (now - bucket.lastRefill > staleThreshold) {
				buckets.delete(clientId);
			}
		}
	},
	5 * 60 * 1000,
);
cleanupTimer.unref();
