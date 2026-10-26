# Portkey Admin MCP website

A local marketing and documentation site for Portkey Admin MCP. One Next app
compiles Markdown/MDX with Fumadocs and exports the whole site to `out/`. It is
isolated from the MCP server: it has its own `package.json` and lockfile, is not
part of the npm package or the Docker image, and is excluded from the root Biome
and knip runs. Its checks run in `.github/workflows/website.yml`.

## Provenance

Copied from the shared product web shell, `examples/product-web`:

| Field | Value |
| --- | --- |
| Shell repo | `CodesWhat/codeswhat-components` |
| Tag | `v0.1.3` |
| Commit | `d0023da` |

The multi-product gallery and the Drydock, Sockguard, Portwing and CareerRat
routes, content and artwork were removed. The shared frame, theme persistence,
focus behavior, docs navigation, guide finder, noindex metadata and the animation
pause control stay. Updating the shell is a manual re-copy from a new tag.

## Preview

From this directory, install with `npm ci`, build with `npm run build`, then run
`npm run preview`. The Python 3 static server binds only to 127.0.0.1:4178 and stops
after ten minutes. Pass another port with `npm run preview -- 4179`.

The site is always Portkey. Marketing is at `/`, with guides at `/docs/`,
`/docs/getting-started/` and `/docs/operations/`. All pages carry noindex metadata
until a production canonical URL is chosen. `SITE_PRODUCT` is not needed; if it is
set to anything but `portkey` the build fails.

## Checks

`npm run verify` runs the routing tests, typecheck, build and export check.
`npm test` runs only the fast routing tests. The export check inspects real HTML,
compiled MDX, local links and assets, noindex metadata, and absence of foreign
product routes.

Browser checks should cover desktop, 390px and 320px layouts, light/dark theme
persistence, menu Enter/Space/Escape, visible focus, guide finder results and
keyboard navigation. The Portkey animation starts only on request, has a pause
control, and is hidden for reduced motion. Navigation and guide content remain
usable without JavaScript; theme switching and guide filtering require it. The
guide finder searches titles and summaries of the three local guides, not the full
product reference.

## Files

| File | Responsibility |
| --- | --- |
| `src/lib/products.ts` | Product copy and the pinned release |
| `src/components/site.tsx` | Shared frame and the marketing page |
| `src/components/controls.tsx` | Theme, native disclosure and guide finder |
| `src/app/styles.css` | Geometry, responsive rules and styles |
| `src/lib/routes.mjs` | Route contract |
| `content/docs/portkey/` | MDX starter guides and generated manual pages |
| `content/manual.config.json` | Pinned release commit, route map and sidebar order |
| `scripts/sync-manual.mjs` | Generates and drift-checks the manual |

## Content

The three starter guides are hand-written and grounded in the published 0.15.0
release at `46556acebb77c9ee224e54836137c64fb5650594`. The rest of the docs are
generated from that tag by `scripts/sync-manual.mjs`, which reads each source with
`git show` (never the working tree), strips decorative README HTML, rewrites links
and writes `content/docs/portkey/*.md` plus `content/manual.lock.json`. The pinned
commit and the file-to-route map live in `content/manual.config.json`, which also
drives the sidebar order. `npm run sync:manual` regenerates; `npm run check:manual`
fails on drift and needs the tag fetched (CI checks out with full history). Do not
edit generated pages. This site does not offer hosted MCP service or native Prisma
AIRS management.

## Asset provenance

| Local asset | Source |
| --- | --- |
| `public/assets/portkey.webp` | `assets/portkey-balloon-spin-light.webp` in this repo |

Instrument Sans and JetBrains Mono came from Mouthtype's self-hosted font assets,
both SIL Open Font License 1.1. Their notices are in `public/assets/fonts/OFL-*.txt`.
Fonts are served locally.
