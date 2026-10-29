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
// Frame 0 is static; the spin render is fetched after load and plays once, then holds its last frame.
// Reduced motion keeps the still.
export function HeroLogo() {
  const [src, setSrc] = useState("/assets/portkey-360.webp");
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    let cancelled = false;
    const onMotion = () => {
      if (!motion.matches) return;
      cancelled = true;
      setSrc("/assets/portkey-360.webp");
      setPlayed(false);
    };
    motion.addEventListener("change", onMotion);
    const go = () => {
      const pre = new Image();
      pre.onload = () => {
        if (cancelled || motion.matches) return;
        setSrc("/assets/portkey-spin-360.webp");
        setPlayed(true);
      };
      pre.src = "/assets/portkey-spin-360.webp";
    };
    const after = () =>
      "requestIdleCallback" in window ? requestIdleCallback(go) : setTimeout(go, 200);
    if (document.readyState === "complete") after();
    else window.addEventListener("load", after, { once: true });
    return () => {
      cancelled = true;
      motion.removeEventListener("change", onMotion);
      window.removeEventListener("load", after);
    };
  }, []);
  return (
    <img
      className="logo"
      id="hero-logo"
      src={src}
      data-played={played ? "1" : undefined}
      alt="Portkey Admin MCP mascot, a glossy dark tile with a hexagon mark"
      width="360"
      height="360"
    />
  );
}
export function CopyInstall({ command }: { command: string }) {
  const [label, setLabel] = useState("Copy");
  const selectCommand = () => {
    const code = document.querySelector(".install code");
    const selection = window.getSelection();
    if (!code || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const done = (ok: boolean) => {
    setLabel(ok ? "Copied" : "Press Ctrl+C");
    setTimeout(() => setLabel("Copy"), 1600);
  };
  return (
    <button
      type="button"
      className="copy"
      aria-label="Copy the install command"
      onClick={() => {
        if (navigator.clipboard && window.isSecureContext)
          navigator.clipboard.writeText(command).then(
            () => done(true),
            () => {
              selectCommand();
              done(false);
            },
          );
        else {
          selectCommand();
          done(false);
        }
      }}
    >
      {label}
    </button>
  );
}
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "dark" ? "#16101e" : "#f9f5fc";
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", color));
  }, [resolvedTheme]);
  return (
    <button
      className="theme-switch"
      aria-label="Toggle color theme"
      disabled={!mounted}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span aria-hidden="true">{mounted && resolvedTheme === "dark" ? "☾" : "☀"}</span>
      <span className="theme-label">{mounted && resolvedTheme === "dark" ? "Dark" : "Light"}</span>
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
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return text;
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  return text
    .split(pattern)
    .map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
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
              <Highlight text={entry.title} terms={terms} />
              <small>
                <Highlight text={entry.description} terms={terms} />
              </small>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
