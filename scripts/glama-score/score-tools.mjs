#!/usr/bin/env node
/**
 * Score current tool descriptions using the Glama TDQS rubric (reverse-engineered
 * from docs/glama-score/scores.json). Outputs JSON in the same shape as Glama's
 * own scoring payload so it can be diffed against the v1.0.0 baseline.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/glama-score/score-tools.mjs
 *   ANTHROPIC_API_KEY=... node scripts/glama-score/score-tools.mjs --sample 10
 *   ANTHROPIC_API_KEY=... node scripts/glama-score/score-tools.mjs --model claude-sonnet-4-6
 *
 * Env:
 *   ANTHROPIC_API_KEY       required
 *   ANTHROPIC_BASE_URL      optional (e.g. Portkey gateway)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const IN_PATH = resolve(ROOT, "docs/glama-score/current-descriptions.json");
const OUT_PATH = resolve(ROOT, "docs/glama-score/current-scores.json");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SAMPLE = parseInt(flag("sample", "0"), 10);
const MODEL = flag("model", "claude-sonnet-4-6");
const CONCURRENCY = parseInt(flag("concurrency", "5"), 10);

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
	console.error("ANTHROPIC_API_KEY is required");
	process.exit(1);
}
const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";

const tools = JSON.parse(readFileSync(IN_PATH, "utf8"));
const allNames = tools.map((t) => t.name);
const targets = SAMPLE > 0 ? tools.slice(0, SAMPLE) : tools;

// Rubric reverse-engineered from Glama's verbatim justifications (scores.json).
// Dimension weights: P 25%, U 20%, B 20%, Pa 15%, Co 10%, Cx 10%.
// TDQS = weighted sum, rounded to 1 decimal. Tier: A >=3.5, B >=3.1, C >=2.6, D >=2.0, F <2.0.
const SYSTEM_PROMPT = `You are the Glama Tool Definition Quality Score (TDQS) evaluator. You score MCP tool descriptions using the exact rubric Glama applies, returning a single JSON object with integer 0-5 scores across six dimensions plus per-dimension justifications.

# Dimensions and weights
1. purpose_clarity (25%)      — Is the action (verb) + resource + differentiation from sibling tools clear?
2. usage_guidelines (20%)     — Is there explicit guidance on when to use vs. alternatives? Prerequisites?
3. behavioral_transparency (20%) — Side effects, reversibility, async/sync, permissions, error cases disclosed?
4. parameter_semantics (15%)  — Does the description add semantic value beyond schema (format, sourcing, constraints)?
5. conciseness_structure (10%)— Front-loaded, no wasted words, appropriate length for complexity?
6. contextual_completeness (10%) — Return fields enumerated (for reads), response/error shape described (for mutations)?

# Score anchors (use these exactly)
PURPOSE CLARITY:
  5 = verb + resource + explicit disambiguation from NAMED sibling tools ("unlike get_cost_analytics...")
  4 = verb + resource clear, no named sibling disambiguation
  3 = verb vague (e.g. "start" without explaining what starts)
  2 = unclear action or resource
  1 = incomprehensible

USAGE GUIDELINES:
  5 = explicit rule + named concrete examples ("Use one collection per app: foo, bar, baz")
  4 = states when to use ("Useful for CI/CD") OR explicit prerequisites ("REQUIRES billing metadata: x, y, z")
  3 = implied usage context only
  2 = no guidance on when to use vs. alternatives and no prerequisites
  1 = misleading or absent

BEHAVIORAL TRANSPARENCY:
  5 = full disclosure: reversibility, side effects on siblings, async, permissions, error conditions
  4 = discloses multiple key traits (e.g. irreversible + cross-resource side effect)
  3 = mentions one behavioral trait (usually "cannot be undone")
  2 = names verb only, no side effects, no async info, no permissions, no errors
  1 = misleading about behavior

PARAMETER SEMANTICS:
  4 = ZERO parameters (baseline) OR description meaningfully adds format/sourcing/semantic context beyond schema
  3 = schema coverage 100% but description doesn't add semantic value
  2 = schema gaps and description doesn't compensate
  1 = schema and description both unclear

CONCISENESS & STRUCTURE:
  5 = single or two sentences, front-loaded, no wasted words
  4 = concise but could be marginally tighter OR could be slightly more structured
  3 = wordy or buried action
  2 = meandering
  1 = rambling

CONTEXTUAL COMPLETENESS:
  4+ = return fields enumerated (reads) OR response/error shape described (mutations)
  3 = states purpose with partial context on outcomes
  2 = basic purpose only, no outcome/return/error description
  1 = incomplete even on purpose

# Output format
Return ONLY a JSON object with this exact shape. No prose outside JSON.
{
  "name": "<tool name echoed>",
  "purposeClarity": <int 1-5>,
  "usageGuidelines": <int 1-5>,
  "behavioralTransparency": <int 1-5>,
  "parameterSemantics": <int 1-5>,
  "concisenessStructure": <int 1-5>,
  "contextualCompleteness": <int 1-5>,
  "justifications": {
    "purpose_clarity":         { "score": <int>, "justification": "<one sentence>" },
    "usage_guidelines":        { "score": <int>, "justification": "<one sentence>" },
    "behavioral_transparency": { "score": <int>, "justification": "<one sentence>" },
    "parameter_semantics":     { "score": <int>, "justification": "<one sentence>" },
    "conciseness_structure":   { "score": <int>, "justification": "<one sentence>" },
    "contextual_completeness": { "score": <int>, "justification": "<one sentence>" }
  },
  "summary": "<one-sentence overall>",
  "smells": ["<dimension_key>", ...]   // any dimension scoring <=2
}

# Sibling tool list (for disambiguation judgments)
${allNames.join(", ")}
`;

function computeTdqs(s) {
	// weights per Glama: P 25, U 20, B 20, Pa 15, Co 10, Cx 10
	const w =
		s.purposeClarity * 0.25 +
		s.usageGuidelines * 0.2 +
		s.behavioralTransparency * 0.2 +
		s.parameterSemantics * 0.15 +
		s.concisenessStructure * 0.1 +
		s.contextualCompleteness * 0.1;
	return Math.round(w * 10) / 10;
}

function computeTier(tdqs) {
	if (tdqs >= 3.5) return "A";
	if (tdqs >= 3.1) return "B";
	if (tdqs >= 2.6) return "C";
	if (tdqs >= 2.0) return "D";
	return "F";
}

async function scoreOne(tool) {
	const userMsg = `Tool name: ${tool.name}\n\nDescription:\n"${tool.description}"\n\nScore this tool and return the JSON object.`;
	const body = {
		model: MODEL,
		max_tokens: 2000,
		system: [
			{
				type: "text",
				text: SYSTEM_PROMPT,
				cache_control: { type: "ephemeral" },
			},
		],
		messages: [{ role: "user", content: userMsg }],
	};
	const res = await fetch(`${BASE_URL}/v1/messages`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": API_KEY,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`API ${res.status}: ${err}`);
	}
	const data = await res.json();
	const text = data.content?.[0]?.text || "";
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);
	const parsed = JSON.parse(jsonMatch[0]);
	const tdqs = computeTdqs(parsed);
	return { ...parsed, tdqs, tier: computeTier(tdqs) };
}

// Simple concurrency-limited map
async function mapLimit(items, limit, fn) {
	const results = new Array(items.length);
	let idx = 0;
	const workers = Array.from({ length: limit }, async () => {
		while (idx < items.length) {
			const i = idx++;
			try {
				results[i] = await fn(items[i], i);
				process.stdout.write(`\rScored ${i + 1}/${items.length}  `);
			} catch (err) {
				console.error(`\n  ${items[i].name}: ${err.message}`);
				results[i] = { name: items[i].name, error: err.message };
			}
		}
	});
	await Promise.all(workers);
	console.log();
	return results;
}

console.log(
	`Scoring ${targets.length} tools with ${MODEL} (concurrency=${CONCURRENCY})`,
);
const scored = await mapLimit(targets, CONCURRENCY, scoreOne);

const ok = scored.filter((s) => !s.error);
const failed = scored.filter((s) => s.error);
const tdqsVals = ok.map((s) => s.tdqs);
const mean = tdqsVals.reduce((a, b) => a + b, 0) / (tdqsVals.length || 1);
const tiers = {};
for (const s of ok) {
	tiers[s.tier] = (tiers[s.tier] || 0) + 1;
}

console.log(
	`\nSuccess: ${ok.length}/${targets.length}${failed.length ? ` (${failed.length} failed)` : ""}`,
);
console.log(`Mean TDQS: ${mean.toFixed(2)}`);
console.log(`Tier distribution:`, tiers);

writeFileSync(
	OUT_PATH,
	JSON.stringify(
		{
			meta: {
				model: MODEL,
				scoredAt: new Date().toISOString(),
				sourceFile: "docs/glama-score/current-descriptions.json",
				toolCount: ok.length,
				meanTdqs: Math.round(mean * 100) / 100,
				tierDistribution: tiers,
			},
			toolScores: scored,
		},
		null,
		2,
	),
);
console.log(`\nWrote: ${OUT_PATH}`);
