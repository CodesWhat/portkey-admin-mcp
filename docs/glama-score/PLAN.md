# Glama Score Improvement Plan

Reference doc for driving the Glama Tool Definition Quality Score (TDQS) up across all 117 tools. Data artifacts live alongside this file:

- `scores.json` — full per-tool Glama scoring (6 dimensions, TDQS, tier, smells, verbatim justifications, summary)
- `scores.csv` — flat table for spreadsheet triage
- `justifications-by-dimension.txt` — Glama's verbatim critiques bucketed by score, per dimension

**Source snapshot:** Glama scored release **v1.0.0**. Some tools have since been improved in `main` (commit `22cddd9 📝 docs(tools): tighten MCP tool descriptions`). Assume every checklist entry needs a current-main diff before rewriting.

---

## Baseline (from Glama's v1.0.0 scan)

| Metric | Value |
|---|---|
| Overall server score | 83% |
| Tool count scored | 117 |
| Tier A / B / C / D / F | 22 / 34 / 61 / 0 / 0 |
| Mean TDQS | 3.14 / 5.0 |
| TDQS range | 2.6 – 4.2 |

**Per-dimension averages:**

| Dimension | Avg | Weight | Status |
|---|---|---|---|
| Conciseness & Structure | 4.84 | 10% | strong — don't regress |
| Purpose Clarity | 4.20 | 25% | strong — top up to 5 |
| Parameter Semantics | 3.05 | 15% | flat 3s — leverage opportunity |
| Contextual Completeness | 2.44 | 10% | weak |
| Usage Guidelines | 2.30 | 20% | weak |
| Behavioral Transparency | 2.26 | 20% | weak |

**Most common smells:** `behavioral_transparency` (97 tools), `usage_guidelines` (90), `contextual_completeness` (69).

**Target (post-rewrite):**
- Mean TDQS ≥ 3.8
- Zero C-tier tools (all → B or better)
- ≥ 60 tools at A-tier
- Overall server score ≥ 92%

---

## Goal

Move every tool description to satisfy Glama's 6-dimension rubric without bloating length. The high-weight, low-scoring dimensions (Behavior + Usage + Purpose) carry 65% of TDQS — fix those and the score follows.

---

## The Rubric (reverse-engineered from scores.json)

### Purpose Clarity (weight 25%) — avg 4.20

| Score | What earns it |
|---|---|
| **5** | States verb + resource + **explicit disambiguation from named sibling tools** (e.g. *"unlike `get_cost_analytics` or `get_latency_analytics`, this returns time-series hit-rate data"*) |
| **4** | States verb + resource clearly, but doesn't name siblings |
| **3** | Verb is vague (e.g. *"start"* without stating what starts) |

**Fix:** one `(vs. sibling_tool)` clause per description.

### Usage Guidelines (weight 20%) — avg 2.30

| Score | What earns it |
|---|---|
| **5** | Explicit usage rule + named examples (e.g. *"Use one collection per app: hourlink, apizone, research-pilot"*) |
| **4** | States when to use (*"Useful for CI/CD workflows"*) OR explicit prerequisites (*"REQUIRES billing metadata: client_id, app, env"*) |
| **3** | Implied context through wording (*"scoped to workspaces"*) — no explicit guidance |
| **2** | No guidance on when to use vs. alternatives, no prerequisites named |

**Fix:** add *"Use this when X; for Y use `other_tool`."* plus prerequisite sentence.

### Behavioral Transparency (weight 20%) — avg 2.26

| Score | What earns it |
|---|---|
| **4** | Discloses reversibility, side-effects on other resources, and scope (*"cannot be undone… prompts in this collection will become orphaned"*) |
| **3** | Mentions one behavioral trait (usually *"cannot be undone"*) |
| **2** | Names the verb only — no side effects, no async info, no error conditions, no permissions |

**Fix:** for mutations, include: reversibility · side effects on siblings · async/sync · required permissions · common error conditions. For reads: rate limits · pagination · response-size caveats.

### Contextual Completeness (weight 10%) — avg 2.44

| Score | What earns it |
|---|---|
| **4** | Enumerates return fields (e.g. `get_trace`: *"returns request/response data, spans, metadata, cost, token usage, feedback"*) |
| **3** | States purpose, partial context on one aspect |
| **2** | Basic purpose only; no return-shape, error-case, or outcome description |

**Fix:** for reads, list return fields; for mutations, describe confirmation/response shape and error outcomes.

### Parameter Semantics (weight 15%) — avg 3.05

Stuck at 3 for 111 of 117 tools. Schema coverage is 100%, but descriptions don't add semantic context beyond the schema. The 4s all have zero parameters (nothing needed).

**Fix:** echo in the tool description: format examples, sourcing (*"user_id is a UUID from `list_all_users`"*), semantic constraints (*"role_slug must be one of: admin, member, viewer"*). Not every param — the important or non-obvious ones.

### Conciseness & Structure (weight 10%) — avg 4.84

98 of 117 already at 5. Risk when adding content above: watch for wordiness.

**Fix:** compress ruthlessly. If a rewrite crosses ~3 sentences, tighten. Front-load the action verb.

---

## Description Template

Target shape (one to three sentences, front-loaded):

```
<Verb> <resource> <core purpose>. <Key behavior: reversibility / async / side effects>.
Use when <trigger>; for <sibling purpose> use `<sibling_tool>`. <Prerequisite / returned-fields note>.
```

Example (hypothetical 5/5/5/5/5/5 for `start_log_export`):
> Start processing a previously created log export job. Asynchronous and idempotent — only queues the export, does not return rows. Use when a `create_log_export` job is ready to run; poll `get_log_export` for progress, then `download_log_export` when complete. Requires `export_id` from `list_log_exports`.

---

## Workflow per tool

For each tool on the checklist:

1. **Read current description in `main`** — it may already beat the v1.0.0 snapshot.
2. **Open the Glama justifications** — `scores.json` → `toolScores[].justifications.<dimension>.justification` spells out exactly what Glama flagged.
3. **Check which rubric rules are unmet** using the per-dim inline scorecard (e.g. `P4 U2 Pa3 Co5 B2 Cx2` → Usage + Behavior + Completeness all need work).
4. **Rewrite** using the template. Keep ≤ 3 sentences.
5. **Sanity-check against the 6 dimensions** (self-grade — does it name siblings? disclose side effects? etc.).
6. **Grep for docs/tests** referencing the tool's description — `README.md`, `ENDPOINTS.md`, `scripts/verify-readme-tools.mjs` generated content, snapshot tests — update if present.
7. **Tick the checkbox below**, commit with `📝 docs(tools): …`.
8. **After each batch**, run `npm run build` + test suite to confirm nothing references the old text.

---

## Validation

- **Batch size:** 10–15 tools per commit, grouped by domain file (e.g. all `logging.tools.ts` at once).
- **After each batch:** `npm run build`, `npm test`, `scripts/verify-readme-tools.mjs` (readme tool list stays in sync).
- **After full pass:**
  1. Cut a release (`v0.4.0` or similar) so Glama re-scans the latest tagged version.
  2. Wait ~24–72h for Glama re-score (their scanner runs periodically).
  3. Re-run the scraper: `python3 scripts/glama-score/fetch-scores.py` (see below) and diff `scores.json` against the new run.
  4. Confirm mean TDQS ≥ 3.8 and zero C-tier.

### Re-scan fetch script (to codify)

The current data was pulled from `https://glama.ai/mcp/servers/scttbnsn/portkey-admin-mcp/score.data` (React Router Turbo Stream payload). Add a small script under `scripts/glama-score/` that:
- Fetches that URL
- Decodes the Turbo Stream payload (see `/tmp/glama-score/decode.py` reference implementation)
- Writes `docs/glama-score/scores.json` and `scores.csv`

So future audits are one command.

---

## Definition of Done

- [ ] Every tool in the checklist below is checked
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `scripts/verify-readme-tools.mjs` clean
- [ ] Release cut (so Glama re-scans)
- [ ] Post-rescan `scores.json` shows: mean TDQS ≥ 3.8, zero C-tier, ≥ 60 A-tier
- [ ] Overall Glama server score ≥ 92%
- [ ] Fetch/decode script committed under `scripts/glama-score/`

---

## Tool Checklist (sorted worst-TDQS first, grouped by tier)

Format: `tool_name` — **TDQS** `P<purpose> U<usage> Pa<params> Co<conciseness> B<behavior> Cx<completeness>` · smells

Smells legend: `behavior` = behavioral_transparency, `usage` = usage_guidelines, `completeness` = contextual_completeness, `params` = parameter_semantics, `purpose` = purpose_clarity, `conciseness` = conciseness_structure.

### Tier C — 61 tools (all must leave C)

- [ ] `start_log_export` — **2.6** `P3 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `add_workspace_member` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `cancel_log_export` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_api_key` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_config` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_guardrail` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_log_export` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_prompt` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_prompt_partial` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_rate_limit` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_virtual_key` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `create_workspace` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `delete_integration_model` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `delete_user_invite` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_cache_hit_latency` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_cost_analytics` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_error_analytics` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_error_rate_analytics` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_guardrail` — **2.9** `P4 U2 Pa3 Co4 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_integration` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_latency_analytics` — **2.9** `P4 U2 Pa3 Co4 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_prompt_label` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_prompt_partial` — **2.9** `P4 U2 Pa3 Co4 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_provider` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_request_analytics` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_token_analytics` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_usage_limit` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_user` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_user_invite` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_user_stats` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_users_analytics` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_workspace_member` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `insert_log` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_collections` — **2.9** `P4 U2 Pa3 Co4 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_config_versions` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_integration_workspaces` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_log_exports` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_partial_versions` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_rate_limits` — **2.9** `P4 U2 Pa3 Co4 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_traces` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_usage_limits` — **2.9** `P4 U2 Pa3 Co4 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_workspace_members` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_workspaces` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `remove_workspace_member` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `resend_user_invite` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_api_key` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_collection` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_config` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_guardrail` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_integration` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_integration_models` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_prompt` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_prompt_label` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_prompt_partial` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_provider` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_rate_limit` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_usage_limit` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_user` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_virtual_key` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_workspace` — **2.9** `P4 U2 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `update_workspace_member` — **2.9** `P4 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_

### Tier B — 34 tools (lift to A where practical)

- [ ] `create_prompt_label` — **3.1** `P4 U3 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness_
- [ ] `create_usage_limit` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `download_log_export` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_collection` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_config` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_log_export` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_prompt` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_rate_limit` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_virtual_key` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `get_workspace` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_integration_models` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_prompt_versions` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `publish_partial` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `update_feedback` — **3.1** `P4 U3 Pa3 Co4 B2 Cx2` · smells: _behavior, completeness_
- [ ] `update_integration_workspaces` — **3.1** `P4 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `create_integration` — **3.2** `P5 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `delete_provider` — **3.2** `P4 U2 Pa3 Co5 B3 Cx2` · smells: _completeness, usage_
- [ ] `get_api_key` — **3.2** `P5 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `get_cache_hit_rate` — **3.2** `P5 U2 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness, usage_
- [ ] `list_all_users` — **3.2** `P4 U2 Pa4 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_api_keys` — **3.2** `P4 U3 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness_
- [ ] `list_configs` — **3.2** `P4 U2 Pa4 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_guardrails` — **3.2** `P4 U3 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness_
- [ ] `list_virtual_keys` — **3.2** `P4 U2 Pa4 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `promote_prompt` — **3.2** `P4 U3 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness_
- [ ] `validate_completion_metadata` — **3.2** `P4 U3 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness_
- [ ] `create_provider` — **3.3** `P5 U2 Pa3 Co5 B2 Cx3` · smells: _behavior, usage_
- [ ] `list_integrations` — **3.3** `P4 U3 Pa3 Co5 B2 Cx3` · smells: _behavior_
- [ ] `list_prompt_partials` — **3.3** `P4 U3 Pa3 Co5 B2 Cx3` · smells: _behavior_
- [ ] `list_prompts` — **3.3** `P4 U3 Pa3 Co5 B2 Cx3` · smells: _behavior_
- [ ] `list_providers` — **3.3** `P4 U3 Pa3 Co5 B2 Cx3` · smells: _behavior_
- [ ] `invite_user` — **3.4** `P5 U3 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness_
- [ ] `migrate_prompt` — **3.4** `P4 U4 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness_
- [ ] `run_prompt_completion` — **3.4** `P4 U4 Pa3 Co5 B2 Cx2` · smells: _behavior, completeness_

### Tier A — 22 tools (polish to 5 across the board)

- [ ] `delete_config` — **3.5** `P5 U2 Pa3 Co5 B3 Cx3` · smells: _usage_
- [ ] `delete_rate_limit` — **3.5** `P4 U2 Pa3 Co5 B4 Cx3` · smells: _usage_
- [ ] `list_audit_logs` — **3.5** `P4 U3 Pa3 Co5 B3 Cx3` · smells: _—_
- [ ] `list_prompt_labels` — **3.5** `P4 U3 Pa3 Co5 B3 Cx3` · smells: _—_
- [ ] `list_user_invites` — **3.6** `P5 U3 Pa4 Co5 B2 Cx2` · smells: _behavior, completeness_
- [ ] `delete_api_key` — **3.7** `P5 U2 Pa4 Co5 B3 Cx3` · smells: _usage_
- [ ] `delete_collection` — **3.7** `P5 U2 Pa3 Co5 B4 Cx3` · smells: _usage_
- [ ] `delete_prompt` — **3.7** `P5 U2 Pa3 Co5 B4 Cx3` · smells: _usage_
- [ ] `delete_prompt_partial` — **3.7** `P5 U2 Pa3 Co5 B4 Cx3` · smells: _usage_
- [ ] `delete_usage_limit` — **3.7** `P5 U2 Pa3 Co5 B4 Cx3` · smells: _usage_
- [ ] `delete_workspace` — **3.7** `P5 U2 Pa4 Co5 B3 Cx3` · smells: _usage_
- [ ] `publish_prompt` — **3.7** `P5 U4 Pa3 Co5 B2 Cx3` · smells: _behavior_
- [ ] `get_trace` — **3.8** `P5 U3 Pa3 Co5 B3 Cx4` · smells: _—_
- [ ] `create_collection` — **3.9** `P5 U5 Pa3 Co5 B2 Cx3` · smells: _behavior_
- [ ] `create_feedback` — **3.9** `P5 U4 Pa3 Co5 B3 Cx3` · smells: _—_
- [ ] `delete_guardrail` — **3.9** `P5 U3 Pa3 Co5 B4 Cx3` · smells: _—_
- [ ] `delete_integration` — **3.9** `P5 U3 Pa3 Co5 B4 Cx3` · smells: _—_
- [ ] `delete_user` — **3.9** `P5 U3 Pa3 Co5 B4 Cx3` · smells: _—_
- [ ] `render_prompt` — **3.9** `P5 U4 Pa3 Co5 B3 Cx3` · smells: _—_
- [ ] `delete_prompt_label` — **4.0** `P5 U3 Pa3 Co5 B4 Cx4` · smells: _—_
- [ ] `delete_virtual_key` — **4.0** `P5 U3 Pa3 Co5 B4 Cx4` · smells: _—_
- [ ] `update_log_export` — **4.2** `P5 U4 Pa3 Co5 B4 Cx4` · smells: _—_

---

## Recommended batching

Group by file to keep commits coherent and diffs reviewable:

1. **`analytics.tools.ts`** — `get_cost_analytics`, `get_error_analytics`, `get_error_rate_analytics`, `get_latency_analytics`, `get_request_analytics`, `get_token_analytics`, `get_users_analytics`, `get_cache_hit_latency`, `get_cache_hit_rate`, `get_user_stats`
2. **`logging.tools.ts`** — `start_log_export`, `cancel_log_export`, `create_log_export`, `list_log_exports`, `list_traces`, `insert_log`, `download_log_export`, `get_log_export`, `get_trace`, `list_audit_logs`, `update_log_export`
3. **`workspaces.tools.ts`** — `add_workspace_member`, `create_workspace`, `update_workspace`, `delete_workspace`, `list_workspaces`, `get_workspace`, `list_workspace_members`, `get_workspace_member`, `remove_workspace_member`, `update_workspace_member`
4. **`keys.tools.ts`** — `create_api_key`, `update_api_key`, `delete_api_key`, `list_api_keys`, `get_api_key`, `create_virtual_key`, `update_virtual_key`, `delete_virtual_key`, `list_virtual_keys`, `get_virtual_key`
5. **`configs.tools.ts`** — `create_config`, `update_config`, `delete_config`, `list_configs`, `get_config`, `list_config_versions`
6. **`prompts.tools.ts`** — `create_prompt`, `update_prompt`, `delete_prompt`, `list_prompts`, `get_prompt`, `list_prompt_versions`, `publish_prompt`, `promote_prompt`, `migrate_prompt`, `render_prompt`, `run_prompt_completion`, `validate_completion_metadata`
7. **`labels.tools.ts` / `partials.tools.ts`** — the prompt_label/prompt_partial set
8. **`guardrails.tools.ts`** — `create_guardrail`, `update_guardrail`, `delete_guardrail`, `list_guardrails`, `get_guardrail`
9. **`integrations.tools.ts`** — `create_integration`, `update_integration`, `delete_integration`, `list_integrations`, `get_integration`, plus `integration_models` / `integration_workspaces` helpers
10. **`providers.tools.ts`** — `create_provider`, `update_provider`, `delete_provider`, `list_providers`, `get_provider`
11. **`users.tools.ts`** — `invite_user`, `delete_user_invite`, `resend_user_invite`, `list_user_invites`, `get_user_invite`, `list_all_users`, `get_user`, `update_user`, `delete_user`
12. **`limits.tools.ts`** — `create_rate_limit`, `update_rate_limit`, `delete_rate_limit`, `list_rate_limits`, `get_rate_limit`, `create_usage_limit`, `update_usage_limit`, `delete_usage_limit`, `list_usage_limits`, `get_usage_limit`
13. **`collections.tools.ts`** — `create_collection`, `update_collection`, `delete_collection`, `list_collections`, `get_collection`
14. **`tracing.tools.ts`** — whatever remains (`get_trace`, `list_traces` if not covered above)
15. **Remaining singletons** — `create_feedback`, `update_feedback`

One PR per batch, or one PR total if the diff stays reviewable.
