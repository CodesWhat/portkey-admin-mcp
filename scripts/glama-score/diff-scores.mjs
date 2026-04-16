#!/usr/bin/env node
/**
 * Diff v1.0.0 Glama scores (docs/glama-score/scores.json) against our local
 * re-score of current main (docs/glama-score/current-scores.json).
 *
 * Output: a delta table per tool plus aggregate stats.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const BASELINE = JSON.parse(
	readFileSync(resolve(ROOT, "docs/glama-score/scores.json"), "utf8"),
).toolScores;
const CURRENT = JSON.parse(
	readFileSync(resolve(ROOT, "docs/glama-score/current-scores.json"), "utf8"),
).toolScores;

const baseByName = Object.fromEntries(BASELINE.map((t) => [t.name, t]));
const curByName = Object.fromEntries(CURRENT.map((t) => [t.name, t]));

const allNames = [
	...new Set([...Object.keys(baseByName), ...Object.keys(curByName)]),
].sort();

const dims = [
	"purposeClarity",
	"usageGuidelines",
	"behavioralTransparency",
	"parameterSemantics",
	"concisenessStructure",
	"contextualCompleteness",
];

const rows = [];
for (const name of allNames) {
	const b = baseByName[name];
	const c = curByName[name];
	rows.push({
		name,
		status: b && c ? "both" : b ? "removed" : "added",
		baselineTdqs: b?.tdqs ?? null,
		currentTdqs: c?.tdqs ?? null,
		delta: b && c ? Math.round((c.tdqs - b.tdqs) * 10) / 10 : null,
		baselineTier: b?.tier ?? null,
		currentTier: c?.tier ?? null,
		dims: dims.map((d) => ({
			dim: d,
			base: b?.[d] ?? null,
			cur: c?.[d] ?? null,
			delta: b && c && b[d] != null && c[d] != null ? c[d] - b[d] : null,
		})),
	});
}

// Aggregate stats
const both = rows.filter((r) => r.status === "both");
const improved = both.filter((r) => r.delta > 0);
const regressed = both.filter((r) => r.delta < 0);
const unchanged = both.filter((r) => r.delta === 0);
const added = rows.filter((r) => r.status === "added");
const removed = rows.filter((r) => r.status === "removed");

const baseMean =
	both.reduce((a, r) => a + r.baselineTdqs, 0) / (both.length || 1);
const curMean =
	both.reduce((a, r) => a + r.currentTdqs, 0) / (both.length || 1);

console.log(`=== TDQS Diff ===`);
console.log(`Tools in both: ${both.length}`);
console.log(`  improved:  ${improved.length}`);
console.log(`  unchanged: ${unchanged.length}`);
console.log(`  regressed: ${regressed.length}`);
console.log(`Added in current: ${added.length}`);
console.log(`Removed since baseline: ${removed.length}`);
console.log();
console.log(
	`Mean TDQS (tools in both): baseline=${baseMean.toFixed(2)} → current=${curMean.toFixed(2)}  Δ=${(curMean - baseMean).toFixed(2)}`,
);
console.log();

console.log(`=== Top 10 improvements ===`);
for (const r of [...improved].sort((a, b) => b.delta - a.delta).slice(0, 10)) {
	console.log(
		`  +${r.delta.toFixed(1)}  ${r.name}  (${r.baselineTdqs}→${r.currentTdqs}, ${r.baselineTier}→${r.currentTier})`,
	);
}
console.log();

if (regressed.length) {
	console.log(`=== Regressions ===`);
	for (const r of regressed.sort((a, b) => a.delta - b.delta)) {
		console.log(
			`  ${r.delta.toFixed(1)}  ${r.name}  (${r.baselineTdqs}→${r.currentTdqs})`,
		);
	}
	console.log();
}

console.log(`=== Bottom 10 current (worst still need work) ===`);
for (const r of [...both, ...added]
	.sort((a, b) => (a.currentTdqs ?? 99) - (b.currentTdqs ?? 99))
	.slice(0, 10)) {
	const note = r.status === "added" ? " [new]" : "";
	console.log(
		`  ${r.currentTdqs?.toFixed(1) ?? "?"}  ${r.currentTier ?? "?"}  ${r.name}${note}`,
	);
}

// Write detailed diff
const outPath = resolve(ROOT, "docs/glama-score/diff.json");
writeFileSync(
	outPath,
	JSON.stringify(
		{
			summary: {
				both: both.length,
				improved: improved.length,
				unchanged: unchanged.length,
				regressed: regressed.length,
				added: added.length,
				removed: removed.length,
				baselineMean: Math.round(baseMean * 100) / 100,
				currentMean: Math.round(curMean * 100) / 100,
				deltaMean: Math.round((curMean - baseMean) * 100) / 100,
			},
			rows,
		},
		null,
		2,
	),
);
console.log(`\nWrote: ${outPath}`);
