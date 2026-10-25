import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "redis";
import { consumeRedisRateLimitToken } from "../src/lib/security.js";

const redisUrl = process.env.MCP_REDIS_TEST_URL ?? "redis://127.0.0.1:6379";
const redisAvailabilityTimeoutMs = 1_000;

async function redisIsAvailable(): Promise<boolean> {
	const client = createClient({
		url: redisUrl,
		commandOptions: { timeout: redisAvailabilityTimeoutMs },
		socket: {
			connectTimeout: redisAvailabilityTimeoutMs,
			socketTimeout: redisAvailabilityTimeoutMs,
			reconnectStrategy: false,
		},
	});
	client.on("error", () => {});
	try {
		await client.connect();
		await client.ping();
		return true;
	} catch (error) {
		if (process.env.CI) {
			throw error;
		}
		return false;
	} finally {
		if (client.isOpen) {
			client.destroy();
		}
	}
}

test("Redis rate limiting consumes a shared bucket atomically", {
	skip: !(await redisIsAvailable()) && "Redis is unavailable",
}, async () => {
	const client = createClient({ url: redisUrl });
	const key = `portkey-mcp:test:rate-limit:${randomUUID()}`;
	await client.connect();

	try {
		const decisions = await Promise.all(
			Array.from({ length: 8 }, () =>
				consumeRedisRateLimitToken(client, {
					key,
					maxTokens: 1,
					windowMs: 60_000,
					refillRate: 1,
					now: Date.now(),
				}),
			),
		);

		assert.equal(decisions.filter((decision) => decision.allowed).length, 1);
	} finally {
		await client.del(key);
		await client.close();
	}
});
