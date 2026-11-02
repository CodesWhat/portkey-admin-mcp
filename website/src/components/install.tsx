"use client";
import { useRef, useState } from "react";
import { CodeBlock } from "./controls";

const server = {
  command: "npx",
  args: ["-y", "portkey-admin-mcp"],
  env: { PORTKEY_API_KEY: "your_api_key" },
};
const config = JSON.stringify({ mcpServers: { "portkey-admin": server } }, null, 2);
const vsConfig = JSON.stringify(
  { servers: { "portkey-admin": { type: "stdio", ...server } } },
  null,
  2,
);
const clients = [
  {
    id: "claude",
    name: "Claude Code",
    file: "bash",
    code: 'printf "Portkey API key: "; read -rs PORTKEY_API_KEY; echo; export PORTKEY_API_KEY\nclaude mcp add -e PORTKEY_API_KEY="$PORTKEY_API_KEY" portkey-admin -- npx -y portkey-admin-mcp',
  },
  {
    id: "cursor",
    name: "Cursor",
    file: ".cursor/mcp.json",
    code: config,
    link: `cursor://anysphere.cursor-deeplink/mcp/install?name=portkey-admin&config=${encodeURIComponent(btoa(JSON.stringify(server)))}`,
    action: "Add to Cursor",
  },
  {
    id: "vscode",
    name: "VS Code",
    file: ".vscode/mcp.json",
    code: vsConfig,
  },
  { id: "windsurf", name: "Windsurf", file: "~/.codeium/windsurf/mcp_config.json", code: config },
  { id: "desktop", name: "Claude Desktop", file: "claude_desktop_config.json", code: config },
  {
    id: "other",
    name: "Other",
    file: "bash",
    code: 'printf "Portkey API key: "; read -rs PORTKEY_API_KEY; echo; export PORTKEY_API_KEY\nnpx -y portkey-admin-mcp',
  },
];

export function Install() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={tabs} className="tabs" role="tablist" aria-label="Client">
        {clients.map((client, index) => (
          <button
            key={client.id}
            type="button"
            role="tab"
            id={`tab-${client.id}`}
            aria-controls={`panel-${client.id}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const target =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? clients.length - 1
                    : event.key === "ArrowRight"
                      ? (index + 1) % clients.length
                      : event.key === "ArrowLeft"
                        ? (index + clients.length - 1) % clients.length
                        : undefined;
              if (target === undefined) return;
              event.preventDefault();
              setSelected(target);
              tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
            }}
          >
            {client.name}
          </button>
        ))}
      </div>
      {clients.map((client, index) => (
        <div
          key={client.id}
          role="tabpanel"
          id={`panel-${client.id}`}
          aria-labelledby={`tab-${client.id}`}
          hidden={selected !== index}
        >
          {client.link && (
            <div className="deep">
              <a className="button primary" href={client.link}>
                {client.action}
              </a>
            </div>
          )}
          {client.id === "cursor" && (
            <p className="need">
              After adding the server, replace your_api_key in .cursor/mcp.json with your Portkey
              API key before connecting. Keep the key private: add .cursor/mcp.json to .gitignore,
              and untrack the file first if it is already tracked. Do not commit or share the file
              with a real key.
            </p>
          )}
          {client.id === "vscode" && (
            <p className="need">
              Create .vscode/mcp.json with this configuration, or add portkey-admin to the existing
              servers object. Replace your_api_key with your Portkey API key before connecting.
              Keep the key private: add .vscode/mcp.json to .gitignore, and untrack the file first
              if it is already tracked. Do not commit or share the file with a real key.
            </p>
          )}
          <CodeBlock label={client.file} code={client.code} />
          {client.id === "other" && <CodeBlock label="json" code={config} />}
        </div>
      ))}
      <p className="need">
        <a href="/docs/manual/#api-key-scopes">Needs a Portkey API key</a>
      </p>
    </>
  );
}
