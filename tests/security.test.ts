import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	getAllowedOrigins,
	isAllowedHost,
	validateOrigin,
} from "../src/lib/security.js";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	process.env = { ...ORIGINAL_ENV };
}

describe("origin security configuration", () => {
	afterEach(() => {
		resetEnv();
	});

	it("uses ALLOWED_ORIGINS when configured", () => {
		process.env.ALLOWED_ORIGINS =
			"https://admin.example.com,https://mcp.example.com";
		delete process.env.CORS_ORIGIN;

		assert.deepEqual(getAllowedOrigins(), [
			"https://admin.example.com",
			"https://mcp.example.com",
		]);
		assert.equal(validateOrigin("https://admin.example.com"), true);
		assert.equal(validateOrigin("https://evil.example.com"), false);
	});

	it("falls back to CORS_ORIGIN when ALLOWED_ORIGINS is unset", () => {
		delete process.env.ALLOWED_ORIGINS;
		process.env.CORS_ORIGIN = "https://fallback.example.com";

		assert.deepEqual(getAllowedOrigins(), ["https://fallback.example.com"]);
		assert.equal(validateOrigin("https://fallback.example.com"), true);
	});

	it("allows all origins when wildcard is configured", () => {
		process.env.ALLOWED_ORIGINS = "*";

		assert.equal(validateOrigin("https://any-origin.example"), true);
		assert.equal(isAllowedHost("anything.local"), true);
	});

	it("does not allow prefix-based origin spoofing", () => {
		process.env.ALLOWED_ORIGINS = "https://example.com";

		assert.equal(validateOrigin("https://example.com"), true);
		assert.equal(validateOrigin("https://example.com.evil"), false);
	});

	it("allows any port when allow-listed origin has no explicit port", () => {
		process.env.ALLOWED_ORIGINS = "http://localhost";

		assert.equal(validateOrigin("http://localhost:3000"), true);
		assert.equal(validateOrigin("http://localhost:9999"), true);
		assert.equal(validateOrigin("https://localhost:3000"), false);
	});

	it("uses strict host comparison for non-URL allow-list entries", () => {
		process.env.ALLOWED_ORIGINS = "example.local";

		assert.equal(isAllowedHost("example.local"), true);
		assert.equal(isAllowedHost("example.local:3000"), true);
		assert.equal(isAllowedHost("evil-example.local"), false);
	});
});
