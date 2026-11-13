// Isolated browser smoke test of the production document and worker, not a Next build.
// Requires Playwright and @axe-core/playwright in the project or --tools-root directory.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { offlineDocument } from "../../lib/pwa/offline-document.ts";

const toolsIndex = process.argv.indexOf("--tools-root");
const require = createRequire(toolsIndex < 0 ? import.meta.url : resolve(process.argv[toolsIndex + 1], "package.json"));
const { chromium } = require("playwright");
const { default: AxeBuilder } = require("@axe-core/playwright");
const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const output = ".playwright/offline";
mkdirSync(output, { recursive: true });
const report = { passed: [], completed: false };
function record(message) {
  report.passed.push(message);
  writeFileSync(`${output}/checks.json`, JSON.stringify(report, null, 2));
  console.log(`PASS ${message}`);
}

const server = createServer((request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  response.setHeader("Cache-Control", "no-store");
  if (path === "/sw.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(worker);
  } else if (path === "/offline") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("X-RoomLine-Offline", "1");
    response.end(request.method === "HEAD" ? undefined : offlineDocument);
  } else {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(request.method === "HEAD" ? undefined : '<!doctype html><html lang="en"><title>Test fixture</title><body><h1>Online fixture</h1></body></html>');
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const [width, height, scale] of [
    [320, 568, 1], [375, 812, 1], [768, 1024, 1], [1024, 768, 1],
    [1440, 900, 1], [667, 375, 1], [320, 568, 2], [768, 1024, 2],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/offline`);
    if (scale > 1) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const layout = await page.evaluate(() => {
      const button = document.getElementById("offline-retry");
      const rect = button.getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, target: rect.height,
        animations: document.getAnimations().length };
    });
    assert.ok(layout.scrollWidth <= width, `horizontal overflow at ${width}, text scale ${scale}`);
    assert.ok(layout.target >= 48);
    assert.equal(layout.animations, 0);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#offline-retry").evaluate((el) => document.activeElement === el), true);
    assert.equal(await page.locator("#offline-retry").evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(axe.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), []);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${width}-${height}-text-${scale}.png`, fullPage: true });
    record(`${width}x${height}, text ${scale * 100}%: no overflow, 48px target, keyboard focus, axe AA`);
    await context.close();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(async () => {
    await caches.open("other-app-v1");
    await caches.open("rl-navigation-v4");
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cachesAtInstall = await page.evaluate(() => caches.keys());
  assert.ok(cachesAtInstall.includes("other-app-v1"));
  assert.ok(!cachesAtInstall.includes("rl-navigation-v4"));
  assert.ok(cachesAtInstall.includes("rl-navigation-v8"));
  record("worker install and namespaced cache cleanup");
  await context.setOffline(true);
  const path = "/dashboard/bookings?date=2026-10-21#arrivals";
  const response = await page.goto(`${base}${path}`);
  assert.equal(response.fromServiceWorker(), true);
  await page.getByRole("heading", { name: "You’re offline" }).waitFor();
  record("offline navigation served standalone HTML from service worker");
  await page.getByRole("link", { name: "Try again" }).click();
  await page.getByRole("status").filter({ hasText: "Still unable to connect" }).waitFor();
  assert.equal(page.url(), `${base}${path}`);
  await page.reload();
  await page.getByRole("heading", { name: "You’re offline" }).waitFor();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await page.getByRole("heading", { name: "Online fixture" }).waitFor();
  assert.equal(page.url(), `${base}${path}`);
  record("offline deep link, failed retry, reload, online recovery");
  await context.close();

  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await noJs.newPage();
  await staticPage.goto(`${base}/offline`);
  await staticPage.getByRole("link", { name: "Try again" }).click();
  assert.equal(staticPage.url(), `${base}/dashboard`);
  await noJs.close();
  record("JavaScript-disabled recovery link");
  report.completed = true;
  writeFileSync(`${output}/checks.json`, JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
