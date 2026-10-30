// Rendered browser check for the exported site. Run `npm run build` first, then
// `npm run check:browser`. Serves out/ on 127.0.0.1, drives Chromium (Playwright
// build or system Chrome) and WebKit when installed. Local only: not part of CI.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { chromium, webkit } from "playwright-core";
import manual from "../content/manual.config.json" with { type: "json" };
const releaseVersion = manual.tag.replace(/^v/, "");
const releaseUrl = `https://github.com/${manual.repo}/releases/tag/${manual.tag}`;

const root = fileURLToPath(new URL("../out", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".png": "image/png", ".txt": "text/plain", ".woff2": "font/woff2", ".ico": "image/x-icon",
};
const results = [];
const browsers = [];
let server;

function cleanup() {
  for (const browser of browsers) browser.close().catch(() => {});
  server?.close();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => { cleanup(); process.exit(130); });

async function serve() {
  if (!existsSync(join(root, "index.html"))) throw new Error("out/ is missing. Run `npm run build` first.");
  server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
    let file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) return void response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void response.writeHead(404).end("Not found");
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function launch(engine) {
  const type = engine === "chromium" ? chromium : webkit;
  try {
    const bundled = existsSync(type.executablePath());
    const browser = engine === "chromium" && !bundled
      ? await type.launch({ channel: "chrome", headless: true })
      : await type.launch({ headless: true });
    browsers.push(browser);
    return browser;
  } catch (error) {
    console.log(`SKIP ${engine}: not available (${String(error.message).split("\n")[0]})`);
    return null;
  }
}

const expect = (condition, message) => { if (!condition) throw new Error(message); };
const hydrated = (page) => page.waitForSelector(".theme-switch:not([disabled])", { timeout: 10_000 });

async function suite(browser, engine, base) {
  const check = async (name, options, fn) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light", ...options });
    try {
      await fn(context, await context.newPage());
      results.push(true);
      console.log(`PASS ${engine.padEnd(8)} ${name}`);
    } catch (error) {
      results.push(false);
      console.log(`FAIL ${engine.padEnd(8)} ${name}: ${error.message.split("\n")[0]}`);
    } finally {
      await context.close().catch(() => {});
    }
  };
  const open = async (page, path) => {
    await page.goto(base + path, { waitUntil: "load" });
    await hydrated(page);
  };
  const active = (page) => page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}|${el.id}|${el.className}|${el.getAttribute("href") ?? ""}` : "";
  });

  for (const width of [1280, 390, 320]) {
    const viewport = { width, height: width > 700 ? 800 : 800 };
    for (const path of ["/", "/docs", "/docs/tools"])
      await check(`${width}px no horizontal overflow on ${path}`, { viewport }, async (_, page) => {
        await open(page, path);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        }));
        expect(scrollWidth <= innerWidth, `scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`);
      });

    if (width >= 760)
      await check(`${width}px header links are inline`, { viewport }, async (_, page) => {
        await open(page, "/");
        const nav = page.locator(".desktop-nav");
        expect(await nav.isVisible(), "inline nav is hidden");
        expect(await nav.locator("a:visible").count() === 3, "expected 3 inline links");
        expect(!(await page.locator(".mobile-nav > summary").isVisible()), "Menu disclosure shows at desktop width");
      });
    else
      await check(`${width}px Menu opens with Enter and Space, Escape closes and returns focus`, { viewport }, async (_, page) => {
        await open(page, "/");
        expect(!(await page.locator(".desktop-nav").isVisible()), "inline nav still visible");
        const summary = page.locator(".mobile-nav > summary");
        const isOpen = () => page.evaluate(() => document.querySelector(".mobile-nav").open);
        for (const key of ["Enter", "Space"]) {
          await summary.focus();
          await page.keyboard.press(key);
          expect(await isOpen(), `${key} did not open the menu`);
          const box = await page.locator(".mobile-nav > div").boundingBox();
          expect(box && box.x >= 0 && box.x + box.width <= width + 0.5, `${key}: panel overflows the viewport`);
          await page.keyboard.press("Escape");
          expect(!(await isOpen()), `Escape did not close after ${key}`);
          expect((await active(page)).startsWith("SUMMARY"), `focus not returned to the summary after ${key}`);
        }
      });
  }

  // Safari and its WebKit build leave links out of the Tab order unless the OS
  // setting "Press Tab to highlight each item" is on, so Tab-to-link checks only
  // make sense in Chromium.
  const tabsToLinks = engine === "chromium";
  if (!tabsToLinks) console.log(`SKIP ${engine.padEnd(8)} keyboard Tab-to-link checks (WebKit does not Tab to links by default)`);
  if (tabsToLinks) await check("keyboard: skip link is first Tab stop and moves focus to #main", {}, async (_, page) => {
    await open(page, "/docs");
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.keyboard.press("Tab");
    expect((await active(page)).includes("|skip|"), `first Tab stop was ${await active(page)}`);
    await page.keyboard.press("Enter");
    expect(page.url().endsWith("#main"), "skip link did not target #main");
    expect((await active(page)).startsWith("MAIN|main"), `focus is on ${await active(page)}, not #main`);
  });

  if (tabsToLinks) await check("keyboard: docs sidebar links are reachable by Tab", {}, async (_, page) => {
    await open(page, "/docs");
    const expected = await page.locator(".desktop-doc-nav a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(expected.length > 3, "sidebar has no links");
    const seen = new Set();
    await page.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i < 60 && seen.size < expected.length; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest(".desktop-doc-nav") ? el.getAttribute("href") : null;
      });
      if (inside) seen.add(inside);
    }
    const missing = expected.filter((href) => !seen.has(href));
    expect(!missing.length, `not reachable by Tab: ${missing.join(", ")}`);
  });

  await check("finder: states its scope, finds tools, reports 0 for nonsense", {}, async (_, page) => {
    await open(page, "/docs");
    const input = page.locator("#doc-query");
    expect(/titles and summaries/i.test(await input.getAttribute("placeholder")), "placeholder does not state the scope");
    expect(/titles and summaries only/i.test(await page.locator("#doc-query-hint").innerText()), "scope hint missing");
    await input.fill("tool");
    const live = page.locator(".search-results [aria-live]");
    expect(/^[1-9]\d* guides? found$/.test((await live.innerText()).trim()), `result count was "${await live.innerText()}"`);
    expect(await page.locator('.search-results a[href^="/docs/tools"]').count() === 1, "no link to /docs/tools");
    await input.fill("zzqxnonsense");
    expect((await live.innerText()).trim() === "0 guides found", `nonsense count was "${await live.innerText()}"`);
  });

  await check(`release label: once per docs page, links to the ${manual.tag} release`, {}, async (_, page) => {
    for (const path of ["/docs", "/docs/tools"]) {
      await open(page, path);
      const label = page.locator(".release-label a");
      expect(await label.count() === 1, `${path}: expected one release label`);
      expect((await label.innerText()).includes(`Docs for ${releaseVersion}, the latest release`), `${path}: wrong label text`);
      expect(await label.getAttribute("href") === releaseUrl, `${path}: wrong link`);
    }
  });

  await check("theme: toggle persists across reload", {}, async (_, page) => {
    await open(page, "/");
    const dark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(!(await dark()), "expected light to start");
    await page.locator(".theme-switch").click();
    expect(await dark(), "toggle did not switch to dark");
    expect(await page.evaluate(() => localStorage.getItem("theme")) === "dark", "theme not stored in localStorage");
    await page.reload({ waitUntil: "load" });
    await hydrated(page);
    expect(await dark(), "dark theme lost after reload");
    await page.locator(".theme-switch").click();
    await page.reload({ waitUntil: "load" });
    await hydrated(page);
    expect(!(await dark()), "light theme lost after reload");
  });

  await check("animation: starts only on request and can be paused", {}, async (_, page) => {
    await open(page, "/");
    expect(await page.locator(".animated-mark").count() === 0, "animation is present before it is requested");
    const button = page.locator(".product-animation button");
    await button.click();
    expect(await page.locator(".animated-mark").isVisible(), "animation did not start");
    expect(/Pause/.test(await button.innerText()), "button does not offer Pause");
    await button.click();
    expect(await page.locator(".animated-mark").count() === 0, "animation did not stop");
  });

  await check("reduced motion: animation and its control are hidden", { reducedMotion: "reduce" }, async (_, page) => {
    await open(page, "/");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "reduced motion not emulated");
    expect(!(await page.locator(".product-animation button").isVisible()), "play control is visible");
    expect(await page.locator(".animated-mark").count() === 0, "animated mark is rendered");
    expect(await page.locator(".still-mark").isVisible(), "static mark is not shown");
    const transition = await page.evaluate(() => getComputedStyle(document.querySelector(".header")).transitionDuration);
    expect(/^0s(, 0s)*$/.test(transition), `transitions still run (${transition})`);
  });

  for (const [path, width] of [["/docs", 1280], ["/docs/tools", 1280], ["/docs", 390]])
    await check(`no-script: ${path} at ${width}px renders content and the menu works`, { javaScriptEnabled: false, viewport: { width, height: 800 } }, async (_, page) => {
      await page.goto(base + path, { waitUntil: "load" });
      expect((await page.locator("h1").innerText()).trim().length > 0, "no heading");
      expect((await page.locator("article.prose").innerText()).trim().length > 200, "article body is empty");
      if (width > 700) {
        await page.locator('.desktop-nav a[href="/docs/tools/"], .desktop-nav a[href="/docs/"]').first().waitFor();
        await page.locator(".desktop-nav a", { hasText: "Docs" }).click();
        await page.waitForURL(/\/docs\/?$/);
      } else {
        await page.locator(".mobile-nav > summary").click();
        expect(await page.evaluate(() => document.querySelector(".mobile-nav").open), "Menu did not open without JS");
        await page.locator(".mobile-nav a", { hasText: "Docs" }).click();
        await page.waitForURL(/\/docs\/?$/);
        await page.locator(".mobile-doc-nav > summary").click();
        expect(await page.evaluate(() => document.querySelector(".mobile-doc-nav").open), "guide menu did not open without JS");
        await page.locator(".mobile-doc-nav a", { hasText: "Tool reference" }).click();
        await page.waitForURL(/\/docs\/tools\/?$/);
      }
    });
}

async function main() {
  const base = await serve();
  const ran = [];
  for (const engine of ["chromium", "webkit"]) {
    const browser = await launch(engine);
    if (!browser) continue;
    ran.push(engine);
    await suite(browser, engine, base);
  }
  if (!ran.length) throw new Error("no browser engine could launch. Install one with `npx playwright-core install chromium`.");
  console.log(`Engines run: ${ran.join(", ")}`);
}

try {
  await main();
} catch (error) {
  results.push(false);
  console.log(`FAIL ${error.message}`);
} finally {
  cleanup();
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} of ${results.length} check(s) failed` : `All ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
