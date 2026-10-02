#!/usr/bin/env node
// Fails when regenerating would change a committed generated file. Runs the
// real generators, compares the output with what was on disk, then puts the
// original contents back so a run never leaves the tree dirty.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const GENERATED = ["lhm.plugin.json", "ENDPOINTS.md"];
const original = new Map(
	GENERATED.map((file) => [file, readFileSync(path.join(root, file), "utf8")]),
);

// ENDPOINTS.md takes its descriptions from lhm.plugin.json, so the manifest
// has to be regenerated first.
const STEPS = ["generate:lobehub-tools", "generate:endpoints"];

function restore() {
	for (const [file, contents] of original) {
		writeFileSync(path.join(root, file), contents);
	}
}

try {
	let failed = false;
	for (const script of STEPS) {
		const result = spawnSync("npm", ["run", "--silent", script], {
			cwd: root,
			encoding: "utf8",
		});
		if (result.status !== 0) {
			process.stderr.write(result.stdout ?? "");
			process.stderr.write(result.stderr ?? "");
			console.error(`verify-generated: npm run ${script} failed`);
			failed = true;
			break;
		}
	}

	if (!failed) {
		const stale = GENERATED.filter(
			(file) =>
				readFileSync(path.join(root, file), "utf8") !== original.get(file),
		);
		if (stale.length > 0) {
			for (const file of stale) {
				console.error(`verify-generated: ${file} is stale`);
			}
			console.error(
				"Regenerate and commit: npm run generate:lobehub-tools && npm run generate:endpoints",
			);
			failed = true;
		} else {
			console.log(
				`verify-generated: ${GENERATED.join(" and ")} match the generators`,
			);
		}
	}
	process.exitCode = failed ? 1 : 0;
} finally {
	restore();
}
