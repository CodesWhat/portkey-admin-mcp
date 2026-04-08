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

interface OriginParts {
	protocol: string;
	hostname: string;
	port: string;
}

function parseOriginParts(value: string): OriginParts | null {
	try {
		const url = new URL(value);
		return {
			protocol: url.protocol.toLowerCase(),
			hostname: url.hostname.toLowerCase(),
			port: url.port,
		};
	} catch {
		return null;
	}
}

function normalizeHostWithoutPort(value: string): string {
	return value.trim().toLowerCase().split(":")[0];
}

function isOriginMatch(origin: string, allowedOrigin: string): boolean {
	const originParts = parseOriginParts(origin);
	const allowedParts = parseOriginParts(allowedOrigin);
	if (!originParts || !allowedParts) {
		return false;
	}

	if (
		originParts.protocol !== allowedParts.protocol ||
		originParts.hostname !== allowedParts.hostname
	) {
		return false;
	}

	// If the allow-list entry specifies a port, it must match exactly.
	// Otherwise, allow any origin port for that host/protocol.
	if (allowedParts.port) {
		return originParts.port === allowedParts.port;
	}
	return true;
}

function resolveAllowedOrigins(): string[] {
	const envOrigins = process.env.ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN;
	if (envOrigins) {
		const parsed = parseOrigins(envOrigins);
		if (parsed.length > 0) {
			return parsed;
		}
	}
	return ["http://localhost", "https://localhost"];
}

const ALLOWED_ORIGINS = resolveAllowedOrigins();

export function getAllowedOrigins(): string[] {
	return ALLOWED_ORIGINS;
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
	return allowedOrigins.some((allowed) => isOriginMatch(origin, allowed));
}

/**
 * Check if a host is allowed
 * @public — consumed by tests via dynamic import
 */
export function isAllowedHost(host: string): boolean {
	const allowedOrigins = getAllowedOrigins();
	if (allowedOrigins.includes("*")) {
		return true;
	}
	const hostWithoutPort = normalizeHostWithoutPort(host);

	return allowedOrigins.some((allowed) => {
		const allowedParts = parseOriginParts(allowed);
		if (allowedParts) {
			return allowedParts.hostname === hostWithoutPort;
		}
		return normalizeHostWithoutPort(allowed) === hostWithoutPort;
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
	maxBuckets: number;
}

interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) {
		return fallback;
	}

	const parsed = Number.parseInt(raw.trim(), 10);
	if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) {
		return parsed;
	}

	Logger.warn("Invalid rate limit configuration value; using fallback", {
		metadata: {
			variable: name,
			value: raw,
			fallback,
		},
	});
	return fallback;
}

// Cache rate limit config at module load
const RATE_LIMIT_CONFIG: RateLimitConfig = {
	enabled: process.env.RATE_LIMIT_ENABLED?.trim().toLowerCase() !== "false",
	maxTokens: parsePositiveIntegerEnv("RATE_LIMIT_MAX", 60),
	windowMs: parsePositiveIntegerEnv("RATE_LIMIT_WINDOW_MS", 60000),
	refillRate: parsePositiveIntegerEnv("RATE_LIMIT_REFILL", 60),
	maxBuckets: parsePositiveIntegerEnv("RATE_LIMIT_MAX_BUCKETS", 10000),
};

function getRateLimitConfig(): RateLimitConfig {
	return RATE_LIMIT_CONFIG;
}

// In-memory token buckets (keyed by client identifier)
const buckets = new Map<string, TokenBucket>();
let overflowBucket: TokenBucket | undefined;

function getClientIdentifier(req: Request): string {
	// Use Express's resolved client IP so raw forwarding headers cannot spoof identity.
	return req.ip || "unknown";
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

function getStaleBucketThreshold(config: RateLimitConfig): number {
	return config.windowMs * 2;
}

function cleanupStaleBuckets(now: number, config: RateLimitConfig): void {
	const staleThreshold = getStaleBucketThreshold(config);

	for (const [clientId, bucket] of buckets.entries()) {
		if (now - bucket.lastRefill > staleThreshold) {
			buckets.delete(clientId);
		}
	}

	if (overflowBucket && now - overflowBucket.lastRefill > staleThreshold) {
		overflowBucket = undefined;
	}
}

function resolveBucket(clientId: string, config: RateLimitConfig): TokenBucket {
	const existingBucket = buckets.get(clientId);
	if (existingBucket) {
		return existingBucket;
	}

	const now = Date.now();
	if (buckets.size >= config.maxBuckets) {
		cleanupStaleBuckets(now, config);
	}

	if (buckets.size >= config.maxBuckets) {
		if (!overflowBucket) {
			overflowBucket = {
				tokens: config.maxTokens,
				lastRefill: now,
			};
		}
		return overflowBucket;
	}

	const bucket = {
		tokens: config.maxTokens,
		lastRefill: now,
	};
	buckets.set(clientId, bucket);
	return bucket;
}

function consumeToken(
	clientId: string,
	config: RateLimitConfig,
): { allowed: boolean } {
	const bucket = resolveBucket(clientId, config);

	refillBucket(bucket, config);

	if (bucket.tokens > 0) {
		bucket.tokens -= 1;
		return { allowed: true };
	}

	return { allowed: false };
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

	const { allowed } = consumeToken(clientId, config);

	if (!allowed) {
		const retryAfterMs = Math.ceil(config.windowMs / config.refillRate);

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

/** @public — consumed by tests via dynamic import */
export function getRateLimitBucketCountForTest(): number {
	return buckets.size;
}

// Cleanup old buckets periodically (every 5 minutes).
// unref() prevents this background timer from blocking process shutdown.
const cleanupTimer = setInterval(
	() => {
		cleanupStaleBuckets(Date.now(), getRateLimitConfig());
	},
	5 * 60 * 1000,
);
cleanupTimer.unref();
