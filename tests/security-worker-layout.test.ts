import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(relativePath: string): string {
	return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("security test worker layout", () => {
	it("runs both security suites through one explicit worker", () => {
		const packageJson = JSON.parse(read("package.json")) as {
			scripts: Record<string, string>;
		};
		const worker = read("tests/security-edge-runtime.test.ts");

		for (const scriptName of ["test", "test:coverage"]) {
			const script = packageJson.scripts[scriptName];
			assert.match(script, /tests\/security-edge-runtime\.test\.ts/);
			assert.doesNotMatch(script, /security-runtime\.suite\.ts/);
			assert.doesNotMatch(script, /lib-security-runtime\.suite\.ts/);
		}

		assert.match(worker, /configureSecurityWorkerEnvironment\(\)/);
		assert.match(worker, /import\("\.\/lib-security-runtime\.suite\.js"\)/);
		assert.match(worker, /import\("\.\/security-runtime\.suite\.js"\)/);
		assert.ok(
			worker.indexOf("configureSecurityWorkerEnvironment()") <
				worker.indexOf('import("./lib-security-runtime.suite.js")'),
			"worker environment must be configured before either suite loads",
		);
	});

	it("keeps worker environment setup out of suite module initialization", () => {
		const environmentHelper = read(
			"tests/helpers/security-worker-environment.ts",
		);
		const runtimeSuite = read("tests/lib-security-runtime.suite.ts");

		assert.match(
			environmentHelper,
			/export function configureSecurityWorkerEnvironment/,
		);
		assert.doesNotMatch(runtimeSuite, /^process\.env\./m);
	});
});
