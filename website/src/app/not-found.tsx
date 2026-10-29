import type { Metadata } from "next";
import { DocSearch } from "@/components/controls";
import { Frame, hrefFor } from "@/components/site";
import { guideEntries } from "@/lib/content";
import { product } from "@/lib/products";

export const metadata: Metadata = {
  title: `Page not found · ${product.name}`,
  description: `This page is not part of the ${product.name} site.`,
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <Frame product={product}>
      <main id="main" tabIndex={-1} className="not-found wrap">
        <section aria-labelledby="nf-h">
          <img
            className="nf-mark"
            src="/assets/portkey-256.webp"
            alt="Portkey Admin MCP mascot, a glossy dark tile with a hexagon mark"
            width="128"
            height="128"
          />
          <p className="eyebrow">ERROR 404 · {product.name.toUpperCase()}</p>
          <h1 id="nf-h">Nothing to administer here.</h1>
          <p className="nf-copy">
            No page lives at this address. The link may be stale or mistyped.
            Search the guides, or head back to the start.
          </p>
          <DocSearch entries={guideEntries()} />
          <div className="nf-links">
            <a className="button primary" href={hrefFor()}>
              Back to {product.name}
            </a>
            <a className="button" href={hrefFor("overview")}>
              Docs
            </a>
          </div>
        </section>
      </main>
    </Frame>
  );
}
