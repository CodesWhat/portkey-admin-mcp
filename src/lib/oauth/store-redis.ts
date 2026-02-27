/**
 * Redis-backed OAuth store for production / Vercel deployment.
 * Same lazy-connect pattern as RedisEventStore in event-store.ts.
 */

import { createClient, type RedisClientType } from "redis";
import { Logger } from "../logger.js";
import type {
	OAuthStore,
	OAuthStoredClient,
	PendingAuthorization,
	StoredRefreshToken,
} from "./types.js";

const KEY_PREFIX = "oauth";

export class RedisOAuthStore implements OAuthStore {
	private readonly client: RedisClientType;
	private connectPromise: Promise<unknown> | undefined;

	constructor(redisUrl: string) {
		this.client = createClient({ url: redisUrl });
		this.client.on("error", (error) => {
			Logger.error("Redis OAuth store error", {
				metadata: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
		});
	}

	private async ensureConnected(): Promise<void> {
		if (this.client.isOpen) {
			return;
		}
		if (!this.connectPromise) {
			this.connectPromise = this.client.connect().catch((error) => {
				this.connectPromise = undefined;
				throw error;
			});
		}
		await this.connectPromise;
	}

	// --- Authorization codes (TTL: 10 min) ---

	async storeAuthorizationCode(code: string, auth: PendingAuthorization): Promise<void> {
		await this.ensureConnected();
		const ttl = Math.max(1, Math.ceil((auth.expiresAt - Date.now()) / 1000));
		await this.client.set(
			`${KEY_PREFIX}:authcode:${code}`,
			JSON.stringify(auth),
			{ EX: ttl },
		);
	}

	async getAuthorizationCode(code: string): Promise<PendingAuthorization | undefined> {
		await this.ensureConnected();
		const raw = await this.client.get(`${KEY_PREFIX}:authcode:${code}`);
		if (!raw) return undefined;
		const auth = JSON.parse(raw) as PendingAuthorization;
		if (auth.expiresAt <= Date.now()) {
			await this.client.del(`${KEY_PREFIX}:authcode:${code}`);
			return undefined;
		}
		return auth;
	}

	async deleteAuthorizationCode(code: string): Promise<void> {
		await this.ensureConnected();
		await this.client.del(`${KEY_PREFIX}:authcode:${code}`);
	}

	// --- Clerk state mapping (TTL: 10 min) ---

	async storeClerkState(state: string, authCode: string): Promise<void> {
		await this.ensureConnected();
		await this.client.set(
			`${KEY_PREFIX}:clerk_state:${state}`,
			authCode,
			{ EX: 600 },
		);
	}

	async getClerkState(state: string): Promise<string | undefined> {
		await this.ensureConnected();
		const val = await this.client.get(`${KEY_PREFIX}:clerk_state:${state}`);
		return val ?? undefined;
	}

	async deleteClerkState(state: string): Promise<void> {
		await this.ensureConnected();
		await this.client.del(`${KEY_PREFIX}:clerk_state:${state}`);
	}

	// --- Registered clients (no TTL — persist indefinitely) ---

	async storeClient(clientId: string, client: OAuthStoredClient): Promise<void> {
		await this.ensureConnected();
		await this.client.set(
			`${KEY_PREFIX}:client:${clientId}`,
			JSON.stringify(client),
		);
	}

	async getClient(clientId: string): Promise<OAuthStoredClient | undefined> {
		await this.ensureConnected();
		const raw = await this.client.get(`${KEY_PREFIX}:client:${clientId}`);
		return raw ? (JSON.parse(raw) as OAuthStoredClient) : undefined;
	}

	// --- Refresh tokens (TTL: 30 days) ---

	async storeRefreshToken(token: string, data: StoredRefreshToken): Promise<void> {
		await this.ensureConnected();
		const ttl = Math.max(1, Math.ceil((data.expiresAt - Date.now()) / 1000));
		await this.client.set(
			`${KEY_PREFIX}:refresh:${token}`,
			JSON.stringify(data),
			{ EX: ttl },
		);
	}

	async getRefreshToken(token: string): Promise<StoredRefreshToken | undefined> {
		await this.ensureConnected();
		const raw = await this.client.get(`${KEY_PREFIX}:refresh:${token}`);
		if (!raw) return undefined;
		const data = JSON.parse(raw) as StoredRefreshToken;
		if (data.expiresAt <= Date.now()) {
			await this.client.del(`${KEY_PREFIX}:refresh:${token}`);
			return undefined;
		}
		return data;
	}

	async deleteRefreshToken(token: string): Promise<void> {
		await this.ensureConnected();
		await this.client.del(`${KEY_PREFIX}:refresh:${token}`);
	}

	// --- Access token revocation (JTI-based, TTL matches token expiry) ---

	async revokeAccessToken(jti: string, expiresAt: number): Promise<void> {
		await this.ensureConnected();
		const ttl = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
		await this.client.set(`${KEY_PREFIX}:revoked:${jti}`, "1", { EX: ttl });
	}

	async isAccessTokenRevoked(jti: string): Promise<boolean> {
		await this.ensureConnected();
		const val = await this.client.get(`${KEY_PREFIX}:revoked:${jti}`);
		return val !== null;
	}

	// --- Lifecycle ---

	async close(): Promise<void> {
		if (!this.client.isOpen && this.connectPromise) {
			try {
				await this.connectPromise;
			} catch {
				// Ignore connect failures during shutdown.
			}
		}
		if (this.client.isOpen) {
			await this.client.quit();
		}
	}
}
