// Keep this document self-contained: it must render without the application shell.
export const offlineDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="light">
    <meta name="robots" content="noindex">
    <link rel="icon" href="data:,">
    <title>Connection unavailable · RoomLine</title>
    <style>
      *, *::before, *::after {
        box-sizing: border-box;
      }

      html {
        color-scheme: only light;
        background: #f7f8fa;
        -webkit-text-size-adjust: 100%;
      }

      body {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        min-height: 100dvh;
        margin: 0;
        --edge: clamp(1rem, 5vw, 1.5rem);
        padding: var(--edge);
        padding-top: max(var(--edge), env(safe-area-inset-top));
        padding-right: max(var(--edge), env(safe-area-inset-right));
        padding-bottom: max(var(--edge), env(safe-area-inset-bottom));
        padding-left: max(var(--edge), env(safe-area-inset-left));
        background: #f7f8fa;
        color: #17202a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 1.0625rem;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }

      header {
        width: 100%;
        max-width: 64rem;
        margin-inline: auto;
        font-size: 1rem;
        font-weight: 650;
        letter-spacing: -0.025em;
      }

      main {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: center;
        width: 100%;
        max-width: 26rem;
        min-width: 0;
        margin-inline: auto;
        padding-block: 3rem;
      }

      h1 {
        margin: 0;
        font-size: 2.25rem;
        font-weight: 650;
        letter-spacing: -0.035em;
        line-height: 1.2;
      }

      p {
        margin: 1rem 0 0;
        color: #5c6773;
      }

      #offline-retry {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        align-self: flex-start;
        min-height: 3rem;
        max-width: 100%;
        margin-top: 1.75rem;
        padding: 0.75rem 1rem;
        border: 2px solid transparent;
        border-radius: 0.625rem;
        background: #2d4bd4;
        color: #fff;
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.4;
        text-align: center;
        text-decoration: none;
        transition: background-color 120ms ease;
      }

      #offline-retry:hover {
        background: #243fb8;
      }

      #offline-retry:active {
        background: #1d3295;
      }

      #offline-retry:focus-visible {
        outline: 3px solid #17202a;
        outline-offset: 4px;
      }

      #offline-retry[aria-disabled="true"] {
        cursor: wait;
      }

      #offline-status {
        min-height: 3.2em;
        margin-top: 1rem;
      }

      @media (max-width: 30rem) {
        h1 { font-size: 2rem; }
        #offline-retry { align-self: stretch; }
      }

      @media (max-height: 30rem) {
        main { padding-block: 2rem 1rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        #offline-retry { transition: none; }
      }

      @media (forced-colors: active) {
        html, body { background: Canvas; color: CanvasText; }
        p { color: CanvasText; }
        #offline-retry {
          border-color: ButtonText;
          background: ButtonFace;
          color: ButtonText;
        }
        #offline-retry:focus-visible { outline-color: Highlight; }
      }
    </style>
  </head>
  <body>
    <header>RoomLine</header>
    <main aria-labelledby="offline-title">
      <h1 id="offline-title">You’re offline</h1>
      <p>Check your connection to get back to your bookings and calendar.</p>
      <a id="offline-retry" href="/dashboard">Try again</a>
      <p id="offline-status" role="status" aria-live="polite" aria-atomic="true"></p>
    </main>
    <script>
      (function () {
        var retry = document.getElementById("offline-retry");
        var status = document.getElementById("offline-status");
        var checking = false;

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

        retry.href = retryTarget().href;
        var localServiceWorkerCleanup = disableLocalServiceWorker();

        if (!window.fetch || !window.AbortController) return;

        retry.addEventListener("click", async function (event) {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          if (checking) return;

          checking = true;
          retry.setAttribute("aria-disabled", "true");
          retry.setAttribute("aria-busy", "true");
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
              status.textContent = "RoomLine is still unavailable. Please try again.";
              return;
            }

            status.textContent = "Connection available. Opening RoomLine…";
            window.location.assign(target.href);
          } catch (_) {
            status.textContent = "Still unable to connect. Check your connection and try again.";
          } finally {
            window.clearTimeout(timeout);
            checking = false;
            retry.removeAttribute("aria-disabled");
            retry.removeAttribute("aria-busy");
          }
        });
      })();
    </script>
  </body>
</html>`;
