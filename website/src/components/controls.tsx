"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeProvider, useTheme } from "next-themes";

export function Provider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
export function ProductMark() {
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="product-animation">
      <div className={playing ? "mark-stage playing" : "mark-stage"}>
        {playing && (
          <img
            className="animated-mark"
            src="/assets/portkey.webp"
            alt=""
            width="152"
            height="152"
          />
        )}
        <span className="still-mark" aria-hidden="true">
          PORTKEY
        </span>
      </div>
      <button disabled={!mounted} onClick={() => setPlaying(!playing)}>
        {playing ? "Pause product animation" : "Play product animation"}
      </button>
    </div>
  );
}
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button
      className="theme-switch"
      aria-label="Toggle color theme"
      disabled={!mounted}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? "☀" : "◐"}
    </button>
  );
}
export function Disclosure({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const summary = useRef<HTMLElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const element = details.current;
      if (
        element?.open &&
        event.target instanceof Node &&
        !element.contains(event.target)
      )
        element.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  return (
    <details
      ref={details}
      className={`disclosure ${className}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.currentTarget.open = false;
          summary.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a[href]"))
          event.currentTarget.open = false;
      }}
    >
      <summary ref={summary}>
        {label} <span aria-hidden="true">⌄</span>
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function DocSearch({
  entries,
}: {
  entries: { title: string; description: string; href: string }[];
}) {
  const [query, setQuery] = useState("");
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter((entry) =>
    terms.every((term) =>
      `${entry.title} ${entry.description}`.toLocaleLowerCase().includes(term),
    ),
  );
  return (
    <div className="doc-search">
      <label htmlFor="doc-query">Find a guide</label>
      <input
        id="doc-query"
        type="search"
        placeholder="Search guide titles and summaries…"
        aria-describedby="doc-query-hint"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p id="doc-query-hint" className="search-hint">
        Matches guide titles and summaries only, not the full text.
      </p>
      {query && (
        <div className="search-results">
          <p aria-live="polite">
            {matches.length} {matches.length === 1 ? "guide" : "guides"} found
          </p>
          {matches.map((entry) => (
            <a key={entry.href} href={entry.href}>
              {entry.title}
              <small>{entry.description}</small>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
