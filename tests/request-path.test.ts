import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	isHealthOrReadyPath,
	isMcpRequestPath,
} from "../src/lib/request-path.js";

describe("isMcpRequestPath", () => {
	it("matches /mcp with case and trailing-slash variants", () => {
		for (const path of ["/mcp", "/mcp/", "/MCP", "/Mcp/"]) {
			assert.equal(isMcpRequestPath(path), true, path);
		}
	});

	it("rejects other paths", () => {
		for (const path of ["/", "", "/mcp//", "/mcp/extra", "/mcpx", "/health"]) {
			assert.equal(isMcpRequestPath(path), false, path);
		}
	});
});

describe("isHealthOrReadyPath", () => {
	it("matches /health and /ready with case and trailing-slash variants", () => {
		for (const path of [
			"/health",
			"/health/",
			"/HEALTH",
			"/ready",
			"/Ready/",
		]) {
			assert.equal(isHealthOrReadyPath(path), true, path);
		}
	});

	it("rejects other paths", () => {
		for (const path of ["/", "", "/healthz", "/health/x", "/mcp"]) {
			assert.equal(isHealthOrReadyPath(path), false, path);
		}
	});
});
