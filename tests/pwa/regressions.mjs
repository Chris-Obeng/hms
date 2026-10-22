import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { offlineDocument } from "../../lib/pwa/offline-document.ts";

const origin = "https://roomline.test";
const workerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const documentScript = offlineDocument.match(/<script>([\s\S]*?)<\/script>/)[1];
const offlineResponse = () => new Response(offlineDocument, {
  headers: { "content-type": "text/html; charset=utf-8", "x-roomline-offline": "1" },
});

class WorkerRequest extends Request {
  constructor(input, init) {
    super(typeof input === "string" ? new URL(input, origin) : input, init);
  }
}

function timers() {
  const pending = new Map();
  let id = 0;
  return {
    setTimeout: (fn) => { pending.set(++id, fn); return id; },
    clearTimeout: (key) => pending.delete(key),
    expire: () => { for (const fn of [...pending.values()]) fn(); },
    pending,
  };
}

function worker(fetch = async () => offlineResponse(), storageFailure = false, workerOrigin = origin) {
  const handlers = new Map();
  const stores = new Map();
  const clock = timers();
  let skipped = false;
  let claimed = false;
  const key = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      match: async (request) => store.get(key(request))?.clone(),
      put: async (request, response) => {
        if (storageFailure) throw new Error("quota exceeded");
        store.set(key(request), response.clone());
      },
      keys: async () => [...store.keys()].map((url) => new WorkerRequest(url)),
      delete: async (request) => store.delete(key(request)),
    };
  };
  const context = createContext({
    Request: WorkerRequest, Response, Headers, URL, AbortController,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    fetch,
    caches: {
      open: async (name) => cache(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    self: {
      location: { origin: workerOrigin },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
    },
  });
  runInContext(workerSource, context);
  function dispatch(name, request) {
    const pending = [];
    const event = {
      request,
      response: undefined,
      respondWith(response) { this.response = Promise.resolve(response); },
      waitUntil(promise) { pending.push(promise); },
      settle: () => Promise.all(pending),
    };
    handlers.get(name)(event);
    return event;
  }
  return {
    cache, stores, clock,
    skipped: () => skipped,
    claimed: () => claimed,
    install: () => dispatch("install"),
    activate: () => dispatch("activate"),
    fetch(path = "/dashboard", init = {}, navigate = true) {
      const request = new WorkerRequest(path, init);
      if (navigate) Object.defineProperty(request, "mode", { value: "navigate" });
      return dispatch("fetch", request);
    },
  };
}

function page(fetch, path = "/dashboard/bookings?date=2026-10-21#arrivals") {
  const clock = timers();
  const attrs = new Map();
  const handlers = new Map();
  const navigations = [];
  const retry = {
    href: "/dashboard",
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
    addEventListener: (name, handler) => handlers.set(name, handler),
  };
  const status = { textContent: "" };
  const location = { href: new URL(path, origin).href, assign: (url) => navigations.push(url) };
  const context = createContext({
    URL, AbortController, fetch,
    document: { getElementById: (id) => id === "offline-retry" ? retry : status },
    window: { location, fetch, AbortController, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout },
  });
  runInContext(documentScript, context);
  return {
    retry, status, attrs, navigations, clock,
    click: (overrides = {}) => handlers.get("click")({ button: 0, preventDefault() {}, ...overrides }),
  };
}

export function registerPwaTests(test) {
  test("install stores verified standalone HTML before activation", async () => {
    const app = worker(async (request) => {
      assert.equal(request.credentials, "omit");
      assert.equal(request.cache, "reload");
      assert.equal(request.redirect, "error");
      return offlineResponse();
    });
    await app.install().settle();
    assert.equal(app.skipped(), true);
    assert.equal(await (await app.cache("rl-navigation-v6").match("/offline")).text(), offlineDocument);
  });

  for (const [label, response] of [
    ["login HTML", () => new Response("Sign in", { headers: { "content-type": "text/html" } })],
    ["JSON", () => Response.json({ error: true })],
    ["HTTP error", () => new Response("Bad gateway", { status: 502 })],
  ]) {
    test(`install rejects ${label} without replacing the previous worker`, async () => {
      const app = worker(async () => response());
      await assert.rejects(app.install().settle(), /Invalid RoomLine/);
      assert.equal(app.skipped(), false);
    });
  }

  test("cache write failure prevents installation", async () => {
    const app = worker(undefined, true);
    await assert.rejects(app.install().settle(), /quota/);
    assert.equal(app.skipped(), false);
  });

  test("activation removes only obsolete RoomLine cache namespaces", async () => {
    const app = worker();
    for (const name of ["rl-navigation-v5", "rl-static-v5", "rl-navigation-v6", "other-app-v4", "rl-custom-v1"]) app.cache(name);
    await app.activate().settle();
    assert.deepEqual([...app.stores.keys()], ["rl-navigation-v6", "other-app-v4", "rl-custom-v1"]);
    assert.equal(app.claimed(), true);
  });

  test("failed navigation uses only the dedicated public offline cache", async () => {
    const app = worker(async () => { throw new Error("offline"); });
    await app.cache("other-app").put("/dashboard", new Response("private stale HTML"));
    await app.cache("rl-navigation-v6").put("/offline", offlineResponse());
    assert.equal(await (await app.fetch().response).text(), offlineDocument);
  });

  test("slow navigation times out to cached fallback", async () => {
    const app = worker(() => new Promise(() => {}));
    await app.cache("rl-navigation-v6").put("/offline", offlineResponse());
    const event = app.fetch();
    app.clock.expire();
    assert.equal(await (await event.response).text(), offlineDocument);
    assert.equal(app.clock.pending.size, 0);
  });

  test("localhost navigation bypasses a stale production worker during development", async () => {
    const app = worker(async () => { throw new Error("offline"); }, false, "http://localhost:3000");
    const event = app.fetch("http://localhost:3000/dashboard");
    assert.equal(event.response, undefined);
  });

  for (const status of [200, 401, 403, 404, 500]) {
    test(`navigation preserves HTTP ${status} and never caches private HTML`, async () => {
      const app = worker(async () => new Response("server document", { status }));
      const response = await app.fetch().response;
      assert.equal(response.status, status);
      assert.equal(await response.text(), "server document");
      assert.equal(app.stores.size, 0);
    });
  }

  test("missing/invalid fallback returns a network error, not another app's HTML", async () => {
    const app = worker(async () => { throw new Error("offline"); });
    await app.cache("rl-navigation-v6").put("/offline", new Response("unverified"));
    assert.equal((await app.fetch().response).type, "error");
  });

  test("RSC, APIs, writes and credential-bearing data bypass runtime caches", () => {
    const app = worker();
    for (const [path, init, navigate] of [
      ["/dashboard?_rsc=abc", {}, true],
      ["/dashboard", { headers: { RSC: "1" } }, false],
      ["/api/private/export.png", {}, false],
      ["/api/private/export.png", {}, true],
      ["/dashboard", { method: "POST" }, true],
      ["/dashboard", { method: "HEAD" }, false],
      ["/api/booking/demo/availability", {}, false],
      ["/_next/static/chunk.js", { headers: { Authorization: "Bearer example" } }, false],
      ["/images/cover.png?token=example", {}, false],
      ["https://other.test/cover.png", {}, false],
    ]) assert.equal(app.fetch(path, init, navigate).response, undefined);
  });

  test("public static files are fetched without cookies and writes complete with event lifetime", async () => {
    const app = worker(async (request) => {
      assert.equal(request.credentials, "omit");
      return new Response("asset bytes", { headers: { "content-type": "text/javascript" } });
    });
    const event = app.fetch("/_next/static/chunk.js", {}, false);
    assert.equal(await (await event.response).text(), "asset bytes");
    await event.settle();
    assert.equal(await (await app.cache("rl-static-v6").match("/_next/static/chunk.js")).text(), "asset bytes");
  });

  test("storage quota failures do not lose successful network responses", async () => {
    const app = worker(async () => new Response("asset"), true);
    const event = app.fetch("/images/cover.png", {}, false);
    assert.equal(await (await event.response).text(), "asset");
    await event.settle();
  });

  test("background revalidation updates static cache after cached response is returned", async () => {
    let finish;
    const app = worker(() => new Promise((resolve) => { finish = resolve; }));
    await app.cache("rl-static-v6").put("/_next/static/chunk.js", new Response("old"));
    const event = app.fetch("/_next/static/chunk.js", {}, false);
    assert.equal(await (await event.response).text(), "old");
    finish(new Response("new"));
    await event.settle();
    assert.equal(await (await app.cache("rl-static-v6").match("/_next/static/chunk.js")).text(), "new");
  });

  test("parallel static cache writes respect entry limit", async () => {
    const app = worker(async () => new Response("asset"));
    const events = Array.from({ length: 70 }, (_, index) => app.fetch(`/_next/static/${index}.js`, {}, false));
    await Promise.all(events.map((event) => event.settle()));
    assert.equal((await app.cache("rl-static-v6").keys()).length, 64);
  });

  test("availability expires at 120s and rejects unknown or invalid freshness", async () => {
    for (const timestamp of [undefined, "invalid", String(Date.now() - 120001), String(Date.now() + 60000)]) {
      const app = worker(async () => { throw new Error("offline"); });
      const headers = timestamp === undefined ? {} : { "x-roomline-cached-at": timestamp };
      await app.cache("rl-availability-v6").put("/api/booking/demo/availability", new Response("stale", { headers }));
      const event = app.fetch("/api/booking/demo/availability", { credentials: "omit" }, false);
      assert.equal((await event.response).type, "error");
      await event.settle();
    }
  });

  test("recent public availability is available on network failure", async () => {
    const app = worker(async () => { throw new Error("offline"); });
    await app.cache("rl-availability-v6").put("/api/booking/demo/availability", new Response("fresh", {
      headers: { "x-roomline-cached-at": String(Date.now()) },
    }));
    const event = app.fetch("/api/booking/demo/availability", { credentials: "omit" }, false);
    assert.equal(await (await event.response).text(), "fresh");
    await event.settle();
  });

  test("private, redirected or HTML asset responses are not persisted", async () => {
    for (const headers of [{ "cache-control": "private" }, { "cache-control": "no-store" }, { "content-type": "text/html" }]) {
      const app = worker(async () => new Response("not public", { headers }));
      const event = app.fetch("/_next/static/chunk.js", {}, false);
      await event.settle();
      assert.equal(await app.cache("rl-static-v6").match("/_next/static/chunk.js"), undefined);
    }
  });

  test("offline document needs no external assets and permits browser zoom", () => {
    assert.doesNotMatch(offlineDocument, /<script[^>]+src=|rel="stylesheet"|<img\b|@import|@font-face|maximum-scale|user-scalable/);
    assert.match(offlineDocument, /viewport-fit=cover/);
    assert.match(offlineDocument, /prefers-reduced-motion/);
    assert.match(offlineDocument, /forced-colors/);
    assert.match(offlineDocument, /aria-live="polite"/);
    assert.equal((offlineDocument.match(/<a\s/g) || []).length, 1);
  });

  test("retry preserves deep link, query and fragment", async () => {
    const app = page(async (url, options) => {
      assert.equal(options.method, "HEAD");
      assert.equal(options.cache, "no-store");
      assert.equal(url, `${origin}/dashboard/bookings?date=2026-10-21#arrivals`);
      return new Response(null);
    });
    await app.click();
    assert.deepEqual(app.navigations, [app.retry.href]);
    assert.equal(app.attrs.size, 0);
    assert.equal(app.clock.pending.size, 0);
  });

  test("direct offline route retries dashboard without a return-URL injection", () => {
    const app = page(async () => new Response(null), "/offline?returnTo=https://evil.test");
    assert.equal(app.retry.href, `${origin}/dashboard`);
  });

  test("no-JS retry remains a real dashboard link", () => {
    const app = page(undefined);
    assert.match(offlineDocument, /id="offline-retry" href="\/dashboard"/);
    assert.equal(app.navigations.length, 0);
  });

  test("failed retry stays on document and restores usable action", async () => {
    for (const fetch of [
      async () => { throw new Error("offline"); },
      async () => new Response(null, { status: 503 }),
      async () => offlineResponse(),
    ]) {
      const app = page(fetch);
      await app.click();
      assert.equal(app.navigations.length, 0);
      assert.equal(app.attrs.size, 0);
      assert.match(app.status.textContent, /try again/i);
    }
  });

  test("retry is bounded and cannot be submitted twice while checking", async () => {
    let calls = 0;
    const app = page(() => { calls += 1; return new Promise(() => {}); });
    const first = app.click();
    assert.equal(app.attrs.get("aria-busy"), "true");
    await app.click();
    assert.equal(calls, 1);
    app.clock.expire();
    await first;
    assert.equal(app.navigations.length, 0);
    assert.equal(app.attrs.size, 0);
    assert.match(app.status.textContent, /try again/i);
  });

  test("modified clicks preserve normal browser link behavior", async () => {
    let calls = 0;
    const app = page(async () => { calls += 1; return new Response(null); });
    await app.click({ ctrlKey: true });
    assert.equal(calls, 0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { test } = await import("node:test");
  registerPwaTests(test);
}
