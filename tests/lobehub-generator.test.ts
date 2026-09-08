import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoots = new Set<string>();

interface CommandResult {
	code: number | null;
	stderr: string;
	stdout: string;
}

interface Manifest {
	[key: string]: unknown;
	description: string;
	prompts: unknown[];
	resources: unknown[];
	tools: Array<Record<string, unknown>>;
	version: string;
}

interface Capabilities {
	prompts: unknown[];
	resources: unknown[];
	tools: Array<Record<string, unknown>>;
}

async function run(
	command: string,
	args: string[],
	options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> {
	return new Promise((resolveResult, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const deadline = setTimeout(() => child.kill("SIGKILL"), 20_000);

		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", (error) => {
			clearTimeout(deadline);
			reject(error);
		});
		child.once("close", (code) => {
			clearTimeout(deadline);
			resolveResult({ code, stderr, stdout });
		});
	});
}

function paginatedClientSource(tracePath: string): string {
	const clientUrl = pathToFileURL(
		resolve(
			root,
			"node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js",
		),
	).href;

	return `
import { appendFileSync } from "node:fs";
import { Client as ActualClient } from ${JSON.stringify(clientUrl)};

const PAGE_SIZE = 50;
const TRACE_PATH = ${JSON.stringify(tracePath)};

function paginate(items, field, cursor) {
  const offset = cursor ? Number(cursor) : 0;
  const nextOffset = offset + PAGE_SIZE;
  appendFileSync(TRACE_PATH, field + ":" + offset + "\\n");
  return {
    [field]: items.slice(offset, nextOffset),
    ...(nextOffset < items.length ? { nextCursor: String(nextOffset) } : {}),
  };
}

export class Client extends ActualClient {
  async listTools(params = {}, options) {
    const response = await super.listTools({}, options);
    return paginate(response.tools, "tools", params.cursor);
  }

  async listPrompts(params = {}, options) {
    const response = await super.listPrompts({}, options);
    return paginate(response.prompts, "prompts", params.cursor);
  }

  async listResources(params = {}, options) {
    const response = await super.listResources({}, options);
    return paginate(response.resources, "resources", params.cursor);
  }

  async listResourceTemplates(params = {}, options) {
    const response = await super.listResourceTemplates({}, options);
    return paginate(response.resourceTemplates, "resourceTemplates", params.cursor);
  }
}
`;
}

async function createFixture(manifest: Manifest): Promise<{
	manifestPath: string;
	root: string;
	tracePath: string;
}> {
	const fixtureRoot = await mkdtemp(
		join(tmpdir(), "portkey-lobehub-generator-"),
	);
	temporaryRoots.add(fixtureRoot);
	const scriptDir = join(fixtureRoot, "scripts");
	const buildDir = join(fixtureRoot, "build");
	const sdkClientDir = join(
		fixtureRoot,
		"node_modules/@modelcontextprotocol/sdk/client",
	);
	const sdkPackageDir = dirname(sdkClientDir);
	const manifestPath = join(fixtureRoot, "lhm.plugin.json");
	const tracePath = join(fixtureRoot, "pagination.log");

	await Promise.all([
		mkdir(scriptDir, { recursive: true }),
		mkdir(buildDir, { recursive: true }),
		mkdir(sdkClientDir, { recursive: true }),
	]);
	await Promise.all([
		copyFile(
			join(root, "scripts/generate-lobehub-tools.mjs"),
			join(scriptDir, "generate-lobehub-tools.mjs"),
		),
		symlink(join(root, "build/index.js"), join(buildDir, "index.js")),
		writeFile(
			join(sdkPackageDir, "package.json"),
			`${JSON.stringify({
				type: "module",
				exports: {
					"./client/index.js": "./client/index.js",
					"./client/stdio.js": "./client/stdio.js",
				},
			})}\n`,
		),
		writeFile(join(sdkClientDir, "index.js"), paginatedClientSource(tracePath)),
		writeFile(
			join(sdkClientDir, "stdio.js"),
			`export { StdioClientTransport } from ${JSON.stringify(
				pathToFileURL(
					resolve(
						root,
						"node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js",
					),
				).href,
			)};\n`,
		),
		writeFile(
			join(fixtureRoot, "package.json"),
			`${JSON.stringify({ version: "9.8.7" })}\n`,
		),
		writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`),
	]);

	return { manifestPath, root: fixtureRoot, tracePath };
}

async function runGenerator(fixtureRoot: string): Promise<CommandResult> {
	return run(
		process.execPath,
		[join(fixtureRoot, "scripts/generate-lobehub-tools.mjs")],
		{
			cwd: fixtureRoot,
			env: {
				...process.env,
				MCP_TOOL_DOMAINS: "users",
				PORTKEY_TOOL_DOMAINS: "users",
			},
		},
	);
}

async function readActualCapabilities(): Promise<Capabilities> {
	const {
		MCP_TOOL_DOMAINS: _mcpDomains,
		PORTKEY_TOOL_DOMAINS: _portkeyDomains,
		...cleanEnv
	} = process.env;
	const transport = new StdioClientTransport({
		args: [join(root, "build/index.js")],
		command: process.execPath,
		env: { ...cleanEnv, PORTKEY_API_KEY: "manifest-test-dummy-key" },
		stderr: "pipe",
	});
	transport.stderr?.on("data", () => undefined);
	const client = new Client({
		name: "lobehub-generator-test",
		version: "1.0.0",
	});

	try {
		await client.connect(transport);
		const toolsPage = await client.listTools({});
		const promptsPage = await client.listPrompts({});
		const resourcesPage = await client.listResources({});
		const templatesPage = await client.listResourceTemplates({});

		return {
			prompts: promptsPage.prompts,
			resources: [
				...resourcesPage.resources,
				...templatesPage.resourceTemplates,
			],
			tools: toolsPage.tools.map(
				({ name, description, inputSchema, annotations }) => ({
					name,
					description,
					inputSchema,
					...(annotations ? { annotations } : {}),
				}),
			),
		};
	} finally {
		await client.close().catch(() => undefined);
	}
}

before(async () => {
	const result = await run("npm", ["run", "build"], { cwd: root });
	assert.equal(result.code, 0, result.stderr || result.stdout);
});

after(async () => {
	await Promise.all(
		[...temporaryRoots].map((temporaryRoot) =>
			rm(temporaryRoot, { force: true, recursive: true }),
		),
	);
});

describe("LobeHub manifest generator", () => {
	it("collects the complete MCP catalog across pages", async () => {
		const current = JSON.parse(
			await readFile(join(root, "lhm.plugin.json"), "utf8"),
		) as Manifest;
		const actual = await readActualCapabilities();
		const seed = {
			...current,
			author: "Fixture Owner",
			description: "stale description",
			homepage: "https://example.com/fixture",
			prompts: [],
			resources: [],
			tags: ["fixture"],
			tools: [],
			version: "0.0.0",
		};
		const fixture = await createFixture(seed);

		const result = await runGenerator(fixture.root);

		assert.equal(result.code, 0, result.stderr || result.stdout);
		assert.match(
			result.stdout,
			/Wrote 181 tools, 1 prompts, and 1 resources\/templates/,
		);
		const generated = JSON.parse(
			await readFile(fixture.manifestPath, "utf8"),
		) as Manifest;
		assert.equal(generated.tools.length, 181);
		assert.deepEqual(generated.tools, actual.tools);
		assert.deepEqual(generated.prompts, actual.prompts);
		assert.deepEqual(generated.resources, actual.resources);
		assert.ok(
			generated.tools.every((tool) =>
				[...Object.keys(tool)].every((key) =>
					["annotations", "description", "inputSchema", "name"].includes(key),
				),
			),
		);
		assert.equal(generated.version, "9.8.7");
		assert.equal(
			generated.description,
			"Portkey Admin API MCP server with current control-plane coverage, 181 tools, and Prisma AIRS interoperability guidance.",
		);
		assert.equal(generated.author, "Fixture Owner");
		assert.equal(generated.homepage, "https://example.com/fixture");
		assert.deepEqual(generated.tags, ["fixture"]);

		const paginationTrace = await readFile(fixture.tracePath, "utf8");
		assert.deepEqual(
			paginationTrace.split("\n").filter((entry) => entry.startsWith("tools:")),
			["tools:0", "tools:50", "tools:100", "tools:150"],
		);
	});

	it("refuses a smaller catalog without changing the manifest", async () => {
		const current = JSON.parse(
			await readFile(join(root, "lhm.plugin.json"), "utf8"),
		) as Manifest;
		const seed = {
			...current,
			tools: [
				...current.tools,
				{
					description: "Must remain in the seeded manifest",
					inputSchema: { properties: {}, type: "object" },
					name: "fixture_extra_tool",
				},
			],
		};
		const fixture = await createFixture(seed);
		const beforeGeneration = await readFile(fixture.manifestPath, "utf8");

		const result = await runGenerator(fixture.root);

		assert.equal(result.code, 1);
		assert.match(
			result.stderr,
			/Server returned 181 tools but the manifest has 182; refusing to write/,
		);
		assert.equal(
			await readFile(fixture.manifestPath, "utf8"),
			beforeGeneration,
		);
	});
});
