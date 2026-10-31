"use client";
import { useState } from "react";

type Tool = { name: string; description: string; flag: string; enterprise: boolean };
type Domain = { domain: string; tools: Tool[] };

export function ToolBrowser({ domains }: { domains: Domain[] }) {
  const [query, setQuery] = useState("");
  const [flag, setFlag] = useState("All");
  const [enterprise, setEnterprise] = useState(false);
  const [domain, setDomain] = useState("prompts");
  const [all, setAll] = useState(false);
  const [limit, setLimit] = useState(40);
  const total = domains.reduce((sum, entry) => sum + entry.tools.length, 0);
  const filtering = !!query.trim() || flag !== "All" || enterprise;
  const showing = filtering || !!domain || all;
  const terms = query.trim().toLowerCase().split(/\s+/);
  const matches = domains
    .flatMap((entry) => entry.tools.map((tool) => ({ ...tool, domain: entry.domain })))
    .filter(
      (tool) =>
        (filtering || !domain || tool.domain === domain) &&
        (flag === "All" || tool.flag === flag) &&
        (!enterprise || tool.enterprise) &&
        terms.every((term) => `${tool.name} ${tool.description}`.toLowerCase().includes(term)),
    );
  const reset = () => {
    setQuery("");
    setFlag("All");
    setEnterprise(false);
    setDomain("");
    setAll(false);
    setLimit(40);
  };
  const visible = domain && !filtering ? matches : matches.slice(0, limit);
  return (
    <>
      <div className="tcontrols">
        <div className="tsearch" role="search">
          <input
            id="tool-q"
            type="search"
            aria-label="Search tools"
            placeholder="Search tool names and descriptions…"
            aria-controls="tool-lists"
            aria-describedby="tool-count"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setDomain("");
              setLimit(40);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") reset();
            }}
          />
        </div>
        <div className="tfilters" role="group" aria-label="Filter tools">
          {["All", "Read", "Write", "Destructive"].map((value) => (
            <button
              className="fbtn"
              key={value}
              type="button"
              aria-pressed={flag === value}
              onClick={() => {
                setFlag(value);
                setLimit(40);
              }}
            >
              {value}
            </button>
          ))}
          <button
            className="fbtn"
            type="button"
            role="switch"
            aria-checked={enterprise}
            onClick={() => {
              setEnterprise(!enterprise);
              setLimit(40);
            }}
          >
            Enterprise only
          </button>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => {
            reset();
            setAll(true);
          }}
        >
          Show all {total}
        </button>
      </div>
      <ul className="dgrid" aria-label="Tool domains">
        {domains.map((entry) => {
          const gated = entry.tools.filter((tool) => tool.enterprise).length;
          return (
            <li key={entry.domain}>
              <button
                className="dcard"
                type="button"
                aria-pressed={!filtering && domain === entry.domain}
                onClick={() => {
                  reset();
                  setDomain(domain === entry.domain ? "" : entry.domain);
                }}
              >
                <span className="dn">{entry.domain}</span>
                <span className="dm">
                  <b>{entry.tools.length}</b> tools{" "}
                  {gated > 0 && <span className="chip">{gated} Enterprise</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="tmeta">
        <output id="tool-count" aria-live="polite">
          {showing
            ? `${matches.length} tools${domain && !filtering ? ` in ${domain}` : ""}, showing ${visible.length}`
            : "Select a domain or search to browse tools."}
        </output>
        {showing && (
          <button type="button" className="fbtn" onClick={reset}>
            Reset filters
          </button>
        )}
      </div>
      {showing && (
        <div id="tool-lists" className="tlists">
          {visible.map((tool) => (
            <div className="tool-row" key={tool.name}>
              <code className="tn">{tool.name}</code>
              <span className={`fl f-${tool.flag.toLowerCase()}`}>{tool.flag}</span>
              {tool.enterprise && <span className="chip">Enterprise</span>}
              <span className="td">{tool.description.split(/(?<=\.)\s/)[0]}</span>
            </div>
          ))}
          {!matches.length && (
            <p className="tnone">No tools match. Try another search or reset the filters.</p>
          )}
        </div>
      )}
      {showing && (!domain || filtering) && visible.length < matches.length && (
        <button type="button" className="button tmore" onClick={() => setLimit(limit + 40)}>
          Show {Math.min(40, matches.length - visible.length)} more
        </button>
      )}
      <aside className="scope">
        <h3>Expose the domains you need.</h3>
        <p>
          Set <code>PORTKEY_TOOL_DOMAINS</code> to a comma-separated list, for example{" "}
          <code>prompts,analytics</code>. This narrows discovery and does not change API
          permissions.
        </p>
        <a href="/docs/tools/">Full tool reference →</a>
      </aside>
    </>
  );
}
