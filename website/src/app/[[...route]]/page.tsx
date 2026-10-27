import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { product, release } from "@/lib/products";
import { canonicalFor, docSlugs, resolveRoute, routesFor } from "@/lib/routes.mjs";
import { getDocument } from "@/lib/content";
import { Frame, Home, hrefFor } from "@/components/site";
import { Disclosure, DocSearch } from "@/components/controls";

type Props = { params: Promise<{ route?: string[] }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return routesFor().map((route) => ({ route }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = resolveRoute((await params).route || []);
  if (!resolved)
    return {
      title: `${product.name} · CodesWhat`,
      robots: { index: false, follow: false },
    };
  const doc = resolved.page === "home" ? undefined : getDocument(resolved.page);
  return {
    title: doc
      ? `${doc.data.title} · ${product.name}`
      : `${product.name} · ${product.headline.join(" ")}`,
    description: doc?.data.description || product.description,
    alternates: { canonical: canonicalFor(resolved.page) },
  };
}
export default async function Page({ params }: Props) {
  const resolved = resolveRoute((await params).route || []);
  if (!resolved) notFound();
  if (resolved.page === "home") return <Home product={product} />;
  const doc = getDocument(resolved.page);
  if (!doc) notFound();
  const entries = docSlugs.map((slug) => {
    const page = getDocument(slug)!;
    return {
      title: page.data.title,
      description: page.data.description || "",
      href: hrefFor(slug),
      slug,
    };
  });
  const nav = (
    <nav aria-label="Documentation">
      <p className="eyebrow">{product.name}</p>
      {entries.map((entry) => (
        <a
          key={entry.slug}
          href={entry.href}
          aria-current={entry.slug === resolved.page ? "page" : undefined}
        >
          {entry.title}
        </a>
      ))}
      <a className="reference-link" href={release.source}>
        Full product reference ↗
      </a>
    </nav>
  );
  const next =
    entries[entries.findIndex((entry) => entry.slug === resolved.page) + 1];
  const Body = doc.data.body;
  return (
    <Frame product={product} docsPage={resolved.page}>
      <main id="main" tabIndex={-1} className="docs-layout wrap">
        <aside className="docs-sidebar">
          <div className="desktop-doc-nav">{nav}</div>
          <Disclosure className="mobile-doc-nav" label="In this guide">
            {nav}
          </Disclosure>
        </aside>
        <div className="doc-column">
          <div className="docs-toolbar">
            <div>
              <span className="eyebrow">
                DOCUMENTATION / {product.name.toUpperCase()}
              </span>
              <p className="release-label">
                <a href={release.notes}>
                  Docs for {release.version}, the latest release
                </a>
              </p>
            </div>
            <DocSearch entries={entries} />
          </div>
          <article className="prose">
            <header>
              <h1>{doc.data.title}</h1>
              <p className="doc-description">{doc.data.description}</p>
            </header>
            <Body />
          </article>
          {next && (
            <nav className="doc-next" aria-label="More guides">
              <a href={next.href}>
                <small>KEEP READING</small>
                <strong>{next.title} ↗</strong>
              </a>
            </nav>
          )}
          <p className="review-note">
            Based on the published {release.version} release. The source
            files are in the product repository.
          </p>
        </div>
      </main>
    </Frame>
  );
}
