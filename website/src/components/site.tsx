import type { ReactNode } from "react";
import { CodeBlock, Disclosure, HeroLogo, ThemeSwitch } from "./controls";
import type { Product } from "@/lib/products";
import { toolDomains } from "@/lib/tool-catalog.mjs";
import { Install } from "./install";
import { ToolBrowser } from "./tool-browser";
import { LowerSections } from "./site-lower";
import { routeFor } from "@/lib/routes.mjs";

export const hrefFor = (page = "home") => routeFor(page);

export function Brand({ product }: { product: Product }) {
  return (
    <a className="brand" href={hrefFor()} aria-label={`${product.name} home`}>
      <img src="/assets/portkey-64.webp" alt="" width="28" height="28" />
      <span>{product.name}</span>
    </a>
  );
}
export function Frame({
  product,
  children,
  docsPage,
}: {
  product: Product;
  children: ReactNode;
  docsPage?: string;
}) {
  const links = (
    <>
      <a href={`${hrefFor()}#install`}>Install</a>
      <a href={`${hrefFor()}#tools`}>Tools</a>
      <a href={hrefFor("overview")} aria-current={docsPage === "overview" ? "page" : undefined}>
        Docs
      </a>
      <a href={`https://github.com/${product.repo}`}>
        GitHub <span aria-hidden="true">↗</span>
      </a>
    </>
  );
  return (
    <div className="site product-portkey">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="header">
        <div className="header-inner">
          <Brand product={product} />
          <nav className="desktop-nav" aria-label="Main navigation">
            {links}
          </nav>
          <div className="header-actions">
            <ThemeSwitch />
            <Disclosure label="Menu" className="mobile-nav">
              <nav aria-label="Mobile navigation">{links}</nav>
            </Disclosure>
          </div>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="footer-top">
          <div>
            <Brand product={product} />
            <p>{product.note}</p>
          </div>
          <nav aria-label="Footer navigation">
            <h2>Project</h2>
            <a href={hrefFor("overview")}>Documentation</a>
            <a href={`https://github.com/${product.repo}`}>Source on GitHub ↗</a>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>
            © 2026 CodesWhat. Released under the MIT License. Independent project, not affiliated
            with or endorsed by Portkey or Palo Alto Networks.
          </span>
          <a href="https://codeswhat.com" className="pill">
            <img src="/assets/codeswhat-52.webp" alt="" width="26" height="26" />A CodesWhat project
          </a>
        </div>
      </footer>
    </div>
  );
}
function Section({
  id,
  label,
  title,
  children,
}: {
  id: string;
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="home-section wrap" aria-labelledby={`${id}-h`}>
      <div className="split">
        <div className="sec-h">
          <p className="eyebrow">{label}</p>
          <h2 id={`${id}-h`}>{title}</h2>
        </div>
        <div className="section-body">{children}</div>
      </div>
    </section>
  );
}
export function Home({ product }: { product: Product }) {
  return (
    <Frame product={product}>
      <main id="main" tabIndex={-1} className="home">
        <section className="hero wrap" id="hero">
          <div className="hero-copy">
            <p className="eyebrow">MCP server for Portkey admin</p>
            <h1>
              Administer Portkey <span>from your MCP client.</span>
            </h1>
            <p className="hero-description">
              Bring Portkey administration into your MCP client. Prompts, configurations, analytics
              and governance tools, and you choose which ones to expose.
            </p>
            <p className="facts" aria-label="At a glance">
              194 tools · 22 domains · stdio · MIT · Node 24+
            </p>
            <div className="hero-command">
              <CodeBlock label="npx command" code="npx -y portkey-admin-mcp" />
            </div>
            <div className="hero-ctas">
              <a className="button primary" href="#install">
                Install
              </a>
              <a className="button" href={`https://github.com/${product.repo}`}>
                GitHub ↗
              </a>
            </div>
          </div>
          <div className="hero-object">
            <HeroLogo />
          </div>
        </section>
        <Section id="install" label="Install" title="Add it to your client.">
          <Install />
        </Section>
        <Section id="tools" label="Tools" title="194 tools in 22 domains.">
          <ToolBrowser domains={toolDomains} />
        </Section>
        <LowerSections />
      </main>
    </Frame>
  );
}
