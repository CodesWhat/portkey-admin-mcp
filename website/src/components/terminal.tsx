"use client";
import { useEffect, useRef } from "react";
import { startTerm, type TermData } from "@/lib/term-player";
import data from "@/lib/term-portkey.json";

const T = data as TermData;
const labels: Record<string, string> = {
  domains: "PORTKEY_TOOL_DOMAINS=prompts,analytics",
};

export function Terminal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => (root.current ? startTerm(root.current, T) : undefined), []);
  return (
    <div className="term" id="term" ref={root} role="region" aria-label="Recorded MCP session" data-state="idle">
      <div className="term-bar">
        <span className="dots" aria-hidden="true"><i /><i /><i /></span>
        <b id="term-title">{`${T.product} ${T.version} · stdio`}</b>
        <span className="grow" />
        <button type="button" id="term-skip" hidden>Skip to end</button>
        <button type="button" id="term-clear">Clear</button>
      </div>
      <div className="term-body" id="term-body" tabIndex={0} role="log" aria-label="Terminal output, scrollable" aria-live="off" />
      <div className="term-cmds" role="group" aria-label="Replay a recorded scene">
        {T.scenes.map((scene) => (
          <button type="button" className="tcmd" data-scene={scene.id} aria-pressed="false" key={scene.id}>
            <span className="ps" aria-hidden="true">›</span>
            <span>{labels[scene.id] || scene.title}</span>
          </button>
        ))}
      </div>
      <p className="term-cap">{`Recorded from ${T.product} ${T.version} · dummy key · list_prompts is sample data`}</p>
      <p className="sr" id="term-live" aria-live="polite" />
    </div>
  );
}
