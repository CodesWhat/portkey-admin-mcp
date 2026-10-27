import type { MetadataRoute } from "next";
import { canonicalFor, docSlugs } from "@/lib/routes.mjs";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["home", ...docSlugs].map((page) => ({ url: canonicalFor(page) }));
}
