import type { ReactNode } from "react";
import { CopyInstall, Disclosure, HeroLogo, ThemeSwitch } from "./controls";
import { Terminal } from "./terminal";
import type { Product } from "@/lib/products";
import { release } from "@/lib/products";
import { routeFor } from "@/lib/routes.mjs";

const withSlash = (path: string) => (path.endsWith("/") ? path : `${path}/`);
export const hrefFor = (page = "home") => withSlash(routeFor(page));

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
      <a href={`${hrefFor()}#how-it-works`}>How it works</a>
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
            © 2026 CodesWhat. Released under the MIT License. Independent
            project, not affiliated with or endorsed by Portkey or Palo Alto
            Networks.
          </span>
          <a href="https://codeswhat.com" className="pill">
            <img src="/assets/codeswhat-52.webp" alt="" width="26" height="26" />
            A CodesWhat project
          </a>
        </div>
      </footer>
    </div>
  );
}
function McpIllustration() {
  return (
    <figure className="mcp-visual" id="admin-flow">
      <div className="visual-topline">
        <span>THE ADMINISTRATION LAYER</span>
        <span>STDIO</span>
      </div>
      <div className="mcp-art">
        <span className="mono-word">PORTKEY</span>
        <ol className="mcp-flow" aria-label="Request path">
          <li>YOUR MCP CLIENT</li>
          <li className="arrow" aria-hidden="true">↓</li>
          <li className="mid">Portkey Admin MCP</li>
          <li className="arrow" aria-hidden="true">↓</li>
          <li>PORTKEY ADMIN API</li>
        </ol>
      </div>
      <figcaption>
        <span className="mono">prompts · configs · analytics</span>
        <p>Bring the right tools into the conversation.</p>
      </figcaption>
    </figure>
  );
}
export function Home({ product }: { product: Product }) {
  return (
    <Frame product={product}>
      <main id="main" tabIndex={-1}>
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">{product.role}</p>
            <p className="chip">v{release.version} · Open Source · MIT</p>
            <h1>
              {product.headline[0]}
              <br />
              <span>{product.headline[1]}</span>
            </h1>
            <p className="hero-description">{product.description}</p>
            <div className="hero-ctas">
              <a className="button primary" href={hrefFor("getting-started")}>
                {product.action} <span aria-hidden="true">↗</span>
              </a>
              <a className="button" href={`https://github.com/${product.repo}`}>
                View the source <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="hero-note">{product.note}</p>
            <div className="install">
              <div className="install-head">
                <span className="eyebrow">INSTALL · CLAUDE CODE</span>
                <CopyInstall command={product.install} />
              </div>
              <pre tabIndex={0}>
                <code>{product.install}</code>
              </pre>
              <p>
                Cursor, Windsurf, VS Code and a plain <code>npx</code> run are
                in the <a href={hrefFor("overview")}>docs</a>. Needs a Portkey
                API key and Node 24+.
              </p>
            </div>
            <ul className="strip" aria-label="At a glance">
              <li><b>194</b> <span className="eyebrow">TOOLS</span></li>
              <li><b>22</b> <span className="eyebrow">DOMAINS</span></li>
              <li><b>stdio</b> <span className="eyebrow">TRANSPORT</span></li>
              <li><b>MIT</b> <span className="eyebrow">LICENSE</span></li>
            </ul>
          </div>
          <div className="hero-object">
            <HeroLogo />
          </div>
        </section>
        <section className="wrap admin-layer">
          <McpIllustration />
        </section>
        <section id="see-it-work" className="wrap" aria-labelledby="see-h">
          <div className="section-heading stacked">
            <p className="eyebrow">RECORDED SESSION</p>
            <h2 id="see-h">See it work.</h2>
          </div>
          <Terminal />
          <details className="prov">
            <summary>Full provenance</summary>
            <p>
              Recorded from portkey-admin-mcp {release.version} on 2026-10-29,
              dummy key, loopback stub. Real output from the published{" "}
              {release.version} build over stdio; over stdio it negotiated{" "}
              <code>2025-11-25</code>. Nothing here touched Portkey.{" "}
              <code>list_prompts</code> ran against a loopback stub with
              invented prompts, so that scene is sample data. The tool list is
              the real response, counted and grouped here by the catalog&apos;s
              domain map. The <code>PORTKEY_TOOL_DOMAINS=prompts,analytics</code>{" "}
              scene is a second recording of <code>tools/list</code> from the
              same build, which returns 39 of the 194 tools.
            </p>
          </details>
        </section>
        <section id="how-it-works" className="features wrap">
          <div className="section-heading stacked">
            <p className="eyebrow">SMALL TOOLS. CLEAR RESPONSIBILITIES.</p>
            <h2>{product.intro}</h2>
          </div>
          <div className="feature-grid">
            {product.features.map((feature, i) => (
              <article key={feature.title}>
                <span className="feature-number">0{i + 1}</span>
                <h3>{feature.title}</h3>
                <p>
                  {feature.copy}
                  {i === 2 && (
                    <>
                      {" "}
                      <a className="inline-link" href={hrefFor("compatibility")}>
                        Compatibility notes →
                      </a>
                    </>
                  )}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="closing wrap" id="get">
          <div>
            <p className="eyebrow">A GOOD PLACE TO START</p>
            <h2>From a good idea to your setup.</h2>
            <p>
              Read the essentials, choose your configuration, and keep the
              reference close.
            </p>
          </div>
          <a className="button primary" href={hrefFor("overview")}>
            Open the documentation <span aria-hidden="true">↗</span>
          </a>
        </section>
      </main>
    </Frame>
  );
}
