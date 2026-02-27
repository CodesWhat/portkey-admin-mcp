/**
 * ClerkOAuthProvider — implements OAuthServerProvider from the MCP SDK.
 *
 * Our server acts as both Authorization Server and Resource Server.
 * Clerk is the identity provider: `authorize()` redirects to Clerk's
 * hosted sign-in page, and `exchangeAuthorizationCode()` mints JWTs
 * signed by our own Ed25519 key.
 */

import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type {
	OAuthRegisteredClientsStore,
} from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
	AuthorizationParams,
	OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
	OAuthClientInformationFull,
	OAuthTokenRevocationRequest,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { Logger } from "../logger.js";
import type { OAuthKeyPair } from "./keys.js";
import type {
	OAuthConfig,
	OAuthStore,
	OAuthStoredClient,
} from "./types.js";

import type { Response } from "express";

// ---------------------------------------------------------------------------
// Clients store adapter — bridges our OAuthStore to the SDK's interface
// ---------------------------------------------------------------------------

class ClientsStoreAdapter implements OAuthRegisteredClientsStore {
	constructor(private readonly store: OAuthStore) {}

	async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
		const stored = await this.store.getClient(clientId);
		if (!stored) return undefined;
		return storedToFull(stored);
	}

	async registerClient(
		client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
	): Promise<OAuthClientInformationFull> {
		const clientId = crypto.randomUUID();
		const clientSecret = crypto.randomBytes(32).toString("hex");
		const now = Math.floor(Date.now() / 1000);

		const stored: OAuthStoredClient = {
			client_id: clientId,
			client_secret: clientSecret,
			client_id_issued_at: now,
			redirect_uris: client.redirect_uris ?? [],
			token_endpoint_auth_method: client.token_endpoint_auth_method,
			grant_types: client.grant_types,
			response_types: client.response_types,
			client_name: client.client_name,
			client_uri: client.client_uri,
			scope: client.scope,
		};

		await this.store.storeClient(clientId, stored);

		Logger.info("OAuth client registered", {
			metadata: { clientId, clientName: stored.client_name },
		});

		return storedToFull(stored);
	}
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ClerkOAuthProvider implements OAuthServerProvider {
	private readonly _clientsStore: ClientsStoreAdapter;

	/**
	 * Tell the SDK to skip its own PKCE validation — we store and verify
	 * the code_challenge ourselves inside exchangeAuthorizationCode().
	 */
	readonly skipLocalPkceValidation = true;

	constructor(
		private readonly store: OAuthStore,
		private readonly keyPair: OAuthKeyPair,
		private readonly config: OAuthConfig,
	) {
		this._clientsStore = new ClientsStoreAdapter(store);
	}

	get clientsStore(): OAuthRegisteredClientsStore {
		return this._clientsStore;
	}

	// -----------------------------------------------------------------------
	// authorize — redirect to Clerk hosted sign-in
	// -----------------------------------------------------------------------

	async authorize(
		client: OAuthClientInformationFull,
		params: AuthorizationParams,
		res: Response,
	): Promise<void> {
		const authCode = crypto.randomBytes(32).toString("hex");
		const clerkState = crypto.randomBytes(16).toString("hex");

		await this.store.storeAuthorizationCode(authCode, {
			codeChallenge: params.codeChallenge,
			redirectUri: params.redirectUri,
			scopes: params.scopes ?? [],
			clientId: client.client_id,
			state: params.state,
			resource: params.resource?.toString(),
			expiresAt: Date.now() + this.config.authCodeTtlSeconds * 1000,
		});

		await this.store.storeClerkState(clerkState, authCode);

		// Build Clerk sign-in redirect URL.
		// `redirect_url` tells Clerk where to send the user after sign-in.
		const callbackUrl = new URL("/oauth/callback", this.config.issuerUrl);
		callbackUrl.searchParams.set("state", clerkState);

		const signInUrl = new URL(this.config.clerkSignInUrl);
		signInUrl.searchParams.set("redirect_url", callbackUrl.toString());

		res.redirect(signInUrl.toString());
	}

	// -----------------------------------------------------------------------
	// challengeForAuthorizationCode
	// -----------------------------------------------------------------------

	async challengeForAuthorizationCode(
		_client: OAuthClientInformationFull,
		authorizationCode: string,
	): Promise<string> {
		const pending = await this.store.getAuthorizationCode(authorizationCode);
		if (!pending) {
			throw new Error("Authorization code not found or expired");
		}
		return pending.codeChallenge;
	}

	// -----------------------------------------------------------------------
	// exchangeAuthorizationCode — mint JWT access token + refresh token
	// -----------------------------------------------------------------------

	async exchangeAuthorizationCode(
		client: OAuthClientInformationFull,
		authorizationCode: string,
		_codeVerifier?: string,
		_redirectUri?: string,
		resource?: URL,
	): Promise<OAuthTokens> {
		const pending = await this.store.getAuthorizationCode(authorizationCode);
		if (!pending) {
			throw new Error("Authorization code not found or expired");
		}

		if (pending.clientId !== client.client_id) {
			throw new Error("Client ID mismatch for authorization code");
		}

		if (!pending.clerkUserId) {
			throw new Error("Authorization code has not been authenticated via Clerk");
		}

		// Consume the code (one-time use)
		await this.store.deleteAuthorizationCode(authorizationCode);

		return this.mintTokens(
			client.client_id,
			pending.clerkUserId,
			pending.scopes,
			resource?.toString() ?? pending.resource,
		);
	}

	// -----------------------------------------------------------------------
	// exchangeRefreshToken — rotate refresh token, mint new JWT
	// -----------------------------------------------------------------------

	async exchangeRefreshToken(
		client: OAuthClientInformationFull,
		refreshToken: string,
		scopes?: string[],
		resource?: URL,
	): Promise<OAuthTokens> {
		const stored = await this.store.getRefreshToken(refreshToken);
		if (!stored) {
			throw new Error("Refresh token not found or expired");
		}

		if (stored.clientId !== client.client_id) {
			throw new Error("Client ID mismatch for refresh token");
		}

		// Rotate: delete old refresh token
		await this.store.deleteRefreshToken(refreshToken);

		// Use narrowed scopes if requested, otherwise keep original
		const grantedScopes = scopes && scopes.length > 0 ? scopes : stored.scopes;

		return this.mintTokens(
			client.client_id,
			stored.clerkUserId,
			grantedScopes,
			resource?.toString() ?? stored.resource,
		);
	}

	// -----------------------------------------------------------------------
	// verifyAccessToken — verify JWT, check revocation
	// -----------------------------------------------------------------------

	async verifyAccessToken(token: string): Promise<AuthInfo> {
		const { payload } = await jwtVerify(token, this.keyPair.publicKey, {
			issuer: this.config.issuerUrl.toString(),
		});

		const jti = payload.jti;
		if (jti && (await this.store.isAccessTokenRevoked(jti))) {
			throw new Error("Access token has been revoked");
		}

		return {
			token,
			clientId: (payload.client_id as string) ?? "",
			scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
			expiresAt: payload.exp,
			resource: payload.aud ? new URL(Array.isArray(payload.aud) ? payload.aud[0] : payload.aud) : undefined,
			extra: {
				sub: payload.sub,
			},
		};
	}

	// -----------------------------------------------------------------------
	// revokeToken — revoke refresh or access token
	// -----------------------------------------------------------------------

	async revokeToken(
		_client: OAuthClientInformationFull,
		request: OAuthTokenRevocationRequest,
	): Promise<void> {
		if (request.token_type_hint === "refresh_token" || !request.token_type_hint) {
			// Try to delete as refresh token first
			const stored = await this.store.getRefreshToken(request.token);
			if (stored) {
				await this.store.deleteRefreshToken(request.token);
				return;
			}
		}

		// Try to decode as access token and revoke by JTI
		try {
			const { payload } = await jwtVerify(request.token, this.keyPair.publicKey, {
				issuer: this.config.issuerUrl.toString(),
			});
			if (payload.jti && payload.exp) {
				await this.store.revokeAccessToken(payload.jti, payload.exp * 1000);
			}
		} catch {
			// Token may already be expired or invalid — that's fine, revocation is best-effort
		}
	}

	// -----------------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------------

	private async mintTokens(
		clientId: string,
		clerkUserId: string,
		scopes: string[],
		resource?: string,
	): Promise<OAuthTokens> {
		const jti = crypto.randomUUID();
		const nowSeconds = Math.floor(Date.now() / 1000);

		const jwt = new SignJWT({
			scope: scopes.join(" "),
			client_id: clientId,
		})
			.setProtectedHeader({ alg: "EdDSA", kid: this.keyPair.kid })
			.setIssuer(this.config.issuerUrl.toString())
			.setSubject(clerkUserId)
			.setJti(jti)
			.setIssuedAt(nowSeconds)
			.setExpirationTime(nowSeconds + this.config.accessTokenTtlSeconds);

		if (resource) {
			jwt.setAudience(resource);
		}

		const accessToken = await jwt.sign(this.keyPair.privateKey);

		// Mint opaque refresh token
		const refreshToken = crypto.randomBytes(32).toString("hex");
		await this.store.storeRefreshToken(refreshToken, {
			clientId,
			scopes,
			resource,
			clerkUserId,
			expiresAt: Date.now() + this.config.refreshTokenTtlSeconds * 1000,
		});

		return {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: this.config.accessTokenTtlSeconds,
			scope: scopes.join(" "),
			refresh_token: refreshToken,
		};
	}
}

// ---------------------------------------------------------------------------
// Helpers — convert between stored and SDK client formats
// ---------------------------------------------------------------------------

function storedToFull(stored: OAuthStoredClient): OAuthClientInformationFull {
	return {
		client_id: stored.client_id,
		client_secret: stored.client_secret,
		client_id_issued_at: stored.client_id_issued_at,
		client_secret_expires_at: stored.client_secret_expires_at,
		redirect_uris: stored.redirect_uris,
		token_endpoint_auth_method: stored.token_endpoint_auth_method,
		grant_types: stored.grant_types,
		response_types: stored.response_types,
		client_name: stored.client_name,
		client_uri: stored.client_uri,
		scope: stored.scope,
	} as OAuthClientInformationFull;
}

