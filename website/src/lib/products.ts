export type Product = {
  id: string;
  name: string;
  role: string;
  headline: [string, string];
  description: string;
  intro: string;
  repo: string;
  action: string;
  external: string;
  note: string;
  features: { title: string; copy: string }[];
};
export const release = {
  version: "0.15.0",
  tag: "v0.15.0",
  notes: "https://github.com/CodesWhat/portkey-admin-mcp/releases/tag/v0.15.0",
  commit: "46556acebb77c9ee224e54836137c64fb5650594",
  source:
    "https://github.com/CodesWhat/portkey-admin-mcp/tree/46556acebb77c9ee224e54836137c64fb5650594",
};
export const product: Product = {
  id: "portkey",
  name: "Portkey Admin MCP",
  role: "PORTKEY ADMIN API × MODEL CONTEXT PROTOCOL",
  headline: ["Your gateway.", "At your command."],
  description:
    "Bring Portkey administration into your MCP client. 194 tools across 22 domains cover prompts, configurations, analytics and governance, and you choose which ones to expose.",
  intro: "The control plane, in your workflow.",
  repo: "CodesWhat/portkey-admin-mcp",
  action: "Connect your MCP client",
  external: `${release.source}#quick-start`,
  note: "Targets the Portkey-compatible Admin API. Not a drop-in Prisma AIRS adapter.",
  features: [
    {
      title: "Start with stdio.",
      copy: "Run the server alongside your MCP client using a scoped Portkey API credential.",
    },
    {
      title: "Keep the surface focused.",
      copy: "Select the tool domains you need instead of exposing the entire catalogue to every task.",
    },
    {
      title: "Make compatibility explicit.",
      copy: "Version 0.15.0 runs on the MCP v2 SDK and serves older clients on the same endpoint. Check the compatibility notes before upgrading from 0.14.x.",
    },
  ],
};
