/**
 * JWT signing key management for OAuth 2.1 access tokens.
 * Uses Ed25519 (EdDSA) via the jose library (already a dependency).
 */

import crypto from "node:crypto";
import { exportJWK, generateKeyPair, importJWK } from "jose";
import type { JWK } from "jose";
import { Logger } from "../logger.js";

export interface OAuthKeyPair {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
	publicJwk: JWK;
	kid: string;
}

/**
 * Load an Ed25519 key pair from `OAUTH_JWT_PRIVATE_KEY` (base64-encoded JWK),
 * or generate an ephemeral key pair for development.
 */
export async function loadOrGenerateKeyPair(): Promise<OAuthKeyPair> {
	const envKey = process.env.OAUTH_JWT_PRIVATE_KEY?.trim();

	if (envKey) {
		return loadFromEnv(envKey);
	}

	Logger.warn(
		"OAUTH_JWT_PRIVATE_KEY not set — generating ephemeral Ed25519 key pair (tokens will not survive restarts)",
	);
	return generateEphemeralKeyPair();
}

async function loadFromEnv(base64Jwk: string): Promise<OAuthKeyPair> {
	const jwk = JSON.parse(Buffer.from(base64Jwk, "base64").toString("utf-8")) as JWK;

	if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") {
		throw new Error(
			"OAUTH_JWT_PRIVATE_KEY must be an Ed25519 JWK (kty=OKP, crv=Ed25519)",
		);
	}

	const privateKey = (await importJWK(jwk, "EdDSA")) as CryptoKey;

	// Derive public JWK by stripping the private component
	const publicJwk: JWK = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
	const kid = jwk.kid || crypto.randomUUID();
	publicJwk.kid = kid;

	const publicKey = (await importJWK(publicJwk, "EdDSA")) as CryptoKey;

	return { privateKey, publicKey, publicJwk, kid };
}

async function generateEphemeralKeyPair(): Promise<OAuthKeyPair> {
	const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
		crv: "Ed25519",
	});

	const publicJwk = await exportJWK(publicKey);
	const kid = crypto.randomUUID();
	publicJwk.kid = kid;

	return { privateKey, publicKey, publicJwk, kid };
}
