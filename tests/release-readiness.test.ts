import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("Docker startup selects the same normalized transport as its probe", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "portkey-launcher-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	mkdirSync(join(directory, "build"));
	writeFileSync(join(directory, "build/server.js"), "console.log('http')");
	writeFileSync(join(directory, "build/index.js"), "console.log('stdio')");
	const dockerfile = readFileSync(`${root}Dockerfile`, "utf8");
	const commands = [...dockerfile.matchAll(/^\s*CMD (\[.*\])$/gm)];
	const command = commands.at(-1)?.[1];
	assert.ok(command);
	const [executable, ...args] = JSON.parse(command) as string[];
	assert.ok(executable);
	const cases: [string | undefined, string][] = [
		[undefined, "stdio"],
		[" http ", "http"],
		["http", "http"],
		["\thttp\n", "http"],
		["stdio", "stdio"],
		["", "stdio"],
	];
	for (const [transport, expected] of cases) {
		const env = { ...process.env };
		if (transport === undefined) {
			delete env.MCP_TRANSPORT;
		} else {
			env.MCP_TRANSPORT = transport;
		}
		const result = spawnSync(executable, args, {
			cwd: directory,
			env,
			encoding: "utf8",
			timeout: 5000,
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), expected, JSON.stringify(transport));
	}
});

test("Docker health check uses the server's normalized transport and port", async (t) => {
	let requests = 0;
	let status = 200;
	const server = createServer((_request, response) => {
		requests += 1;
		response.writeHead(status).end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => server.close());
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const dockerfile = readFileSync(`${root}Dockerfile`, "utf8");
	const command = dockerfile.match(/HEALTHCHECK[\s\S]*?\n\s*CMD (\[.*\])/)?.[1];
	assert.ok(command);
	const [executable, ...args] = JSON.parse(command) as string[];
	assert.ok(executable);
	const check = (environment: Record<string, string>) =>
		new Promise<number | null>((resolve, reject) => {
			const child = spawn(executable, args, {
				env: { ...process.env, PORT: "", MCP_PORT: "", ...environment },
				stdio: "ignore",
				timeout: 5000,
			});
			child.once("error", reject);
			child.once("exit", resolve);
		});
	const port = String(address.port);
	assert.equal(await check({ MCP_TRANSPORT: " http ", PORT: ` ${port} ` }), 0);
	assert.equal(requests, 1, "HTTP mode must actually request /health");
	assert.equal(
		await check({ MCP_TRANSPORT: "http", PORT: " ", MCP_PORT: ` ${port} ` }),
		0,
	);
	assert.equal(requests, 2, "blank PORT must fall back to trimmed MCP_PORT");
	status = 503;
	assert.equal(await check({ MCP_TRANSPORT: "http", PORT: port }), 1);
	assert.equal(await check({ MCP_TRANSPORT: "stdio", PORT: port }), 0);
	assert.equal(requests, 3, "stdio health checks must not make HTTP requests");
});

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

test("the MCP Registry description satisfies the current length limit", () => {
	const server = readJson("server.json");
	const description = server.description;

	assert.equal(typeof description, "string");
	assert.ok(
		(description as string).length <= 100,
		"server.json description must be at most 100 characters",
	);
});

test("npm and MCP Registry use the same canonical project description", () => {
	const packageJson = readJson("package.json");
	const server = readJson("server.json");

	assert.equal(server.description, `${packageJson.description}.`);
});

test("the distribution inventory covers maintained and observed listings", () => {
	const inventory = readFileSync(`${root}docs/DISTRIBUTION.md`, "utf8");

	for (const surface of [
		"npm",
		"MCP Registry",
		"LobeHub",
		"Glama",
		"Awesome MCP Servers",
		"Docker MCP Catalog",
		"PulseMCP",
		"mcp.so",
		"mcpservers.org",
		"FindMCP",
		"Enterprise DNA",
		"Smithery",
	]) {
		assert.match(inventory, new RegExp(surface, "i"));
	}
	assert.match(inventory, /scttbnsn-portkey-admin-mcp/);
});

test("an existing release can republish a corrected MCP Registry manifest", () => {
	const workflowSource = readFileSync(
		`${root}.github/workflows/release.yml`,
		"utf8",
	);

	assert.match(workflowSource, /manifest_ref:/);
	assert.match(workflowSource, /needs\.release-ref\.outputs\.manifest_commit/);
	assert.match(workflowSource, /needs\.release-ref\.outputs\.tag_commit/);
	assert.match(
		workflowSource,
		/git merge-base --is-ancestor "\$manifest_commit" origin\/main/,
	);
});

test("Qlty pins Biome and leaves Knip to the locked CI install", () => {
	const packageJson = readJson("package.json");
	const devDependencies = packageJson.devDependencies as Record<string, string>;
	const scripts = packageJson.scripts as Record<string, string>;
	const biomeVersion = devDependencies["@biomejs/biome"];
	const biomeConfig = readJson("biome.json");
	const qltyConfig = readFileSync(`${root}.qlty/qlty.toml`, "utf8");

	assert.equal(
		biomeConfig.$schema,
		`https://biomejs.dev/schemas/${biomeVersion}/schema.json`,
	);
	assert.match(
		qltyConfig,
		new RegExp(
			`\\[\\[plugin\\]\\]\\s+name = "biome"\\s+version = "${biomeVersion}"`,
		),
	);
	assert.doesNotMatch(qltyConfig, /\[\[plugin\]\]\s+name = "knip"/);
	assert.match(scripts.ci, /npm run knip/);
});

test("every publishing job uses the protected release environment", () => {
	const workflowSource = readFileSync(
		`${root}.github/workflows/release.yml`,
		"utf8",
	);
	const releaseGuide = readFileSync(`${root}docs/RELEASE.md`, "utf8");

	assert.match(
		workflowSource,
		/git merge-base --is-ancestor "\$tag_commit" origin\/main/,
	);
	assert.equal(
		workflowSource.match(/^\s{4}environment: release$/gm)?.length,
		3,
		"GitHub Release, npm publish, and MCP Registry publish must all use the release environment",
	);
	assert.match(
		releaseGuide,
		/Do not configure required reviewers or a wait timer/i,
		"release publishing must run without a manual deployment approval",
	);
	assert.match(releaseGuide, /branch policy `main`/i);
	assert.match(releaseGuide, /tag policy `v\*`/i);
	assert.doesNotMatch(releaseGuide, /Prevent self-review/i);
});

test("the npm artifact includes every local document linked from README", () => {
	const packageJson = readJson("package.json");
	const files = packageJson.files as string[];

	assert.ok(files.includes("ENDPOINTS.md"));
	assert.ok(files.includes("docs/DISTRIBUTION.md"));
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
		"listDeployments",
		"getDeployment",
		"listMcpIntegrations",
		"getMcpIntegration",
		"listGuardrailMcpServerMappings",
		"listUsageLimitEntities",
		"getCacheSummary",
		"getAnalyticsGroupProviders",
	]) {
		assert.match(smokeSource, new RegExp(`\\.${method}\\(`));
	}
});

test("README verification checks categories, domains, and gated inventory", () => {
	const verifierSource = readFileSync(
		`${root}scripts/verify-readme-tools.mjs`,
		"utf8",
	);

	assert.match(verifierSource, /README_CATEGORY_SOURCES/);
	assert.match(verifierSource, /TOOL_DOMAIN_REGISTRARS/);
	assert.match(verifierSource, /ENTERPRISE_GATED_TOOL_NAMES/);
	assert.match(
		verifierSource,
		/ENDPOINTS\.md must contain exactly one catalog row/,
	);
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

test("HTTP deployment docs disclose the shared Portkey credential boundary", () => {
	const readme = readFileSync(`${root}README.md`, "utf8");
	const architecture = readFileSync(`${root}docs/ARCHITECTURE.md`, "utf8");

	for (const source of [readme, architecture]) {
		assert.match(source, /all authenticated principals/i);
		assert.match(source, /PORTKEY_API_KEY/);
		assert.match(source, /separate (?:instance|deployment)/i);
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

type WorkflowJob = { name: string; text: string };

function splitWorkflow(source: string): {
	topLevel: string;
	jobs: WorkflowJob[];
} {
	const jobsStart = source.search(/^jobs:\s*$/m);
	assert.ok(jobsStart >= 0, "workflow has no jobs: block");
	const topLevel = source.slice(0, jobsStart);
	const jobs: WorkflowJob[] = [];
	let current: WorkflowJob | undefined;
	for (const line of source.slice(jobsStart).split("\n").slice(1)) {
		const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
		if (header?.[1]) {
			current = { name: header[1], text: "" };
			jobs.push(current);
		} else if (current) {
			current.text += `${line}\n`;
		}
	}
	return { topLevel, jobs };
}

function grantsIdTokenWrite(text: string, indent: number): boolean {
	const lines = text.split("\n");
	const start = lines.findIndex((l) =>
		new RegExp(`^ {${indent}}permissions:`).test(l),
	);
	if (start < 0) return false;
	const inline = lines[start]?.split("permissions:")[1]?.trim() ?? "";
	if (inline === "write-all") return true;
	for (const line of lines.slice(start + 1)) {
		if (line.trim() && !line.startsWith(`${" ".repeat(indent + 1)}`)) break;
		if (/^\s*id-token:\s*write\s*$/.test(line)) return true;
	}
	return false;
}

function runBodies(text: string): string[] {
	const lines = text.split("\n");
	const bodies: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i] ?? "");
		if (!match) continue;
		const indent = (match[1] ?? "").length;
		const first = (match[2] ?? "").trim();
		if (!/^[|>][+-]?$/.test(first)) {
			bodies.push(first);
			continue;
		}
		const block: string[] = [];
		for (let j = i + 1; j < lines.length; j++) {
			const line = lines[j] ?? "";
			if (line.trim() && line.search(/\S/) <= indent) break;
			block.push(line);
		}
		bodies.push(block.join("\n"));
	}
	return bodies.map((body) =>
		body
			.split("\n")
			.filter((line) => !line.trim().startsWith("#"))
			.join("\n"),
	);
}

test("workflow jobs that hold id-token: write run no dependency or repository code", () => {
	const dir = `${root}.github/workflows/`;
	const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
	assert.ok(files.length > 0);
	const forbidden: [RegExp, string][] = [
		[/\bnpm\s+run\b/, "npm run"],
		[/\bnpm\s+(?:test|t)\b/, "npm test"],
		[/\bnpx\b/, "npx"],
		// Inline `node -e` / `node -p` are allowed; running a script file is not.
		[/(?:^|[\s;&|(])node\s+(?!-[ep]\b)/m, "node <file>"],
	];
	let checked = 0;
	for (const file of files) {
		const { topLevel, jobs } = splitWorkflow(
			readFileSync(`${dir}${file}`, "utf8"),
		);
		const topGrants = grantsIdTokenWrite(topLevel, 0);
		for (const job of jobs) {
			const hasOwn = /^ {4}permissions:/m.test(job.text);
			const effective = hasOwn ? grantsIdTokenWrite(job.text, 4) : topGrants;
			if (!effective) continue;
			checked++;
			for (const body of runBodies(job.text)) {
				const label = `${file}#${job.name}`;
				for (const m of body.matchAll(
					/\bnpm\s+(?:ci|install|i|add)\b[^\n]*/g,
				)) {
					assert.match(
						m[0],
						/--ignore-scripts/,
						`${label} installs dependencies with lifecycle scripts while holding id-token: write`,
					);
				}
				for (const [pattern, name] of forbidden) {
					assert.doesNotMatch(
						body,
						pattern,
						`${label} runs "${name}" while holding id-token: write`,
					);
				}
			}
		}
	}
	assert.ok(checked >= 3, "expected to inspect the OIDC-bearing jobs");
});
