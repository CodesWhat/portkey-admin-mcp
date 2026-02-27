/**
 * Clerk OAuth callback handler.
 *
 * After a user signs in via Clerk's hosted sign-in page, Clerk redirects
 * to GET /oauth/callback?state=<clerk_state>. We:
 * 1. Extract the Clerk session JWT from the __session cookie
 * 2. Verify it against Clerk's JWKS
 * 3. Set the Clerk user ID on the pending authorization
 * 4. Redirect the MCP client to its redirect_uri with ?code=<auth_code>&state=<original_state>
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response } from "express";
import { Logger } from "../logger.js";
import type { OAuthConfig, OAuthStore } from "./types.js";

const clerkJwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getClerkJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
	let jwks = clerkJwksCache.get(issuer);
	if (!jwks) {
		const jwksUrl = new URL("/.well-known/jwks.json", issuer);
		jwks = createRemoteJWKSet(jwksUrl);
		clerkJwksCache.set(issuer, jwks);
	}
	return jwks;
}

export function createClerkCallbackHandler(
	store: OAuthStore,
	config: OAuthConfig,
) {
	return async (req: Request, res: Response): Promise<void> => {
		try {
			const clerkState = req.query.state as string | undefined;
			if (!clerkState) {
				res.status(400).json({ error: "Missing state parameter" });
				return;
			}

			// Look up which auth code this Clerk state maps to
			const authCode = await store.getClerkState(clerkState);
			if (!authCode) {
				res.status(400).json({ error: "Invalid or expired state parameter" });
				return;
			}

			// Extract Clerk session JWT from __session cookie
			const sessionCookie = parseCookies(req.headers.cookie).__session;
			if (!sessionCookie) {
				res.status(401).json({ error: "Missing Clerk session cookie" });
				return;
			}

			// Verify the Clerk session JWT
			const jwks = getClerkJwks(config.clerkIssuer);
			const { payload } = await jwtVerify(sessionCookie, jwks, {
				issuer: config.clerkIssuer,
				clockTolerance: "5s",
			});

			const clerkUserId = payload.sub;
			if (!clerkUserId) {
				res.status(401).json({ error: "Clerk session missing subject" });
				return;
			}

			// Update the pending authorization with the Clerk user ID
			const pending = await store.getAuthorizationCode(authCode);
			if (!pending) {
				res.status(400).json({ error: "Authorization code expired" });
				return;
			}

			pending.clerkUserId = clerkUserId;
			await store.storeAuthorizationCode(authCode, pending);

			// Consume the Clerk state nonce
			await store.deleteClerkState(clerkState);

			// Redirect MCP client to its redirect_uri with the auth code
			const redirectUrl = new URL(pending.redirectUri);
			redirectUrl.searchParams.set("code", authCode);
			if (pending.state) {
				redirectUrl.searchParams.set("state", pending.state);
			}

			Logger.info("OAuth Clerk callback completed", {
				metadata: { clerkUserId, clientId: pending.clientId },
			});

			res.redirect(redirectUrl.toString());
		} catch (error) {
			Logger.error("OAuth Clerk callback failed", {
				metadata: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
			res.status(500).json({ error: "OAuth callback failed" });
		}
	};
}

/**
 * Minimal cookie parser — avoids adding a dependency for a single use.
 */
function parseCookies(header: string | undefined): Record<string, string> {
	const cookies: Record<string, string> = {};
	if (!header) return cookies;

	for (const pair of header.split(";")) {
		const eqIdx = pair.indexOf("=");
		if (eqIdx < 0) continue;
		const key = pair.slice(0, eqIdx).trim();
		const value = pair.slice(eqIdx + 1).trim();
		if (key) {
			cookies[key] = decodeURIComponent(value);
		}
	}
	return cookies;
}
