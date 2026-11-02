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
export function HeroLogo() {
  const still = "/assets/portkey-360-v2.webp";
  const spin = "/assets/portkey-spin-v3-360.webp";
  const [src, setSrc] = useState(still);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const wide = matchMedia("(min-width: 900px)");
    let disposed = false;
    let image: HTMLImageElement | undefined;
    const go = () => {
      if (disposed || motion.matches || !wide.matches) {
        setSrc(still);
        return;
      }
      image = new Image();
      image.onload = () => {
        if (!disposed && !motion.matches && wide.matches) setSrc(spin);
      };
      image.src = spin;
    };
    const after = () => {
      if (document.readyState === "complete") go();
    };
    motion.addEventListener("change", after);
    wide.addEventListener("change", after);
    window.addEventListener("load", after, { once: true });
    const timer = document.readyState === "complete" ? setTimeout(go, 200) : undefined;
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (image) image.onload = null;
      motion.removeEventListener("change", after);
      wide.removeEventListener("change", after);
      window.removeEventListener("load", after);
    };
  }, []);
  return (
    <img
      className="logo"
      id="hero-logo"
      src={src}
      data-played={src === spin ? "1" : undefined}
      alt="Portkey Admin MCP mascot, a glossy dark tile with a hexagon mark"
      width="360"
      height="360"
    />
  );
}

export function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <DocCode label={label}>
      <code>{code}</code>
    </DocCode>
  );
}

export function DocCode({
  children,
  label = "code",
  ...props
}: {
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Copy");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const code = root.current?.querySelector("pre");
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent || "");
      setStatus("Copied");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus("Selected. Copy manually");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("Copy"), 2000);
  };
  return (
    <div className="doc-code" ref={root}>
      <div className="code-head">
        <span>{label}</span>
        <button
          type="button"
          className="copy"
          aria-label={label === "code" ? "Copy code" : `Copy ${label}`}
          onClick={copy}
        >
          {status}
        </button>
        <span className="sr-only" role="status">
          {status === "Copy" ? "" : status}
        </span>
      </div>
      <pre {...props} tabIndex={0}>
        {children}
      </pre>
    </div>
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
      if (element?.open && event.target instanceof Node && !element.contains(event.target))
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
  return text.split(pattern).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}
export function DocSearch({
  entries,
}: {
  entries: { title: string; description: string; href: string }[];
}) {
  const [query, setQuery] = useState("");
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter((entry) =>
    terms.every((term) => `${entry.title} ${entry.description}`.toLocaleLowerCase().includes(term)),
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
