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

	it("skips documented management routes that the hosted data plane receives", () => {
		const routeError = new FetchError(
			"Either x-portkey-config or x-portkey-provider header is required",
			400,
		);

		for (const name of [
			"listDeployments",
			"listScimGroups",
			"getOrganisationDefaults",
		]) {
			assert.equal(
				expectedSmokeSkipReason(name, routeError),
				"documented control-plane route is unavailable on the hosted API",
			);
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
