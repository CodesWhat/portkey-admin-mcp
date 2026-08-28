import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FetchError } from "../src/lib/fetch.js";
import { expectedSmokeSkipReason } from "./smoke-outcomes.js";

describe("live smoke outcome classification", () => {
	it("skips endpoints blocked by the configured credential", () => {
		assert.equal(
			expectedSmokeSkipReason(
				"listUsers",
				new FetchError("not permitted", 403),
			),
			"configured credential lacks access (HTTP 403)",
		);
		assert.equal(
			expectedSmokeSkipReason(
				"getLogExportFieldRestrictions",
				new FetchError("unauthorized", 401),
			),
			"configured credential lacks access (HTTP 401)",
		);
	});

	it("no longer hides the gateway catch-all for management routes", () => {
		// These three used to be allow-listed as "unavailable on the hosted
		// API". They are not unavailable: they moved to /v2, and the 400 was
		// the gateway's generic fallback for an unrouted path, identical to
		// what a nonexistent route returns. Skipping it hid a wrong base URL,
		// so it must surface as a real failure now.
		const routeError = new FetchError(
			"Either x-portkey-config or x-portkey-provider header is required",
			400,
		);

		for (const name of [
			"listDeployments",
			"listScimGroups",
			"getOrganisationDefaults",
		]) {
			assert.equal(expectedSmokeSkipReason(name, routeError), null);
		}
	});

	it("does not hide unrelated client or upstream failures", () => {
		assert.equal(
			expectedSmokeSkipReason(
				"listConfigs",
				new FetchError("provider header required", 400),
			),
			null,
		);
		assert.equal(
			expectedSmokeSkipReason("listDeployments", new Error("socket closed")),
			null,
		);
	});
});
