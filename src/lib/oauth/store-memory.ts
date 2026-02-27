/**
 * In-memory OAuth store for development and testing.
 * Same pattern as InMemoryEventStore in event-store.ts.
 */

import type {
	OAuthStore,
	OAuthStoredClient,
	PendingAuthorization,
	StoredRefreshToken,
} from "./types.js";

export class InMemoryOAuthStore implements OAuthStore {
	private readonly authCodes = new Map<string, PendingAuthorization>();
	private readonly clerkStates = new Map<string, string>();
	private readonly clients = new Map<string, OAuthStoredClient>();
	private readonly refreshTokens = new Map<string, StoredRefreshToken>();
	private readonly revokedJtis = new Map<string, number>(); // jti → expiresAt

	private readonly cleanupTimer: ReturnType<typeof setInterval>;

	constructor() {
		this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
		this.cleanupTimer.unref();
	}

	// --- Authorization codes ---

	async storeAuthorizationCode(code: string, auth: PendingAuthorization): Promise<void> {
		this.authCodes.set(code, auth);
	}

	async getAuthorizationCode(code: string): Promise<PendingAuthorization | undefined> {
		const auth = this.authCodes.get(code);
		if (auth && auth.expiresAt <= Date.now()) {
			this.authCodes.delete(code);
			return undefined;
		}
		return auth;
	}

	async deleteAuthorizationCode(code: string): Promise<void> {
		this.authCodes.delete(code);
	}

	// --- Clerk state mapping ---

	async storeClerkState(state: string, authCode: string): Promise<void> {
		this.clerkStates.set(state, authCode);
	}

	async getClerkState(state: string): Promise<string | undefined> {
		return this.clerkStates.get(state);
	}

	async deleteClerkState(state: string): Promise<void> {
		this.clerkStates.delete(state);
	}

	// --- Registered clients ---

	async storeClient(clientId: string, client: OAuthStoredClient): Promise<void> {
		this.clients.set(clientId, client);
	}

	async getClient(clientId: string): Promise<OAuthStoredClient | undefined> {
		return this.clients.get(clientId);
	}

	// --- Refresh tokens ---

	async storeRefreshToken(token: string, data: StoredRefreshToken): Promise<void> {
		this.refreshTokens.set(token, data);
	}

	async getRefreshToken(token: string): Promise<StoredRefreshToken | undefined> {
		const data = this.refreshTokens.get(token);
		if (data && data.expiresAt <= Date.now()) {
			this.refreshTokens.delete(token);
			return undefined;
		}
		return data;
	}

	async deleteRefreshToken(token: string): Promise<void> {
		this.refreshTokens.delete(token);
	}

	// --- Access token revocation ---

	async revokeAccessToken(jti: string, expiresAt: number): Promise<void> {
		this.revokedJtis.set(jti, expiresAt);
	}

	async isAccessTokenRevoked(jti: string): Promise<boolean> {
		return this.revokedJtis.has(jti);
	}

	// --- Lifecycle ---

	async close(): Promise<void> {
		clearInterval(this.cleanupTimer);
	}

	private cleanupExpired(): void {
		const now = Date.now();

		for (const [code, auth] of this.authCodes.entries()) {
			if (auth.expiresAt <= now) {
				this.authCodes.delete(code);
			}
		}

		for (const [token, data] of this.refreshTokens.entries()) {
			if (data.expiresAt <= now) {
				this.refreshTokens.delete(token);
			}
		}

		for (const [jti, expiresAt] of this.revokedJtis.entries()) {
			if (expiresAt <= now) {
				this.revokedJtis.delete(jti);
			}
		}
	}
}
