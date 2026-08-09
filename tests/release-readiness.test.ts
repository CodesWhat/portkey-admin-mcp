import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(`${root}${path}`, "utf8"));
}

test("all published manifests use the npm package version", () => {
	const packageJson = readJson("package.json");
	const packageLock = readJson("package-lock.json");
	const server = readJson("server.json");
	const lobeHub = readJson("lhm.plugin.json");
	const lockPackages = packageLock.packages as Record<
		string,
		Record<string, unknown>
	>;
	const serverPackages = server.packages as Array<Record<string, unknown>>;

	assert.equal(packageLock.version, packageJson.version);
	assert.equal(lockPackages[""].version, packageJson.version);
	assert.equal(server.version, packageJson.version);
	assert.equal(serverPackages[0]?.version, packageJson.version);
	assert.equal(lobeHub.version, packageJson.version);
});

test("the npm artifact includes every local document linked from README", () => {
	const packageJson = readJson("package.json");
	const files = packageJson.files as string[];

	assert.ok(files.includes("ENDPOINTS.md"));
	assert.ok(files.includes("docs/PRISMA_AIRS_INTEROPERABILITY.md"));
	assert.ok(files.includes("docs/VERCEL_DEPLOYMENT.md"));
});

test("a credentialed smoke run is not disabled solely because it is in CI", () => {
	const smokeSource = readFileSync(`${root}tests/smoke.ts`, "utf8");
	const workflowSource = readFileSync(
		`${root}.github/workflows/ci.yml`,
		"utf8",
	);

	assert.doesNotMatch(smokeSource, /if \(process\.env\.CI\)/);
	assert.match(workflowSource, /PORTKEY_API_KEY_STAGING/);
});

test("the live smoke suite covers new read-only compatibility surfaces", () => {
	const smokeSource = readFileSync(`${root}tests/smoke.ts`, "utf8");

	for (const method of [
		"getOrganisationDefaults",
		"getLogExportFieldRestrictions",
		"listScimWorkspaceMappings",
		"listScimGroups",
		"listMcpServers",
		"listMcpServerConnections",
		"getModelPricing",
	]) {
		assert.match(smokeSource, new RegExp(`\\.${method}\\(`));
	}
});

test("the release guide covers every published catalog", () => {
	const releaseGuide = readFileSync(`${root}docs/RELEASE.md`, "utf8");

	for (const catalog of ["npm", "MCP Registry", "LobeHub", "Glama"]) {
		assert.match(
			releaseGuide,
			new RegExp(`^#{2,3} .*${catalog}`, "im"),
			`RELEASE.md needs a ${catalog} section`,
		);
	}
});

test("release verification includes a Glama TDQS-compatible tool-definition gate", () => {
	const packageJson = readJson("package.json");
	const scripts = packageJson.scripts as Record<string, string>;
	const releaseGuide = readFileSync(`${root}docs/RELEASE.md`, "utf8");
	const workflowSource = readFileSync(
		`${root}.github/workflows/ci.yml`,
		"utf8",
	);
	const qualitySource = readFileSync(
		`${root}scripts/check-tool-definition-quality.mjs`,
		"utf8",
	);

	assert.match(scripts["verify:tool-quality"] ?? "", /tool-definition-quality/);
	assert.match(scripts.ci ?? "", /verify:tool-quality/);
	assert.match(workflowSource, /npm run verify:tool-quality/);
	assert.match(releaseGuide, /TDQS|Tool Definition Quality Score/i);
	assert.match(qualitySource, /walkParameters/);
	assert.match(qualitySource, /manifestToolCount/);
	assert.match(qualitySource, /transport\.stderr/);
});

test("LobeHub release automation updates the claimed listing and all MCP capabilities", () => {
	const packageJson = readJson("package.json");
	const scripts = packageJson.scripts as Record<string, string>;
	const generatorSource = readFileSync(
		`${root}scripts/generate-lobehub-tools.mjs`,
		"utf8",
	);
	const releaseGuide = readFileSync(`${root}docs/RELEASE.md`, "utf8");

	assert.match(scripts["update:lobehub"] ?? "", /plugin update/);
	assert.doesNotMatch(scripts["update:lobehub"] ?? "", /plugin publish/);
	assert.match(generatorSource, /\blistTools\b/);
	assert.match(generatorSource, /\blistPrompts\b/);
	assert.match(generatorSource, /\blistResources\b/);
	assert.match(generatorSource, /\blistResourceTemplates\b/);
	assert.match(generatorSource, /finally/);
	assert.match(releaseGuide, /plugin update/);
});
