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

`npm run check:browser` is a local rendered check, not part of CI (it needs a
browser). Run `npm run build` first. It serves `out/` on 127.0.0.1 and drives
Chromium (the Playwright build, or system Chrome as a fallback) and WebKit when
installed (`npx playwright-core install webkit`), printing a PASS or FAIL line per
check and exiting non-zero on any failure. It covers overflow at 1280, 390 and
320px, the header nav and Menu disclosure (Enter, Space, Escape, focus return),
the skip link and docs sidebar Tab order, the guide finder, the release label,
theme persistence, the animation play control and reduced motion, and the no-JS
rendering of docs pages and menus. The Tab-to-link checks run only in Chromium,
because WebKit leaves links out of the Tab order by default.

The Portkey animation starts only on request, has a pause control, and is hidden
for reduced motion. Navigation and guide content remain usable without JavaScript;
theme switching and guide filtering require it. The guide finder searches titles
and summaries of the local guides and manual pages, not their full text, and says
so in the placeholder and a hint under the input.

## Release label

Every docs page shows "Docs for 0.15.0, the latest release" linking to the GitHub
release page. The version, tag and URL come from `release` in `src/lib/products.ts`;
a test checks that its tag matches `tag` in `content/manual.config.json`.

## Security headers

`vercel.json` in this directory (the future Vercel project root; the repo-root
`vercel.json` belongs to the MCP HTTP adapter) sets `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` and a
`Content-Security-Policy` on every route. The export loads only self-hosted
scripts, styles and fonts. The only external origins are images in the manual pages:
`https://img.shields.io` (badges) and `https://lobehub.com` (badge), so `img-src`
lists exactly those. `connect-src` is `'self'`.

`script-src` uses `'unsafe-inline'` rather than hashes. Next's static export
inlines the RSC payload in a `<script>` on every page, and across the 16 exported
pages there are 17 distinct inline scripts, 16 of which are per-page payloads, so
a hash list would change with every content edit and need a generator for little
gain. `style-src` uses `'unsafe-inline'` too, for the code highlighter's inline
`style` attributes. `check:export` fails if any external origin in `out/` is not
allowed by the CSP, and `npm test` checks that the file parses and carries each
required header. Revisit hashes or nonces if the host can inject them.

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
| `scripts/check-browser.mjs` | Local Chromium and WebKit rendered checks |
| `vercel.json` | Static security headers for the future host |

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
