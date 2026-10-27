// Pure helpers for sync-manual.mjs, split out so tests can import them
// without running the generator.

export function mapOutsideFences(text, fn) {
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => (index % 2 ? part : fn(part)))
    .join("");
}

// One left-to-right pass. A code span that starts before a link is matched
// first and left literal; a link whose label contains code spans is matched
// whole, because its "[" comes first.
const INLINE =
  /(`+[^`\n]*?`+)|(!?)\[((?:`[^`\n]*`|[^\]`])*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)|^(\s*\[[^\]]+\]:\s*)(\S+)/gm;

export function rewriteLinksWith(text, rewrite) {
  return mapOutsideFences(text, (part) =>
    part.replace(
      INLINE,
      (match, code, bang, label, url, title, refHead, refUrl) => {
        if (code !== undefined) return match;
        if (refHead !== undefined) return `${refHead}${rewrite(refUrl, false)}`;
        return `${bang}[${label}](${rewrite(url, bang === "!")}${title})`;
      },
    ),
  );
}

// Returns an error message, or null when the tag resolves to the pinned commit.
export function checkTagPin(tag, resolved, commit) {
  if (!resolved)
    return `tag ${tag} is missing. Fetch tags first: git fetch origin --tags (CI needs fetch-depth: 0).`;
  if (resolved !== commit)
    return `tag ${tag} resolves to ${resolved}, but manual.config.json pins ${commit}.`;
  return null;
}
