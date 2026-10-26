import { loader } from "fumadocs-core/source";
import { docs } from "../../.source/server";
import { productId } from "./routes.mjs";

const source = loader(docs.toFumadocsSource(), { baseUrl: "/docs" });
export function getDocument(slug: string) {
  return source.getPage([productId, slug]);
}
