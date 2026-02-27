/**
 * Factory for OAuth stores. Mirrors createManagedEventStore() pattern.
 */

import type { OAuthStore } from "./types.js";
import { InMemoryOAuthStore } from "./store-memory.js";
import { RedisOAuthStore } from "./store-redis.js";

export type OAuthStoreMode = "memory" | "redis";

export function createOAuthStore(mode: OAuthStoreMode, redisUrl?: string): OAuthStore {
	if (mode === "redis") {
		const url = redisUrl
			|| process.env.MCP_REDIS_URL?.trim()
			|| process.env.REDIS_URL?.trim();

		if (!url) {
			throw new Error(
				"OAUTH_STORE_MODE=redis requires MCP_REDIS_URL (or REDIS_URL) to be set",
			);
		}

		return new RedisOAuthStore(url);
	}

	return new InMemoryOAuthStore();
}
