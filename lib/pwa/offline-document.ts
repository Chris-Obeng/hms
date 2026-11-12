// Keep this document self-contained: it must render without the application shell.
export const offlineDocument = `<!doctype html>
<html lang="en" data-connection="offline">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="light">
    <meta name="robots" content="noindex">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230f172a'/%3E%3Crect x='8' y='15' width='4' height='10' rx='1' fill='%23f8fafc'/%3E%3Crect x='14' y='8' width='4' height='17' rx='1' fill='%23c8a96a'/%3E%3Crect x='20' y='12' width='4' height='13' rx='1' fill='%23f8fafc'/%3E%3C/svg%3E">
    <title>Connection unavailable · RoomLine</title>
    <style>
      *, *::before, *::after {
        box-sizing: border-box;
      }

      :root {
        color-scheme: only light;
        --bg: #f8f9fb;
        --surface: #ffffff;
        --border: #e2e8f0;
        --ring-outer: #eef2f6;
        --ink: #0f172a;
        --ink-secondary: #475467;
        --ink-tertiary: #526071;
        --brass: #b8924a;
        --primary: #1d4ed8;
        --primary-hover: #1e40af;
        --primary-active: #1e3a8a;
        --pill-bg: #fffbeb;
        --pill-border: #fde68a;
        --pill-fg: #92400e;
        --pill-dot: #d97706;
        --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      }

      html[data-connection="checking"],
      html[data-connection="detected"] {
        --pill-bg: #eff6ff;
        --pill-border: #bfdbfe;
        --pill-fg: #1e40af;
        --pill-dot: #2563eb;
      }

      html[data-connection="online"] {
        --pill-bg: #ecfdf5;
        --pill-border: #a7f3d0;
        --pill-fg: #065f46;
        --pill-dot: #059669;
      }

      html {
        background-color: var(--bg);
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        -webkit-tap-highlight-color: transparent;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      body {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0;
        --edge-x: clamp(16px, 5vw, 40px);
        --edge-y: clamp(14px, 3vh, 28px);
        padding-top: max(var(--edge-y), env(safe-area-inset-top));
        padding-right: max(var(--edge-x), env(safe-area-inset-right));
        padding-bottom: max(var(--edge-y), env(safe-area-inset-bottom));
        padding-left: max(var(--edge-x), env(safe-area-inset-left));
        background-color: var(--bg);
        color: var(--ink);
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 1rem;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }

      .topbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 12px;
        width: 100%;
        max-width: 72rem;
        min-width: 0;
        margin-inline: auto;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
      }

      .brand-mark {
        display: inline-flex;
        align-items: flex-end;
        gap: 2.5px;
        flex-shrink: 0;
      }

      .brand-mark .bar {
        display: block;
        width: 4px;
        border-radius: 1px;
        background-color: var(--ink);
      }

      .brand-mark .bar-1 { height: 11px; }
      .brand-mark .bar-2 { height: 18px; background-color: var(--brass); }
      .brand-mark .bar-3 { height: 14px; }

      .brand-name {
        font-size: 1.0625rem;
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.1;
        color: var(--ink);
      }

      .signal-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        max-width: 100%;
        padding: 5px 11px;
        border: 1px solid var(--pill-border);
        border-radius: 999px;
        background-color: var(--pill-bg);
        color: var(--pill-fg);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.015em;
        line-height: 1.25;
        transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
      }

      .signal-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background-color: var(--pill-dot);
        flex-shrink: 0;
        transition: background-color 180ms ease;
      }

      main {
        display: flex;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-width: 28rem;
        min-width: 0;
        margin-inline: auto;
        padding-block: clamp(20px, 6vh, 56px);
        text-align: center;
      }

      .emblem-ring {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px;
        border-radius: 24px;
        border: 1px solid var(--ring-outer);
        background-color: #f2f4f8;
      }

      .emblem {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background-color: var(--surface);
        color: var(--ink);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 20px -6px rgba(15, 23, 42, 0.08);
      }

      .emblem-dot {
        position: absolute;
        right: -3px;
        bottom: -3px;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        border: 2.5px solid var(--surface);
        background-color: var(--pill-dot);
        transition: background-color 180ms ease;
      }

      .emblem .icon-online {
        display: none;
      }

      html[data-connection="online"] .emblem .icon-offline {
        display: none;
      }

      html[data-connection="online"] .emblem .icon-online {
        display: block;
        color: #059669;
      }

      h1 {
        margin: clamp(18px, 3vh, 26px) 0 0;
        max-width: 100%;
        font-size: clamp(1.625rem, 1.35rem + 1.4vw, 2.25rem);
        font-weight: 700;
        letter-spacing: -0.035em;
        line-height: 1.15;
        color: var(--ink);
        text-wrap: balance;
      }

      .lead {
        margin: 10px 0 0;
        max-width: 30ch;
        font-size: clamp(0.9375rem, 0.9rem + 0.2vw, 1.0625rem);
        line-height: 1.55;
        color: var(--ink-secondary);
        text-wrap: pretty;
      }

      .actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        min-width: 0;
        gap: 12px;
        margin-top: clamp(22px, 3.5vh, 30px);
      }

      #offline-retry {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: max(48px, 3rem);
        min-width: min(100%, 11.5rem);
        max-width: 100%;
        padding: 0.75rem 1.5rem;
        border: 2px solid transparent;
        border-radius: 12px;
        background-color: var(--primary);
        color: #ffffff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 6px 16px -4px rgba(29, 78, 216, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.18);
        font-size: 0.96875rem;
        font-weight: 600;
        letter-spacing: -0.005em;
        line-height: 1.3;
        text-align: center;
        text-decoration: none;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        transition: background-color 140ms ease, transform 120ms var(--ease-out), box-shadow 140ms ease;
      }

      #offline-retry svg {
        flex-shrink: 0;
      }

      #offline-retry .retry-spinner {
        display: none;
      }

      @media (hover: hover) and (pointer: fine) {
        #offline-retry:not([aria-disabled="true"]):hover {
          background-color: var(--primary-hover);
        }
      }

      #offline-retry:not([aria-disabled="true"]):active {
        background-color: var(--primary-active);
        transform: scale(0.98);
      }

      #offline-retry:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 3px;
      }

      #offline-retry[aria-disabled="true"] {
        cursor: wait;
        background-color: var(--primary-hover);
      }

      #offline-retry[aria-busy="true"] .retry-icon {
        display: none;
      }

      #offline-retry[aria-busy="true"] .retry-spinner {
        display: block;
        animation: rl-spin 720ms linear infinite;
      }

      @keyframes rl-spin {
        to { transform: rotate(360deg); }
      }

      .shortcut-hint {
        display: none;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--ink-tertiary);
        user-select: none;
        -webkit-user-select: none;
      }

      .shortcut-hint kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 21px;
        height: 21px;
        padding-inline: 6px;
        border: 1px solid var(--border);
        border-bottom-width: 2px;
        border-radius: 5px;
        background-color: var(--surface);
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ink);
      }

      @media (hover: hover) and (pointer: fine) and (min-width: 40rem) {
        .shortcut-hint {
          display: inline-flex;
        }
      }

      #offline-status {
        margin: 0;
        max-width: 100%;
        font-size: 0.875rem;
        line-height: 1.45;
        color: var(--ink-secondary);
      }

      #offline-status:not(:empty) {
        margin-top: 16px;
        padding: 9px 14px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background-color: var(--surface);
        font-weight: 500;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }

      #offline-status[data-tone="checking"]:not(:empty) {
        border-color: #bfdbfe;
        background-color: #eff6ff;
        color: #1e40af;
      }

      #offline-status[data-tone="warning"]:not(:empty) {
        border-color: #fde68a;
        background-color: #fffbeb;
        color: #92400e;
      }

      #offline-status[data-tone="success"]:not(:empty) {
        border-color: #a7f3d0;
        background-color: #ecfdf5;
        color: #065f46;
      }

      @media (max-width: 32rem) {
        #offline-retry {
          width: 100%;
          max-width: 20rem;
        }

        #offline-status:not(:empty) {
          border-radius: 12px;
        }
      }

      @media (max-height: 30rem) {
        main {
          padding-block: 12px;
        }

        .emblem-ring {
          padding: 6px;
          border-radius: 18px;
        }

        .emblem {
          width: 44px;
          height: 44px;
          border-radius: 12px;
        }

        h1 {
          margin-top: 12px;
          font-size: 1.5rem;
        }

        .lead {
          margin-top: 6px;
        }

        .actions {
          margin-top: 16px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }

        #offline-retry:not([aria-disabled="true"]):active {
          transform: none;
        }
      }

      @media (forced-colors: active) {
        html, body {
          background: Canvas;
          color: CanvasText;
        }

        .emblem-ring,
        .emblem,
        .signal-pill,
        .shortcut-hint kbd,
        #offline-status:not(:empty) {
          background: Canvas;
          color: CanvasText;
          border-color: CanvasText;
          box-shadow: none;
        }

        .lead,
        .shortcut-hint {
          color: CanvasText;
        }

        .brand-mark .bar,
        .signal-dot,
        .emblem-dot {
          background: CanvasText;
          forced-color-adjust: none;
        }

        #offline-retry {
          border-color: ButtonText;
          background: ButtonFace;
          color: ButtonText;
          box-shadow: none;
        }

        #offline-retry:focus-visible {
          outline-color: Highlight;
        }
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <span class="bar bar-1"></span>
          <span class="bar bar-2"></span>
          <span class="bar bar-3"></span>
        </span>
        <span class="brand-name">RoomLine</span>
      </div>
      <div class="signal-pill">
        <span class="signal-dot" aria-hidden="true"></span>
        <span data-signal-label>Offline</span>
      </div>
    </header>
    <main aria-labelledby="offline-title">
      <div class="emblem-ring" aria-hidden="true">
        <div class="emblem">
          <svg class="icon-offline" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h.01"/>
            <path d="M8.5 16.429a5 5 0 0 1 7 0"/>
            <path d="M5 12.859a10 10 0 0 1 5.17-2.69"/>
            <path d="M19 12.859a10 10 0 0 0-2.007-1.523"/>
            <path d="M2 8.82a15 15 0 0 1 4.177-2.643"/>
            <path d="M22 8.82a15 15 0 0 0-11.288-3.764"/>
            <path d="m2 2 20 20"/>
          </svg>
          <svg class="icon-online" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h.01"/>
            <path d="M2 8.82a15 15 0 0 1 20 0"/>
            <path d="M5 12.859a10 10 0 0 1 14 0"/>
            <path d="M8.5 16.429a5 5 0 0 1 7 0"/>
          </svg>
          <span class="emblem-dot"></span>
        </div>
      </div>
      <h1 id="offline-title">You’re offline</h1>
      <p class="lead">Check your connection to get back to your workspace.</p>
      <div class="actions">
        <a id="offline-retry" href="/dashboard">
          <svg class="retry-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          <svg class="retry-spinner" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span>Try again</span>
        </a>
        <span class="shortcut-hint" aria-hidden="true">Press <kbd>R</kbd> to retry</span>
      </div>
      <p id="offline-status" role="status" aria-live="polite" aria-atomic="true"></p>
    </main>
    <script>
      (function () {
        var retry = document.getElementById("offline-retry");
        var status = document.getElementById("offline-status");
        var root = document.documentElement;
        var badgeLabel = typeof document.querySelector === "function"
          ? document.querySelector("[data-signal-label]")
          : null;
        var checking = false;
        var autoTimer;

        function disableLocalServiceWorker() {
          if (!window.navigator || !window.navigator.serviceWorker || !/^(?:localhost|127\\.0\\.0\\.1|\\[::1\\])$/i.test(window.location.hostname)) {
            return Promise.resolve();
          }
          return window.navigator.serviceWorker.getRegistrations().then(function (registrations) {
            return Promise.all(registrations
              .filter(function (registration) {
                return registration.active && registration.active.scriptURL.endsWith("/sw.js");
              })
              .map(function (registration) { return registration.unregister(); }));
          }).catch(function () {});
        }

        function retryTarget() {
          var current = new URL(window.location.href);
          return current.pathname === "/offline" || current.pathname === "/offline/"
            ? new URL("/dashboard", current.origin)
            : current;
        }

        function setSignalState(state, tone) {
          if (root && typeof root.setAttribute === "function") {
            root.setAttribute("data-connection", state);
          }
          if (status && typeof status.setAttribute === "function") {
            if (tone) status.setAttribute("data-tone", tone);
            else status.removeAttribute("data-tone");
          }
          if (badgeLabel) {
            badgeLabel.textContent =
              state === "online"
                ? "Connected"
                : state === "checking"
                  ? "Checking…"
                  : state === "detected"
                    ? "Signal detected"
                    : "Offline";
          }
        }

        function clearAutoTimer() {
          if (autoTimer !== undefined) {
            window.clearTimeout(autoTimer);
            autoTimer = undefined;
          }
        }

        retry.href = retryTarget().href;
        var localServiceWorkerCleanup = disableLocalServiceWorker();

        if (!window.fetch || !window.AbortController) return;

        async function checkConnection() {
          if (checking) return;
          clearAutoTimer();

          checking = true;
          retry.setAttribute("aria-disabled", "true");
          retry.setAttribute("aria-busy", "true");
          setSignalState("checking", "checking");
          status.textContent = "Checking the connection…";

          var target = retryTarget();
          retry.href = target.href;
          var controller = new AbortController();
          var timeout;

          try {
            await localServiceWorkerCleanup;
            var response = await Promise.race([
              fetch(target.href, {
                method: "HEAD",
                cache: "no-store",
                credentials: "same-origin",
                mode: "same-origin",
                signal: controller.signal
              }),
              new Promise(function (_, reject) {
                timeout = window.setTimeout(function () {
                  reject(new Error("Connection check timed out"));
                  controller.abort();
                }, 8000);
              })
            ]);

            if (!response.ok || response.headers.get("x-roomline-offline") === "1") {
              setSignalState("offline", "warning");
              status.textContent = "RoomLine is still unavailable. Please try again.";
              return;
            }

            setSignalState("online", "success");
            status.textContent = "Connection available. Opening RoomLine…";
            window.location.assign(target.href);
          } catch (_) {
            setSignalState("offline", "warning");
            status.textContent = "Still unable to connect. Check your connection and try again.";
          } finally {
            window.clearTimeout(timeout);
            checking = false;
            retry.removeAttribute("aria-disabled");
            retry.removeAttribute("aria-busy");
          }
        }

        retry.addEventListener("click", function (event) {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          return checkConnection();
        });

        if (typeof window.addEventListener === "function") {
          window.addEventListener("online", function () {
            if (checking) return;
            clearAutoTimer();
            setSignalState("detected");
            autoTimer = window.setTimeout(function () {
              autoTimer = undefined;
              return checkConnection();
            }, 1500);
          });

          window.addEventListener("offline", function () {
            clearAutoTimer();
            if (!checking) {
              setSignalState("offline");
            }
          });

          window.addEventListener("keydown", function (event) {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key !== "r" && event.key !== "R") return;
            var active = document.activeElement;
            if (active && /^(?:INPUT|TEXTAREA|SELECT)$/i.test(active.tagName || "")) return;
            event.preventDefault();
            return checkConnection();
          });
        }

        if (typeof document.addEventListener === "function") {
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible" && window.navigator && window.navigator.onLine && !checking) {
              clearAutoTimer();
              autoTimer = window.setTimeout(function () {
                autoTimer = undefined;
                return checkConnection();
              }, 600);
            }
          });
        }
      })();
    </script>
  </body>
</html>`;
