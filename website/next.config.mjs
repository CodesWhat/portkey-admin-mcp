import { createMDX } from "fumadocs-mdx/next";
import { routesFor } from "./src/lib/routes.mjs";
import { fileURLToPath } from "node:url";

routesFor(process.env.SITE_PRODUCT);
export default createMDX()({
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
});
