import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tarball = process.argv[2];
if (!tarball) {
	throw new Error("Usage: node scripts/smoke-package.mjs <package.tgz>");
}

const installRoot = await mkdtemp(join(tmpdir(), "portkey-package-smoke-"));
const binRoot = join(installRoot, "node_modules", ".bin");
const stdioBin = join(binRoot, "portkey-admin-mcp");
const httpBin = join(binRoot, "portkey-admin-mcp-http");

function waitForExit(child, timeoutMs) {
	if (child.exitCode !== null) return Promise.resolve(true);
	return new Promise((resolveExit) => {
		const onExit = () => {
			clearTimeout(timeout);
			resolveExit(true);
		};
		const timeout = setTimeout(() => {
			child.off("exit", onExit);
			resolveExit(false);
		}, timeoutMs);
		child.once("exit", onExit);
	});
}

async function stopProcess(child) {
	if (child.exitCode !== null) return;
	child.kill("SIGTERM");
	if (await waitForExit(child, 2_000)) return;
	child.kill("SIGKILL");
	await waitForExit(child, 2_000);
}

async function getFreePort() {
	const server = net.createServer();
	await new Promise((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolveListen);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to reserve a loopback port");
	}
	await new Promise((resolveClose, reject) => {
		server.close((error) => (error ? reject(error) : resolveClose()));
	});
	return address.port;
}

async function smokeStdio() {
	const child = spawn(stdioBin, [], {
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, MCP_TRANSPORT: "stdio" },
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	try {
		child.stdin.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "package-smoke", version: "1.0.0" },
				},
			})}\n`,
		);
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline) {
			for (const line of stdout.split("\n")) {
				try {
					const message = JSON.parse(line);
					if (message.id === 1 && message.result?.serverInfo) return;
				} catch {
					// Ignore incomplete and non-JSON lines while the process starts.
				}
			}
			await new Promise((resolveWait) => setTimeout(resolveWait, 25));
		}
		throw new Error(`stdio initialize timed out: ${stderr}`);
	} finally {
		await stopProcess(child);
	}
}

async function smokeHttp() {
	const port = await getFreePort();
	const child = spawn(httpBin, [], {
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			MCP_ALLOW_UNAUTHENTICATED_HTTP: "true",
			MCP_AUTH_MODE: "none",
			MCP_HOST: "127.0.0.1",
			MCP_TRANSPORT: "http",
			PORT: String(port),
			RATE_LIMIT_ENABLED: "false",
		},
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	try {
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline) {
			if (child.exitCode !== null) {
				throw new Error(
					`HTTP executable exited with code ${child.exitCode}:\n${stdout}\n${stderr}`,
				);
			}
			try {
				const response = await fetch(`http://127.0.0.1:${port}/health`);
				if (response.ok) return;
			} catch {
				// The server may still be binding the loopback listener.
			}
			await new Promise((resolveWait) => setTimeout(resolveWait, 50));
		}
		throw new Error(`HTTP /health timed out:\n${stdout}\n${stderr}`);
	} finally {
		await stopProcess(child);
	}
}

try {
	const install = spawnSync(
		"npm",
		["install", "--ignore-scripts", "--prefix", installRoot, resolve(tarball)],
		{ encoding: "utf8" },
	);
	if (install.status !== 0) {
		throw new Error(
			`npm install failed:\n${install.stdout}\n${install.stderr}`,
		);
	}
	await Promise.all([
		access(stdioBin, constants.X_OK),
		access(httpBin, constants.X_OK),
	]);
	await smokeStdio();
	await smokeHttp();
} finally {
	await rm(installRoot, { recursive: true, force: true });
}
