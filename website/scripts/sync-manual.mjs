// Generates the manual pages from the published release tag. Run with no
// arguments to write, or --check to fail on drift without writing anything.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkTagPin,
  mapOutsideFences,
  rewriteLinksWith,
  stripLeadingRules,
  stripTrailingRules,
} from "./manual-lib.mjs";

const siteRoot = fileURLToPath(new URL("..", import.meta.url));
const configPath = join(siteRoot, "content/manual.config.json");
const lockPath = join(siteRoot, "content/manual.lock.json");
const outDir = join(siteRoot, "content/docs/portkey");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const { commit, repo, pages } = config;
const check = process.argv.includes("--check");

const git = (args, opts = {}) =>
  execFileSync("git", args, {
    cwd: siteRoot,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const fail = (message) => {
  console.error(`sync-manual: ${message}`);
  process.exit(1);
};

try {
  git(["cat-file", "-e", `${commit}^{commit}`]);
} catch {
  fail(
    `commit ${commit} (${config.tag}) is not available. Fetch tags first: git fetch origin --tags (CI needs fetch-depth: 0).`,
  );
}
let resolvedTag = "";
try {
  resolvedTag = git(["rev-parse", "--verify", "--quiet", `${config.tag}^{commit}`])
    .toString("utf8")
    .trim();
} catch {}
const tagError = checkTagPin(config.tag, resolvedTag, commit);
if (tagError) fail(tagError);
const treeEntries = new Map();
for (const line of git(["ls-tree", "--full-tree", "-r", "-t", "-z", commit])
  .toString("utf8")
  .split("\0")
  .filter(Boolean)) {
  const [meta, path] = line.split("\t");
  treeEntries.set(path, meta.split(" ")[1]);
}
const bySource = new Map(pages.map((page) => [page.source, page]));
const counts = { internal: 0, repo: 0, external: 0, anchor: 0, unpinned: [] };

const blobUrl = (path) =>
  `https://github.com/${repo}/${treeEntries.get(path) === "tree" ? "tree" : "blob"}/${commit}/${path}`;
const rawUrl = (path) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;

function rewriteUrl(url, source, isImage) {
  if (url.startsWith("#")) {
    counts.anchor++;
    return url;
  }
  let path;
  let rest = "";
  const github = url.match(
    new RegExp(
      `^https://github\\.com/${repo}/(?:blob|tree)/[^/]+/([^#?]*)([#?].*)?$`,
    ),
  );
  if (github) {
    path = decodeURIComponent(github[1]);
    rest = github[2] || "";
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) {
    counts.external++;
    return url;
  } else {
    const match = url.match(/^([^#?]*)([#?].*)?$/);
    path = posix.normalize(
      posix.join(posix.dirname(source), decodeURIComponent(match[1])),
    );
    rest = match[2] || "";
  }
  path = path.replace(/\/$/, "");
  if (!path || path.startsWith("..")) fail(`${source}: unresolvable link ${url}`);
  const fragment = rest.startsWith("#") ? rest : "";
  const target = bySource.get(path);
  if (target) {
    counts.internal++;
    return `/docs/${target.slug}/${fragment}`;
  }
  if (!treeEntries.has(path) && github) {
    // Absolute link to a path the tag doesn't contain: keep the author's URL.
    counts.unpinned.push(url);
    counts.external++;
    return url;
  }
  if (!treeEntries.has(path))
    fail(`${source}: link ${url} points at ${path}, which is not in ${config.tag}`);
  counts.repo++;
  return (isImage ? rawUrl(path) : blobUrl(path)) + rest;
}

const mapOutsideCode = mapOutsideFences;

function rewriteLinks(text, source) {
  return rewriteLinksWith(text, (url, isImage) => rewriteUrl(url, source, isImage));
}

// Decorative top-of-README chrome and README-only HTML. Everything else is
// plain Markdown, so a leftover tag is a bug, not content to guess at.
function stripHtml(text) {
  return mapOutsideCode(text, (part) =>
    part
      .replace(/<div align="center">\s*<img[\s\S]*?<\/div>\s*/, "")
      .replace(/(?:<p align="center">[\s\S]*?<\/p>\s*)+/g, "")
      .replace(/<a href="https:\/\/github\.com\/CodesWhat">\s*<picture>[\s\S]*?<\/picture>\s*<\/a>\s*/g, "")
      .replace(/<a href="https:\/\/codeswhat\.com">\s*<picture>[\s\S]*?<\/picture>\s*<\/a>\s*/g, "")
      .replace(/<a href="#portkey-admin-mcp-server">Back to top<\/a>\s*/g, "")
      .replace(/<a href="https:\/\/glama\.ai[^>]*><img[^>]*><\/a>\s*/g, "")
      .replace(
        /<h2 align="center"(?: id="([^"]*)")?>(.*?)<\/h2>/g,
        // Keep the author's explicit id; GitHub used it instead of the slug.
        (_, id, title) => `## ${title}${id ? ` [#${id}]` : ""}`,
      )
      .replace(/<summary><strong>(.*?)<\/strong><\/summary>/g, "**$1**")
      .replace(/<\/?details>\s*/g, "")
      .replace(/<\/?div[^>]*>\s*/g, "")
      .replace(/<hr>/g, "---")
      .replace(/^> \[!(IMPORTANT|NOTE|WARNING|TIP|CAUTION)\]\s*$/gm, (_, kind) =>
        `> **${kind[0]}${kind.slice(1).toLowerCase()}**`),
  );
}

function assertNoHtml(text, source) {
  const bare = mapOutsideCode(text, (part) => part.replace(/`+[^`\n]*?`+/g, ""));
  const tag = bare.match(
    /<\/?(?:div|p|a|img|picture|source|details|summary|h[1-6]|hr|br|strong|em|span|table|tr|td|th|ul|ol|li|code|pre|center|sub|sup|kbd)(?:\s[^>]*)?\/?>/i,
  );
  if (tag) fail(`${source}: unhandled raw HTML ${tag[0].slice(0, 80)}`);
}

function stripTags(text) {
  let previous;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<[^>]+>/g, "");
  } while (current !== previous);
  return current.replace(/[<>]/g, "");
}

function plain(text) {
  return stripTags(
    text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
  )
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function describe(raw) {
  const body = raw.replace(/^# .*\n/m, "").replace(/<h1>.*?<\/h1>/, "");
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    const first = lines[0].trim();
    if (!first || /^(#|\||```|---|<hr|- |\d+\. )/.test(first)) continue;
    if (/^<(?!a |strong|em)/.test(first) && !first.startsWith("<a ")) continue;
    let text = plain(lines.map((l) => l.replace(/^>\s?/, "")).join(" "));
    text = text.replace(/^\[!\w+\]\s*/, "");
    text = text.replace(/^Last (?:reviewed|verified|audited): [\d-]+\.?\s*/, "");
    if (!text) continue;
    if (text.length > 200) {
      const sentence = text.slice(0, 200).match(/^(.{60,}[.!?])\s/s);
      text = sentence
        ? sentence[1]
        : `${text.slice(0, 200).replace(/\s+\S*$/, "")}…`;
    }
    return text;
  }
  fail("no description paragraph found");
}

const generated = new Map();
const lock = { commit, tag: config.tag, pages: [] };
for (const page of pages) {
  const raw = git(["show", `${commit}:${page.source}`]).toString("utf8");
  let body = stripTrailingRules(
    stripLeadingRules(
      stripHtml(raw).replace(/^\s*# .*\n/, "").replace(/\n{3,}/g, "\n\n"),
    ),
  ).trim();
  assertNoHtml(body, page.source);
  body = rewriteLinks(body, page.source);
  const description = page.description || describe(raw);
  const out = [
    "---",
    `title: ${JSON.stringify(page.title)}`,
    `description: ${JSON.stringify(description)}`,
    `# Generated by scripts/sync-manual.mjs from ${page.source} at ${commit} (${config.tag}). Do not edit.`,
    "---",
    "",
    body,
    "",
  ].join("\n");
  const file = `${page.slug}.md`;
  generated.set(join(outDir, file), out);
  lock.pages.push({
    source: page.source,
    route: `/docs/${page.slug}`,
    sourceSha256: sha256(git(["show", `${commit}:${page.source}`])),
    generatedSha256: sha256(out),
  });
}
generated.set(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

if (check) {
  const drift = [];
  for (const [path, content] of generated)
    if (!existsSync(path) || readFileSync(path, "utf8") !== content)
      drift.push(path.slice(siteRoot.length));
  if (drift.length)
    fail(`generated manual is out of date (${drift.join(", ")}). Run npm run sync:manual.`);
  console.log(`Manual matches ${config.tag} (${pages.length} pages).`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [path, content] of generated) writeFileSync(path, content);
  console.log(
    `Wrote ${pages.length} pages from ${config.tag}. Links: ${counts.internal} internal, ${counts.repo} repo, ${counts.external} external, ${counts.anchor} same-page.`,
  );
  for (const url of counts.unpinned)
    console.log(`  kept as-is, path not in ${config.tag}: ${url}`);
}
