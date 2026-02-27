/**
 * OAuth 2.1 data structures for MCP-spec authorization with Clerk.
 */

export interface PendingAuthorization {
	/** PKCE code challenge from the MCP client */
	codeChallenge: string;
	/** Where to redirect the MCP client after auth completes */
	redirectUri: string;
	/** Requested scopes */
	scopes: string[];
	/** OAuth client_id that initiated the flow */
	clientId: string;
	/** Original state param from the MCP client (opaque, passed through) */
	state?: string;
	/** Resource URL (RFC 8707) */
	resource?: string;
	/** Clerk user ID — set after Clerk callback */
	clerkUserId?: string;
	/** Expiry timestamp (ms since epoch) */
	expiresAt: number;
}

export interface StoredRefreshToken {
	/** OAuth client_id this token was issued to */
	clientId: string;
	/** Granted scopes */
	scopes: string[];
	/** Resource URL (RFC 8707) */
	resource?: string;
	/** Clerk user ID */
	clerkUserId: string;
	/** Expiry timestamp (ms since epoch) */
	expiresAt: number;
}

/**
 * Persistence layer for OAuth state. Implemented by in-memory (dev) and Redis (prod) stores.
 */
export interface OAuthStore {
	// --- Authorization codes ---
	storeAuthorizationCode(code: string, auth: PendingAuthorization): Promise<void>;
	getAuthorizationCode(code: string): Promise<PendingAuthorization | undefined>;
	deleteAuthorizationCode(code: string): Promise<void>;

	// --- Clerk state mapping (state nonce → auth code) ---
	storeClerkState(state: string, authCode: string): Promise<void>;
	getClerkState(state: string): Promise<string | undefined>;
	deleteClerkState(state: string): Promise<void>;

	// --- Registered clients ---
	storeClient(clientId: string, client: OAuthStoredClient): Promise<void>;
	getClient(clientId: string): Promise<OAuthStoredClient | undefined>;

	// --- Refresh tokens ---
	storeRefreshToken(token: string, data: StoredRefreshToken): Promise<void>;
	getRefreshToken(token: string): Promise<StoredRefreshToken | undefined>;
	deleteRefreshToken(token: string): Promise<void>;

	// --- Access token revocation (JTI-based) ---
	revokeAccessToken(jti: string, expiresAt: number): Promise<void>;
	isAccessTokenRevoked(jti: string): Promise<boolean>;

	// --- Lifecycle ---
	close(): Promise<void>;
}

/** Serializable client record for the store layer. */
export interface OAuthStoredClient {
	client_id: string;
	client_secret?: string;
	client_id_issued_at?: number;
	client_secret_expires_at?: number;
	redirect_uris: string[];
	token_endpoint_auth_method?: string;
	grant_types?: string[];
	response_types?: string[];
	client_name?: string;
	client_uri?: string;
	scope?: string;
}

export interface OAuthConfig {
	/** Our issuer URL (e.g. https://portkey-admin-mcp.vercel.app) */
	issuerUrl: URL;
	/** Resource URL — usually issuerUrl + /mcp */
	resourceUrl: URL;
	/** Clerk hosted sign-in page URL */
	clerkSignInUrl: string;
	/** Clerk issuer for verifying __session JWTs */
	clerkIssuer: string;
	/** Access token lifetime in seconds (default: 3600) */
	accessTokenTtlSeconds: number;
	/** Refresh token lifetime in seconds (default: 30 days) */
	refreshTokenTtlSeconds: number;
	/** Authorization code lifetime in seconds (default: 600) */
	authCodeTtlSeconds: number;
}
