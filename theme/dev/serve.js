#!/usr/bin/env node
/*
 * Zero-dependency dev server with live reload for the login theme preview.
 *
 *   node theme/dev/serve.js          # http://localhost:8000/dev/preview.html
 *   PORT=9000 node theme/dev/serve.js
 *
 * Why a server at all, rather than opening preview.html directly: Vaadin applies its Lumo
 * styles by reading document.styleSheets[].cssRules, which throws on file:// because every
 * file is its own opaque origin. The page still renders, but every component silently falls
 * back to Vaadin's unstyled base look - which reads as a CSS bug rather than a loading one.
 *
 * Edits to any .ftl, .css, .js or .html under the theme trigger a browser reload.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOGIN = path.join(ROOT, "src/main/resources/theme/openremote/login");
const PORT = Number(process.env.PORT) || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

const RELOAD_SNIPPET = `
<script>
  (function () {
    var es = new EventSource("/__reload");
    es.onmessage = function () { location.reload(); };
    es.onerror = function () { /* server restarting; EventSource retries on its own */ };
  })();
</script>`;

const clients = new Set();

function notify(file) {
  process.stdout.write(`  changed: ${path.relative(ROOT, file)} -> reload\n`);
  for (const res of clients) {
    res.write("data: reload\n\n");
  }
}

let pending = null;
function scheduleNotify(file) {
  clearTimeout(pending);
  pending = setTimeout(() => notify(file), 60);
}

for (const dir of [path.join(ROOT, "dev"), LOGIN]) {
  try {
    fs.watch(dir, { recursive: true }, (_event, name) => {
      if (name && /\.(ftl|css|js|html|svg|properties)$/.test(name)) {
        scheduleNotify(path.join(dir, name));
      }
    });
  } catch (err) {
    console.warn(`warning: cannot watch ${dir} (${err.code}); live reload disabled there`);
  }
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);

    if (urlPath === "/__reload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 500\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    // ?noreload skips the live-reload injection. The SSE connection never closes, which
    // stops headless screenshot tooling from ever deciding the page is idle.
    const noReload = /[?&]noreload\b/.test(req.url);
    const target = urlPath === "/" ? "/dev/preview.html" : urlPath;
    const file = path.join(ROOT, target);

    // Keep the server inside the theme directory.
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end(`not found: ${target}\n`);
        return;
      }
      const ext = path.extname(file);
      const body = ext === ".html" && !noReload ? data + RELOAD_SNIPPET : data;
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    });
  })
  .listen(PORT, () => {
    const vendor = path.join(LOGIN, "resources/vendor/or-vaadin.js");
    if (!fs.existsSync(vendor)) {
      console.warn(
        "\nwarning: resources/vendor is empty - components will not render.\n" +
          "  run: theme/dev/build-design-system.sh ../openremote\n"
      );
    }
    console.log(`\n  theme preview:  http://localhost:${PORT}/dev/preview.html`);
    console.log(`  watching:       ${path.relative(process.cwd(), LOGIN)}\n`);
  });
