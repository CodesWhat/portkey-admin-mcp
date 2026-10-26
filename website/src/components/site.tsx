import type { ReactNode } from "react";
import { Disclosure, ProductMark, ThemeSwitch } from "./controls";
import type { Product } from "@/lib/products";
import { routeFor } from "@/lib/routes.mjs";

export const hrefFor = (page = "home") => routeFor(page);

export function Brand({ product }: { product: Product }) {
  return (
    <a className="brand" href={hrefFor()} aria-label={`${product.name} home`}>
      <span className="portkey-mark" aria-hidden="true">
        ↗
      </span>
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
    <div className="site family-mcp product-portkey">
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
        <div>
          <a href="https://codeswhat.com" className="maker">
            C?W <span>A CodesWhat project</span>
          </a>
          <p>{product.note}</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href={hrefFor("overview")}>Documentation</a>
          <a href={`https://github.com/${product.repo}`}>Source on GitHub ↗</a>
        </nav>
      </footer>
    </div>
  );
}
function McpIllustration() {
  return (
    <figure className="mcp-visual">
      <div className="visual-topline">
        <span>THE ADMINISTRATION LAYER</span>
        <span>STDIO</span>
      </div>
      <div className="mcp-art">
        <ProductMark />
        <div className="mcp-flow">
          <span>YOUR MCP CLIENT</span>
          <i aria-hidden="true">↓</i>
          <strong>Portkey Admin MCP</strong>
          <i aria-hidden="true">↓</i>
          <span>PORTKEY ADMIN API</span>
        </div>
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
              <a
                className="text-link"
                href={`https://github.com/${product.repo}`}
              >
                View the source <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="hero-note">{product.note}</p>
          </div>
          <McpIllustration />
        </section>
        <section id="how-it-works" className="features wrap">
          <div className="section-heading">
            <p className="eyebrow">SMALL TOOLS. CLEAR RESPONSIBILITIES.</p>
            <h2>{product.intro}</h2>
          </div>
          <div className="feature-grid">
            {product.features.map((feature, i) => (
              <article key={feature.title}>
                <span className="feature-number">0{i + 1}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
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
