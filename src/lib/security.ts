/**
 * Security utilities for MCP Server
 * Origin validation and rate limiting middleware
 */

import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { type AuthPrincipal, getPrincipalOwnerKey } from "./auth.js";
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
	const normalized = value.trim().toLowerCase();
	if (normalized.startsWith("[")) {
		const bracketEnd = normalized.indexOf("]");
		if (bracketEnd < 0) {
			return normalized;
		}
		const remainder = normalized.slice(bracketEnd + 1);
		return remainder === "" || /^:\d+$/.test(remainder)
			? normalized.slice(0, bracketEnd + 1)
			: normalized;
	}
	return normalized.split(":", 1)[0];
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
	return [
		"http://localhost",
		"https://localhost",
		"http://127.0.0.1",
		"https://127.0.0.1",
		"http://[::1]",
		"https://[::1]",
	];
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

/**
 * Express middleware that rejects requests whose Host header is not in the
 * configured allow-list. Pairs with originValidationMiddleware to close the
 * DNS-rebinding gap for unauthenticated (MCP_AUTH_MODE=none) HTTP deployments,
 * where there is no bearer/JWT gate to fall back on.
 */
export function hostValidationMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (req.path === "/health" || req.path === "/ready") {
		next();
		return;
	}

	const host = req.headers.host;
	if (host && !isAllowedHost(host)) {
		Logger.warn("Host validation failed", {
			path: req.path,
			method: req.method,
			metadata: { host, ip: req.ip },
		});
		res.status(403).json({ error: "Forbidden: Host not allowed" });
		return;
	}

	next();
}

// ============================================================================
// Rate Limiting (Token Bucket Algorithm)
// ============================================================================

interface RateLimitConfig {
	enabled: boolean;
	store: "memory" | "redis";
	maxTokens: number;
	windowMs: number;
	refillRate: number;
	maxBuckets: number;
	redisUrl?: string;
	redisKeyPrefix: string;
}

interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

interface RedisEvalClient {
	eval(
		script: string,
		options: { keys: string[]; arguments: string[] },
	): Promise<unknown>;
}

interface RedisRateLimitOptions {
	key: string;
	maxTokens: number;
	windowMs: number;
	refillRate: number;
	now: number;
}

const REDIS_TOKEN_BUCKET_SCRIPT = `
local values = redis.call('HMGET', KEYS[1], 'tokens', 'lastRefill')
local tokens = tonumber(values[1])
local lastRefill = tonumber(values[2])
local maxTokens = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local refillRate = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

if not tokens or not lastRefill then
  tokens = maxTokens
  lastRefill = now
end

local elapsedMs = math.max(0, now - lastRefill)
local tokensToAdd = math.floor((elapsedMs / windowMs) * refillRate)
if tokensToAdd > 0 then
  tokens = math.min(maxTokens, tokens + tokensToAdd)
  lastRefill = now
end

local allowed = 0
if tokens > 0 then
  tokens = tokens - 1
  allowed = 1
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'lastRefill', lastRefill)
redis.call('PEXPIRE', KEYS[1], math.max(windowMs * 2, 1000))
return { allowed, tokens }
`;

export async function consumeRedisRateLimitToken(
	client: RedisEvalClient,
	options: RedisRateLimitOptions,
): Promise<{ allowed: boolean }> {
	const result = await client.eval(REDIS_TOKEN_BUCKET_SCRIPT, {
		keys: [options.key],
		arguments: [
			String(options.maxTokens),
			String(options.windowMs),
			String(options.refillRate),
			String(options.now),
		],
	});
	if (!Array.isArray(result) || result.length < 1) {
		throw new Error("Invalid response from Redis rate-limit script");
	}
	return { allowed: Number(result[0]) === 1 };
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) {
		return fallback;
	}

	const normalized = raw.trim();
	const parsed = /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
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

function isExplicitlyEnabled(value: string | undefined): boolean {
	return /^(1|true|yes)$/i.test(value?.trim() ?? "");
}

function resolveRateLimitStore(): "memory" | "redis" {
	const store = process.env.RATE_LIMIT_STORE?.trim().toLowerCase() || "memory";
	if (store !== "memory" && store !== "redis") {
		throw new Error(
			`Invalid RATE_LIMIT_STORE value: ${store}. Must be 'memory' or 'redis'`,
		);
	}
	return store;
}

function resolveRateLimitRedisUrl(
	store: "memory" | "redis",
): string | undefined {
	if (store !== "redis") {
		return undefined;
	}
	const redisUrl =
		process.env.RATE_LIMIT_REDIS_URL?.trim() ||
		process.env.MCP_REDIS_URL?.trim() ||
		process.env.REDIS_URL?.trim();
	if (!redisUrl) {
		throw new Error(
			"RATE_LIMIT_STORE=redis requires RATE_LIMIT_REDIS_URL, MCP_REDIS_URL, or REDIS_URL",
		);
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(redisUrl);
	} catch {
		throw new Error(
			"Rate-limit Redis URL must be a valid redis:// or rediss:// URL",
		);
	}
	if (!["redis:", "rediss:"].includes(parsedUrl.protocol)) {
		throw new Error("Rate-limit Redis URL must use redis:// or rediss://");
	}
	if (
		process.env.NODE_ENV?.trim().toLowerCase() === "production" &&
		parsedUrl.protocol !== "rediss:"
	) {
		throw new Error("Rate-limit Redis URL must use rediss:// in production");
	}
	return redisUrl;
}

// Cache rate limit config at module load
const rateLimitEnabled =
	process.env.RATE_LIMIT_ENABLED?.trim().toLowerCase() !== "false";
const rateLimitStore = resolveRateLimitStore();
if (
	rateLimitEnabled &&
	rateLimitStore === "memory" &&
	process.env.NODE_ENV?.trim().toLowerCase() === "production" &&
	!isExplicitlyEnabled(process.env.RATE_LIMIT_SINGLE_PROCESS)
) {
	throw new Error(
		"Production in-memory rate limiting requires RATE_LIMIT_SINGLE_PROCESS=true. Use RATE_LIMIT_STORE=redis for multi-instance deployments.",
	);
}
const RATE_LIMIT_CONFIG: RateLimitConfig = {
	enabled: rateLimitEnabled,
	store: rateLimitStore,
	maxTokens: parsePositiveIntegerEnv("RATE_LIMIT_MAX", 60),
	windowMs: parsePositiveIntegerEnv("RATE_LIMIT_WINDOW_MS", 60000),
	refillRate: parsePositiveIntegerEnv("RATE_LIMIT_REFILL", 60),
	maxBuckets: parsePositiveIntegerEnv("RATE_LIMIT_MAX_BUCKETS", 10000),
	redisUrl: resolveRateLimitRedisUrl(rateLimitStore),
	redisKeyPrefix:
		process.env.RATE_LIMIT_REDIS_KEY_PREFIX?.trim() || "mcp:rate-limit",
};

function getRateLimitConfig(): RateLimitConfig {
	return RATE_LIMIT_CONFIG;
}

// In-memory token buckets (keyed by client identifier)
const buckets = new Map<string, TokenBucket>();
let overflowBucket: TokenBucket | undefined;

type RateLimitScope = "authentication" | "principal";

function getClientIdentifier(
	req: Request,
	res: Response,
	scope: RateLimitScope,
): string {
	const principal = res.locals?.authPrincipal as AuthPrincipal | undefined;
	const principalKey =
		scope === "principal" && principal
			? getPrincipalOwnerKey(principal)
			: scope;
	const trustedIp = req.ip || "unknown";
	return createHash("sha256")
		.update(scope, "utf8")
		.update("\0", "utf8")
		.update(principalKey, "utf8")
		.update("\0", "utf8")
		.update(trustedIp, "utf8")
		.digest("hex");
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

interface RateLimitRedisClient extends RedisEvalClient {
	isOpen: boolean;
	connect(): Promise<unknown>;
	close(): Promise<unknown>;
	on(event: "error", listener: (error: unknown) => void): unknown;
}

let rateLimitRedisClient: RateLimitRedisClient | undefined;
let rateLimitRedisConnectPromise: Promise<unknown> | undefined;

async function getRateLimitRedisClient(
	config: RateLimitConfig,
): Promise<RateLimitRedisClient> {
	if (!config.redisUrl) {
		throw new Error("Rate-limit Redis URL is not configured");
	}
	if (!rateLimitRedisClient) {
		const { createClient } = await import("redis");
		rateLimitRedisClient = createClient({
			url: config.redisUrl,
			RESP: 2,
			socket: { keepAliveInitialDelay: 5_000 },
			commandOptions: { timeout: undefined },
		}) as unknown as RateLimitRedisClient;
		rateLimitRedisClient.on("error", (error) => {
			Logger.error("Redis rate-limit store error", {
				metadata: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
		});
	}

	if (!rateLimitRedisClient.isOpen) {
		rateLimitRedisConnectPromise ??= rateLimitRedisClient
			.connect()
			.catch((error) => {
				rateLimitRedisConnectPromise = undefined;
				throw error;
			});
		await rateLimitRedisConnectPromise;
	}

	return rateLimitRedisClient;
}

function applyRateLimitDecision(
	allowed: boolean,
	config: RateLimitConfig,
	req: Request,
	res: Response,
	next: NextFunction,
	clientId: string,
): void {
	if (allowed) {
		next();
		return;
	}

	const retryAfterMs = Math.ceil(config.windowMs / config.refillRate);
	Logger.warn("Rate limit exceeded", {
		path: req.path,
		method: req.method,
		metadata: { clientFingerprint: clientId.slice(0, 16), retryAfterMs },
	});
	res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
	res.status(429).json({ error: "Too Many Requests" });
}

function applyRateLimit(
	scope: RateLimitScope,
	req: Request,
	res: Response,
	next: NextFunction,
): void | Promise<void> {
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
	if (scope === "authentication" && req.path !== "/mcp") {
		next();
		return;
	}

	const clientId = getClientIdentifier(req, res, scope);

	if (config.store === "memory") {
		const { allowed } = consumeToken(clientId, config);
		applyRateLimitDecision(allowed, config, req, res, next, clientId);
		return;
	}

	return (async () => {
		try {
			const client = await getRateLimitRedisClient(config);
			const { allowed } = await consumeRedisRateLimitToken(client, {
				key: `${config.redisKeyPrefix}:${clientId}`,
				maxTokens: config.maxTokens,
				windowMs: config.windowMs,
				refillRate: config.refillRate,
				now: Date.now(),
			});
			applyRateLimitDecision(allowed, config, req, res, next, clientId);
		} catch (error) {
			Logger.error("Rate-limit store unavailable", {
				path: req.path,
				method: req.method,
				metadata: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
			res.status(503).json({ error: "Rate limit service unavailable" });
		}
	})();
}

/**
 * Limits authentication attempts by trusted client IP before credentials are
 * evaluated. This prevents invalid or missing credentials from bypassing the
 * principal-aware limiter.
 */
export function preAuthRateLimitMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void | Promise<void> {
	return applyRateLimit("authentication", req, res, next);
}

/**
 * Limits authenticated work by principal and trusted client IP.
 */
export function rateLimitMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void | Promise<void> {
	return applyRateLimit("principal", req, res, next);
}

export async function closeRateLimitStore(): Promise<void> {
	if (!rateLimitRedisClient) {
		return;
	}
	if (!rateLimitRedisClient.isOpen && rateLimitRedisConnectPromise) {
		try {
			await rateLimitRedisConnectPromise;
		} catch {
			// Ignore connection failures while shutting down.
		}
	}
	if (rateLimitRedisClient.isOpen) {
		await rateLimitRedisClient.close();
	}
	rateLimitRedisClient = undefined;
	rateLimitRedisConnectPromise = undefined;
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
