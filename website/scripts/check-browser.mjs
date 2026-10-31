// Rendered browser check for the exported site. Run `npm run build` first, then
// `npm run check:browser`. Serves out/ on 127.0.0.1, drives Chromium (Playwright
// build or system Chrome) and WebKit when installed. Local only: not part of CI.
import { createReadStream, existsSync, statSync, mkdirSync } from "node:fs";
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
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const results = [];
const browsers = [];
let server;

function cleanup() {
  for (const browser of browsers) browser.close().catch(() => {});
  server?.close();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    cleanup();
    process.exit(130);
  });

async function serve() {
  if (!existsSync(join(root, "index.html")))
    throw new Error("out/ is missing. Run `npm run build` first.");
  server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
    let file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) return void response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
      const page404 = join(root, "404.html");
      response.writeHead(404, { "content-type": mime[".html"] });
      return void (existsSync(page404)
        ? createReadStream(page404).pipe(response)
        : response.end("Not found"));
    }
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
    const browser =
      engine === "chromium" && !bundled
        ? await type.launch({ channel: "chrome", headless: true })
        : await type.launch({ headless: true });
    browsers.push(browser);
    return browser;
  } catch (error) {
    console.log(`SKIP ${engine}: not available (${String(error.message).split("\n")[0]})`);
    return null;
  }
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hydrated = (page) =>
  page.waitForSelector(".theme-switch:not([disabled])", { timeout: 10_000 });

async function suite(browser, engine, base) {
  const check = async (name, options, fn) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "light",
      ...options,
    });
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
  const active = (page) =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}|${el.id}|${el.className}|${el.getAttribute("href") ?? ""}` : "";
    });

  for (const width of [1280, 390, 320]) {
    const viewport = { width, height: width > 700 ? 800 : 800 };
    for (const path of ["/", "/docs", "/docs/tools"])
      await check(`${width}px no horizontal overflow on ${path}`, { viewport }, async (_, page) => {
        await open(page, path);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth <= innerWidth, `scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`);
      });

    if (width >= 760)
      await check(`${width}px header links are inline`, { viewport }, async (_, page) => {
        await open(page, "/");
        const nav = page.locator(".desktop-nav");
        expect(await nav.isVisible(), "inline nav is hidden");
        expect((await nav.locator("a:visible").count()) === 4, "expected 4 inline links");
        expect(
          !(await page.locator(".mobile-nav > summary").isVisible()),
          "Menu disclosure shows at desktop width",
        );
      });
    else
      await check(
        `${width}px Menu opens with Enter and Space, Escape closes and returns focus`,
        { viewport },
        async (_, page) => {
          await open(page, "/");
          expect(!(await page.locator(".desktop-nav").isVisible()), "inline nav still visible");
          const summary = page.locator(".mobile-nav > summary");
          const isOpen = () => page.evaluate(() => document.querySelector(".mobile-nav").open);
          for (const key of ["Enter", "Space"]) {
            await summary.focus();
            await page.keyboard.press(key);
            expect(await isOpen(), `${key} did not open the menu`);
            const box = await page.locator(".mobile-nav > div").boundingBox();
            expect(
              box && box.x >= 0 && box.x + box.width <= width + 0.5,
              `${key}: panel overflows the viewport`,
            );
            await page.keyboard.press("Escape");
            expect(!(await isOpen()), `Escape did not close after ${key}`);
            expect(
              (await active(page)).startsWith("SUMMARY"),
              `focus not returned to the summary after ${key}`,
            );
          }
        },
      );
  }

  await check(
    "install: six tabs support keyboard navigation and client configs",
    {},
    async (_, page) => {
      await open(page, "/");
      const tabs = page.getByRole("tab");
      expect((await tabs.count()) === 6, "expected six install tabs");
      await tabs.first().focus();
      await page.keyboard.press("ArrowRight");
      expect(
        (await page
          .getByRole("tab", { name: "Cursor", exact: true })
          .getAttribute("aria-selected")) === "true",
        "ArrowRight did not activate Cursor",
      );
      await page.keyboard.press("ArrowRight");
      expect(
        (await page
          .getByRole("tab", { name: "VS Code", exact: true })
          .getAttribute("aria-selected")) === "true",
        "ArrowRight did not move from Cursor to VS Code",
      );
      const config = JSON.parse(
        await page.locator('[role="tabpanel"]:visible pre code').innerText(),
      );
      expect(
        config.servers["portkey-admin"].type === "stdio",
        "VS Code config has no stdio server",
      );
      await page.getByRole("tab", { name: "Windsurf", exact: true }).click();
      expect(
        (await page.locator('[role="tabpanel"]:visible').innerText()).includes(
          "~/.codeium/windsurf/mcp_config.json",
        ),
        "wrong Windsurf path",
      );
    },
  );
  await check("tools: domains, paging, search and annotation filters", {}, async (_, page) => {
    await open(page, "/");
    expect((await page.locator(".dcard").count()) === 22, "expected 22 domains");
    expect(
      (await page.locator(".tool-row").count()) === 14,
      "default view should show the prompts domain",
    );
    await page.getByRole("button", { name: "Show all 194", exact: true }).click();
    expect((await page.locator(".tool-row").count()) === 40, "first page should show 40 tools");
    await page.getByRole("button", { name: "Show 40 more", exact: true }).click();
    expect((await page.locator(".tool-row").count()) === 80, "second page should show 80 tools");
    await page.locator(".dcard").filter({ hasText: "prompts" }).click();
    const enterpriseSwitch = page.getByRole("switch", { name: "Enterprise only" });
    const inactiveBackground = await enterpriseSwitch.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await enterpriseSwitch.click();
    expect(
      (await enterpriseSwitch.evaluate((el) => getComputedStyle(el).backgroundColor)) !==
        inactiveBackground,
      "checked Enterprise switch needs a visible active style",
    );
    expect(
      (await page.locator("#tool-count").innerText()).startsWith("56 tools,"),
      "expected 56 Enterprise tools",
    );
    await page.locator("#tool-q").fill("rotate_api_key");
    expect(
      (await page.locator("#tool-count").innerText()).startsWith("0 tools,"),
      "Enterprise filter should hide workspace key rotation",
    );
    await page.getByRole("switch", { name: "Enterprise only" }).click();
    expect(
      (await page.locator(".tool-row").count()) === 1,
      "search should find only rotate_api_key",
    );
    expect(
      /destructive/i.test(await page.locator(".tool-row").innerText()),
      "rotation should carry its real destructive annotation",
    );
    await page.locator("#tool-q").fill("zzqnonsense");
    expect((await page.locator(".tool-row").count()) === 0, "nonsense search should be empty");
    await page.locator("#tool-q").press("Escape");
    expect(
      (await page.locator(".dcard:visible").count()) === 22,
      "Escape should restore domain grid",
    );
    expect(
      (await page.locator("#tool-q").getAttribute("aria-controls")) === null,
      "reset search references a missing results container",
    );
    await page.locator("#tool-q").fill("rotate_api_key");
    expect(
      (await page.locator("#tool-q").getAttribute("aria-controls")) === "tool-lists" &&
        (await page.locator("#tool-lists").count()) === 1,
      "active search must reference its results container",
    );
  });
  await check("install: VS Code uses manual credential setup", {}, async (_, page) => {
    await open(page, "/");
    await page.getByRole("tab", { name: "VS Code", exact: true }).click();
    expect((await page.locator('#panel-vscode a[href^="vscode:"]').count()) === 0,
      "VS Code link installs an unusable credential placeholder");
    expect((await page.locator("#panel-vscode").innerText()).includes("Replace your_api_key"),
      "manual credential instructions are missing");
  });
  await check("docs: denied clipboard selects code with touch-safe instructions", { hasTouch: true }, async (context, page) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: {
        writeText: async () => { throw new Error("Permission denied"); },
      } });
    });
    await open(page, "/docs/manual/");
    const block = page.locator(".doc-code").first();
    await block.getByRole("button", { name: "Copy code" }).click();
    await page.waitForFunction(() =>
      document.querySelector(".doc-code button")?.textContent === "Selected. Copy manually",
      null, { timeout: 1500 },
    );
    expect((await page.evaluate(() => window.getSelection()?.toString())) ===
      (await block.locator("pre").textContent()), "fallback did not select the code");
  });
  await check("docs: table of contents anchors and local code copy", {}, async (context, page) => {
    if (engine === "chromium")
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "/docs/manual/");
    const toc = page.locator(".doc-toc").getByRole("navigation", { name: "On this page" });
    expect((await toc.locator("a").count()) > 3, "missing heading links");
    const href = await toc.locator("a").first().getAttribute("href");
    expect((await page.locator(href).count()) === 1, "TOC target missing");
    const block = page.locator(".doc-code").first();
    await block.getByRole("button", { name: "Copy code" }).click();
    await page.waitForFunction(() =>
      /Copied|Selected/.test(document.querySelector(".doc-code button")?.textContent || ""),
    );
    if (engine === "chromium")
      expect(
        (await page.evaluate(() => navigator.clipboard.readText())) ===
          (await block.locator("pre").textContent()),
        "clipboard differs from the selected code block",
      );
  });

  for (const width of [390, 1440])
    for (const colorScheme of ["light", "dark"]) {
      await check(
        `visual: ${width}px ${colorScheme}`,
        { viewport: { width, height: 800 }, colorScheme, reducedMotion: "reduce" },
        async (_, page) => {
          await page.route("https://img.shields.io/**", (route) => route.abort());
          await open(page, "/");
          const expectedHeader =
            colorScheme === "dark" ? "rgb(30, 22, 41)" : "rgb(239, 230, 246)";
          expect(
            (await page
              .locator(".header")
              .first()
              .evaluate((el) => getComputedStyle(el).backgroundColor)) === expectedHeader,
            `header background is not ${expectedHeader}`,
          );
          expect(
            (await page.locator("h1").innerText()) === "Administer Portkey from your MCP client." ||
              (await page.locator("h1").innerText()).replace(/\s+/g, " ") ===
                "Administer Portkey from your MCP client.",
            "wrong heading",
          );
          if (process.env.SITE_SHOTS_DIR) {
            mkdirSync(process.env.SITE_SHOTS_DIR, { recursive: true });
            await page.locator("#trust").scrollIntoViewIfNeeded();
            await page.waitForFunction(() =>
              [...document.querySelectorAll("#trust img")].filter(
                (img) => new URL(img.src).origin === location.origin,
              ).every(
                (img) => img.complete && img.naturalWidth > 0,
              ),
            );
            await page.screenshot({
              path: join(process.env.SITE_SHOTS_DIR, `${engine}-${width}-${colorScheme}.png`),
              fullPage: true,
            });
          }
          if (width === 390) {
            await open(page, "/docs/manual/");
            await page.locator(".mobile-toc > summary").click();
            expect(
              await page.locator(".mobile-toc nav a").first().isVisible(),
              "mobile TOC did not open",
            );
            await page.locator(".mobile-toc nav a").first().click();
            expect(page.url().includes("#"), "mobile TOC did not navigate to its heading");
          }
        },
      );
    }

  // Safari and its WebKit build leave links out of the Tab order unless the OS
  // setting "Press Tab to highlight each item" is on, so Tab-to-link checks only
  // make sense in Chromium.
  const tabsToLinks = engine === "chromium";
  if (!tabsToLinks)
    console.log(
      `SKIP ${engine.padEnd(8)} keyboard Tab-to-link checks (WebKit does not Tab to links by default)`,
    );
  if (tabsToLinks)
    await check(
      "keyboard: skip link is first Tab stop and moves focus to #main",
      {},
      async (_, page) => {
        await open(page, "/docs");
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.scrollTo(0, 0);
        });
        await page.keyboard.press("Tab");
        expect((await active(page)).includes("|skip|"), `first Tab stop was ${await active(page)}`);
        await page.keyboard.press("Enter");
        expect(page.url().endsWith("#main"), "skip link did not target #main");
        expect(
          (await active(page)).startsWith("MAIN|main"),
          `focus is on ${await active(page)}, not #main`,
        );
      },
    );

  if (tabsToLinks)
    await check("keyboard: docs sidebar links are reachable by Tab", {}, async (_, page) => {
      await open(page, "/docs");
      const expected = await page
        .locator(".desktop-doc-nav a")
        .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
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

  await check(
    "finder: states its scope, finds tools, reports 0 for nonsense",
    {},
    async (_, page) => {
      await open(page, "/docs");
      const input = page.locator("#doc-query");
      expect(
        /titles and summaries/i.test(await input.getAttribute("placeholder")),
        "placeholder does not state the scope",
      );
      expect(
        /titles and summaries only/i.test(await page.locator("#doc-query-hint").innerText()),
        "scope hint missing",
      );
      await input.fill("tool");
      const live = page.locator(".search-results [aria-live]");
      expect(
        /^[1-9]\d* guides? found$/.test((await live.innerText()).trim()),
        `result count was "${await live.innerText()}"`,
      );
      expect(
        (await page.locator('.search-results a[href^="/docs/tools"]').count()) === 1,
        "no link to /docs/tools",
      );
      await input.fill("zzqxnonsense");
      expect(
        (await live.innerText()).trim() === "0 guides found",
        `nonsense count was "${await live.innerText()}"`,
      );
    },
  );

  await check(
    `release label: once per docs page, links to the ${manual.tag} release`,
    {},
    async (_, page) => {
      for (const path of ["/docs", "/docs/tools"]) {
        await open(page, path);
        const label = page.locator(".release-label a");
        expect((await label.count()) === 1, `${path}: expected one release label`);
        expect(
          (await label.innerText()).includes(`Docs for ${releaseVersion}, the latest release`),
          `${path}: wrong label text`,
        );
        expect((await label.getAttribute("href")) === releaseUrl, `${path}: wrong link`);
      }
    },
  );

  await check("theme: toggle persists across reload", {}, async (_, page) => {
    await open(page, "/");
    const dark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(!(await dark()), "expected light to start");
    await page.locator(".theme-switch").click();
    expect(await dark(), "toggle did not switch to dark");
    expect(
      (await page.evaluate(() => localStorage.getItem("theme"))) === "dark",
      "theme not stored in localStorage",
    );
    await page.reload({ waitUntil: "load" });
    await hydrated(page);
    expect(await dark(), "dark theme lost after reload");
    await page.locator(".theme-switch").click();
    await page.reload({ waitUntil: "load" });
    await hydrated(page);
    expect(!(await dark()), "light theme lost after reload");
  });

  await check("theme: toggle updates the theme-color meta", {}, async (_, page) => {
    await open(page, "/");
    const colors = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content),
      );
    await page.locator(".theme-switch").click();
    expect(
      (await colors()).every((c) => c === "#16101e"),
      "theme-color not dark after toggle",
    );
    await page.locator(".theme-switch").click();
    expect(
      (await colors()).every((c) => c === "#f9f5fc"),
      "theme-color not light after toggle",
    );
  });

  await check(
    "hero logo: static frame first, then the looping spin render",
    {},
    async (_, page) => {
      await open(page, "/");
      await page.waitForFunction(
        () => document.querySelector("#hero-logo")?.dataset.played === "1",
        null,
        { timeout: 10_000 },
      );
      expect(
        (await page.locator("#hero-logo").getAttribute("src")).endsWith(
          "/assets/portkey-spin-v3-360.webp",
        ),
        "spin render was not swapped in",
      );
    },
  );

  await check(
    "reduced motion: hero logo stays on the still frame",
    { reducedMotion: "reduce" },
    async (_, page) => {
      await open(page, "/");
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
        "reduced motion not emulated",
      );
      await page.waitForTimeout(800);
      expect(
        (await page.locator("#hero-logo").getAttribute("src")).endsWith(
          "/assets/portkey-360-v2.webp",
        ),
        "logo left the still frame",
      );
      expect(
        (await page.locator("#hero-logo").getAttribute("data-played")) === null,
        "logo reports it played",
      );
      const transition = await page.evaluate(
        () => getComputedStyle(document.querySelector(".header")).transitionDuration,
      );
      expect(/^0s(, 0s)*$/.test(transition), `transitions still run (${transition})`);
    },
  );

  await check(
    "narrow screens: animation is never fetched",
    { viewport: { width: 390, height: 800 } },
    async (_, page) => {
      const requests = [];
      page.on("request", (request) => {
        if (request.url().includes("portkey-spin")) requests.push(request.url());
      });
      await open(page, "/");
      await page.waitForTimeout(600);
      expect(requests.length === 0, "mobile fetched the spin animation");
      expect(
        (await page.locator("#hero-logo").getAttribute("src")).endsWith("portkey-360-v2.webp"),
        "mobile did not keep the still",
      );
    },
  );

  await check(
    "finder: results sit in page flow and do not cover the article at 390px",
    { viewport: { width: 390, height: 800 } },
    async (_, page) => {
      await open(page, "/docs");
      await page.locator("#doc-query").fill("security");
      const results = page.locator(".search-results");
      expect(
        (await results.evaluate((el) => getComputedStyle(el).position)) === "static",
        "results are positioned over the page",
      );
      const [r, article] = await Promise.all([
        results.boundingBox(),
        page.locator("article.prose").boundingBox(),
      ]);
      expect(r.y + r.height <= article.y + 0.5, "results overlap the article");
    },
  );

  await check("404: styled, noindex, and offers the guide finder", {}, async (_, page) => {
    const response = await page.goto(base + "/does-not-exist/", { waitUntil: "load" });
    expect(response.status() === 404, `status ${response.status()}`);
    expect(
      /Nothing to administer here/.test(await page.locator("h1").innerText()),
      "404 heading missing",
    );
    expect(
      (await page.locator('meta[name="robots"][content*="noindex"]').count()) >= 1,
      "404 is not noindex",
    );
    expect((await page.locator("#doc-query").count()) === 1, "404 has no finder");
  });

  for (const [path, width] of [
    ["/docs", 1280],
    ["/docs/tools", 1280],
    ["/docs", 390],
  ])
    await check(
      `no-script: ${path} at ${width}px renders content and the menu works`,
      { javaScriptEnabled: false, viewport: { width, height: 800 } },
      async (_, page) => {
        await page.goto(base + path, { waitUntil: "load" });
        expect((await page.locator("h1").innerText()).trim().length > 0, "no heading");
        expect(
          (await page.locator("article.prose").innerText()).trim().length > 200,
          "article body is empty",
        );
        if (width > 700) {
          await page
            .locator('.desktop-nav a[href="/docs/tools/"], .desktop-nav a[href="/docs/"]')
            .first()
            .waitFor();
          await page.locator(".desktop-nav a", { hasText: "Docs" }).click();
          await page.waitForURL(/\/docs\/?$/);
        } else {
          await page.locator(".mobile-nav > summary").click();
          expect(
            await page.evaluate(() => document.querySelector(".mobile-nav").open),
            "Menu did not open without JS",
          );
          await page.locator(".mobile-nav a", { hasText: "Docs" }).click();
          await page.waitForURL(/\/docs\/?$/);
          await page.locator(".mobile-doc-nav > summary").click();
          expect(
            await page.evaluate(() => document.querySelector(".mobile-doc-nav").open),
            "guide menu did not open without JS",
          );
          await page.locator(".mobile-doc-nav a", { hasText: "Tool reference" }).click();
          await page.waitForURL(/\/docs\/tools\/?$/);
        }
      },
    );
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
  if (!ran.length)
    throw new Error(
      "no browser engine could launch. Install one with `npx playwright-core install chromium`.",
    );
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
console.log(
  failed ? `${failed} of ${results.length} check(s) failed` : `All ${results.length} checks passed`,
);
process.exit(failed ? 1 : 0);
