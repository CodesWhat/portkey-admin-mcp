#!/usr/bin/env node
/**
 * Portkey MCP Server - HTTP transport entry point
 */
import { pathToFileURL } from "node:url";
import { createHttpAppRuntime, type HttpAppRuntime } from "./lib/http-app.js";

let sharedRuntime: HttpAppRuntime | undefined;

export { createHttpAppRuntime, type HttpAppRuntime } from "./lib/http-app.js";

export function getHttpAppRuntime(): HttpAppRuntime {
	if (!sharedRuntime) {
		sharedRuntime = createHttpAppRuntime();
	}
	return sharedRuntime;
}

export function setServerReady(value = true): void {
	getHttpAppRuntime().setServerReady(value);
}

export async function closeHttpApp(): Promise<void> {
	if (!sharedRuntime) {
		return;
	}

	const runtime = sharedRuntime;
	sharedRuntime = undefined;
	await runtime.closeHttpApp();
}

export function startHttpServer() {
	return getHttpAppRuntime().startHttpServer();
}

function isMainModule(): boolean {
	const entrypoint = process.argv[1];
	if (!entrypoint) {
		return false;
	}
	return import.meta.url === pathToFileURL(entrypoint).href;
}

if (isMainModule()) {
	startHttpServer();
}
