import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "..", "lhm.plugin.json"), "utf8"));
const endpoints = readFileSync(resolve(process.cwd(), "..", "ENDPOINTS.md"), "utf8")
  .replace(/\r\n?/g, "\n");
const toolsByName = new Map(manifest.tools.map((tool) => [tool.name, tool]));

export const toolDomains = [
  ...endpoints.matchAll(/^## ([a-z-]+) \((\d+)\)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm),
].map(([, domain, count, body]) => {
  const tools = [...body.matchAll(/^\| `([^`]+)` \|/gm)].map(([, name]) => {
    const tool = toolsByName.get(name);
    if (!tool) throw new Error(`Missing catalog tool: ${name}`);
    return {
      name,
      description: tool.description,
      flag: tool.annotations.readOnlyHint
        ? "Read"
        : tool.annotations.destructiveHint
          ? "Destructive"
          : "Write",
      enterprise: tool.description.includes("Enterprise-gated"),
    };
  });
  if (tools.length !== Number(count)) throw new Error(`Catalog count mismatch: ${domain}`);
  return { domain, tools };
});
if (toolDomains.flatMap(({ tools }) => tools).length !== manifest.tools.length)
  throw new Error("Website catalog does not cover every tool");
