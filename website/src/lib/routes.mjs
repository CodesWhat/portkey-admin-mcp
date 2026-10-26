export const productId = "portkey";
export const docSlugs = ["overview", "getting-started", "operations"];
if (process.env.SITE_PRODUCT && process.env.SITE_PRODUCT !== productId)
  throw new Error(`This site only builds ${productId}`);
export function routeFor(page) {
  if (!["home", ...docSlugs].includes(page))
    throw new Error(`Unknown page: ${page}`);
  return page === "home"
    ? "/"
    : `/docs${page === "overview" ? "" : `/${page}`}`;
}
export function routesFor() {
  return ["home", ...docSlugs].map((page) =>
    routeFor(page).split("/").filter(Boolean),
  );
}
export function resolveRoute(parts) {
  if (parts.length === 0) return { page: "home" };
  if (parts[0] !== "docs" || parts.length > 2) return undefined;
  const page = parts[1] || "overview";
  return docSlugs.includes(page) ? { page } : undefined;
}
