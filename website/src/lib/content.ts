import { loader } from "fumadocs-core/source";
import { docs } from "../../.source/server";
import { docSlugs, productId, routeFor } from "./routes.mjs";

const source = loader(docs.toFumadocsSource(), { baseUrl: "/docs" });
export function getDocument(slug: string) {
  return source.getPage([productId, slug]);
}
export function guideEntries() {
  return docSlugs.map((slug) => {
    const page = getDocument(slug)!;
    return {
      title: page.data.title,
      description: page.data.description || "",
      href: routeFor(slug),
      slug,
    };
  });
}
