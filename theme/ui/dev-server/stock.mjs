/*
 * Dev-only: stock Keycloak pages, rendered by the dev server rather than by a running Keycloak.
 *
 * `./gradlew installDist` downloads Keycloak's own themes and the FreeMarker version Keycloak uses
 * into ui/.keycloak (gitignored). This module starts StockRenderer.java once, with the JDK's
 * single-file launcher, and exposes it to the dev harness:
 *
 *   GET  /__stock/status                  what is installed, or why nothing is
 *   POST /__stock/render                  {theme, pageId, locale, model, variants?} -> {url, changed}
 *   GET  /__stock/page/<id>               a rendered page
 *   GET  /__stock/resources/<theme>/...   that theme's resources, looked up through its parents
 *   GET  /__stock/resources/common/...    the resources every theme imports
 *
 * The model is the same shaped kcContext the harness renders our own page from, so the realm
 * settings in the rail apply to both. Wired into rspack.config.mjs's devServer only; a production
 * build never loads it.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

/*
 * The theme a fresh Keycloak realm uses for its login pages, and so the one to compare against. Not
 * derivable from the jar: it is a server default (Keycloak 26's login v2 feature), which is also what
 * the live-Keycloak pane shows.
 */
const COMPARE_THEME = "keycloak.v2";

const TYPES = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject"
};

/** `parent=` and `import=` from a theme.properties, or nothing if the file is not there. */
function themeProperties(file) {
  if (!existsSync(file)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map(line => /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line))
      .filter(match => match !== null)
      .map(match => [match[1], match[2]])
  );
}

/*
 * Injected into every rendered page. Its links and forms carry the same #dev-flow: markers as our
 * own page - they come from the same mock - but they would go nowhere inside a frame: a form posts
 * to a URL the dev server does not serve. So both are handed to the harness, which resolves them
 * through src/dev/flows.ts exactly as it does for ours and moves the whole preview on.
 */
const BRIDGE = `<script>
(() => {
  const marker = "#dev-flow:";
  const send = (target, submitter) => parent.postMessage({ devFlow: target, submitter }, location.origin);
  document.addEventListener("click", event => {
    const link = event.target.closest && event.target.closest("a[href]");
    const href = link && link.getAttribute("href");
    if (href && href.startsWith(marker)) { event.preventDefault(); send(href, { text: link.textContent.trim() }); }
  }, true);
  document.addEventListener("submit", event => {
    const action = event.target.getAttribute("action") || "";
    if (!action.startsWith(marker)) return;
    event.preventDefault();
    const button = event.submitter;
    send(action, { name: button ? button.name || "" : "", value: button ? button.value || "" : "", text: button ? (button.textContent || button.value || "").trim() : "" });
  }, true);
})();
</script>`;

/**
 * Puts the bridge at the end of the document.
 *
 * The closing tag is found from the end, not the start: `login-recovery-authn-code-config` builds a
 * printable document inside a JavaScript string, so the first `</body>` in the page is a literal
 * three quarters of the way through a `<script>`. Injecting there cut that script in half and
 * spilled the rest of it onto the page as text. Appending is the fallback, because a template
 * Keycloak renders without a `</body>` should still get the bridge rather than silently lose it.
 */
function withBridge(html) {
  const close = html.toLowerCase().lastIndexOf("</body>");
  return close === -1 ? html + BRIDGE : html.slice(0, close) + BRIDGE + html.slice(close);
}

export function stockKeycloak({ uiDir }) {
  const root = path.join(uiDir, ".keycloak");
  const themesDir = path.join(root, "theme");
  const manifestFile = path.join(root, "stock.json");
  const rendererSource = path.join(uiDir, "dev-server", "StockRenderer.java");

  /*
   * The theme Keycloak serves the pages we do not implement from. Read out of the descriptor the
   * build actually ships rather than named here, so what this previews is what production serves.
   * `./gradlew installDist` - which the stock pages need anyway, for the templates - builds that
   * file, so the default only applies before the first build. It mirrors theme/build.gradle.
   */
  const fallbackTheme = () =>
    themeProperties(path.join(uiDir, "..", "build", "login-theme", "theme", "openremote", "login", "theme.properties"))
      .parent ?? "keycloak.v2";

  const status = () => {
    if (!existsSync(manifestFile)) {
      return {
        available: false,
        reason: "Keycloak's themes are not downloaded yet. Run `./gradlew installDist` from the repository root."
      };
    }

    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    return { available: true, ...manifest, compareTheme: COMPARE_THEME, fallbackTheme: fallbackTheme() };
  };

  /* ------------------------------------------------------------------ renderer process */

  let child = null;
  let nextId = 1;
  const pending = new Map();

  const renderer = () => {
    if (child !== null) {
      return child;
    }

    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java") : "java";

    // `lib/*` is expanded by the JVM, not by a shell, so which jars Gradle put there stays its business.
    const proc = spawn(java, ["-cp", path.join(root, "lib", "*"), rendererSource, themesDir], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    child = proc;

    let stderr = "";
    proc.stderr.on("data", chunk => {
      stderr = (stderr + chunk).slice(-4000);
    });

    /*
     * One way out for every failure. Node emits `error` when java cannot be started and may then
     * never emit `exit`, so a request waiting on either alone could hang for good. Scoped to this
     * process, so a late event from one that already failed cannot take down its replacement.
     */
    let failed = false;
    const fail = reason => {
      if (failed) {
        return;
      }
      failed = true;
      for (const { reject } of pending.values()) {
        reject(new Error(reason));
      }
      pending.clear();
      if (child === proc) {
        child = null;
      }
    };

    proc.on("error", error => {
      fail(
        error.code === "ENOENT"
          ? "No `java` on the PATH (or under JAVA_HOME). A JDK 17 or newer is needed to render Keycloak's templates - the same one Gradle uses."
          : error.message
      );
    });

    proc.on("exit", code => {
      fail(`The renderer exited (code ${code}). ${stderr.trim().split("\n").slice(-3).join(" ")}`);
    });

    // A write racing the process's death would otherwise throw EPIPE out of the request handler.
    proc.stdin.on("error", () => {});

    createInterface({ input: proc.stdout }).on("line", line => {
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        return;
      }
      const request = pending.get(response.id);
      if (request === undefined) {
        return;
      }
      pending.delete(response.id);
      if (response.error !== undefined) {
        request.reject(Object.assign(new Error(response.error), { template: true }));
      } else {
        request.resolve(response.html);
      }
    });

    return proc;
  };

  const renderHtml = (theme, pageId, locale, model) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      renderer().stdin.write(`${JSON.stringify({ id, theme, template: pageId, locale, model })}\n`);
    });

  /* ------------------------------------------------------------------ requests */

  /** Rendered pages by content hash, so an unchanged state keeps its URL and the frame does not reload. */
  const pages = new Map();
  const PAGE_CACHE = 60;

  const withResourcePaths = (model, theme) => ({
    ...model,
    url: {
      ...(model.url ?? {}),
      resourcesPath: `/__stock/resources/${theme}/login/resources`,
      resourcesCommonPath: "/__stock/resources/common"
    }
  });

  const readBody = request =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      request.on("data", chunk => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) {
          reject(new Error("Request too large"));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      request.on("error", reject);
    });

  const sendJson = (response, code, body) => {
    response.statusCode = code;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(body));
  };

  const handleRender = async (request, response) => {
    const current = status();

    if (!current.available) {
      sendJson(response, 503, { error: current.reason });
      return;
    }

    const { theme: which, pageId, locale = "en", model, variants = [] } = JSON.parse(await readBody(request));
    const theme = which === "fallback" ? current.fallbackTheme : current.compareTheme;

    try {
      const html = await renderHtml(theme, pageId, locale, withResourcePaths(model, theme));
      const id = createHash("sha1").update(`${theme}\n${pageId}\n${locale}\n${html}`).digest("hex").slice(0, 16);

      pages.delete(id);
      pages.set(id, withBridge(html));
      while (pages.size > PAGE_CACHE) {
        pages.delete(pages.keys().next().value);
      }

      /*
       * Which of the offered settings would change this page - the stock counterpart of the rail's
       * relevance filter, which can only compare our own markup in the browser. A variant that
       * fails to render counts as changed, so a setting is never hidden on the strength of an error.
       */
      const changed = [];
      for (const variant of variants) {
        try {
          if ((await renderHtml(theme, pageId, locale, withResourcePaths(variant.model, theme))) !== html) {
            changed.push(variant.id);
          }
        } catch {
          changed.push(variant.id);
        }
      }

      sendJson(response, 200, {
        url: `/__stock/page/${id}`,
        theme,
        keycloakVersion: current.keycloakVersion,
        changed
      });
    } catch (error) {
      sendJson(response, error.template ? 422 : 503, { error: error.message, theme });
    }
  };

  /** A theme's resource, looked up through `parent=` the way Keycloak does, or a common one. */
  const resourceFile = relative => {
    const [first, ...rest] = relative.split("/");

    if (first === "common") {
      // Both stock themes declare import=common/keycloak.
      return path.join(themesDir, "keycloak", "common", "resources", ...rest);
    }

    // <theme>/login/resources/<path>
    const inside = rest.slice(2);
    for (let theme = first; theme; theme = themeProperties(path.join(themesDir, theme, "login", "theme.properties")).parent) {
      const candidate = path.join(themesDir, theme, "login", "resources", ...inside);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  return {
    install(app) {
      app.get("/__stock/status", (_request, response) => sendJson(response, 200, status()));

      app.post("/__stock/render", (request, response) => {
        handleRender(request, response).catch(error => sendJson(response, 500, { error: error.message }));
      });

      app.get("/__stock/page/:id", (request, response) => {
        const html = pages.get(request.params.id);
        if (html === undefined) {
          response.statusCode = 404;
          response.end("Expired - switch pages to render it again.");
          return;
        }
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(html);
      });

      app.get(/^\/__stock\/resources\/(.+)$/, async (request, response) => {
        const relative = decodeURIComponent(request.params[0]);
        const file = relative.includes("..") ? null : resourceFile(relative);

        if (file === null) {
          response.statusCode = 404;
          response.end();
          return;
        }

        try {
          const body = await readFile(file);
          response.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
          response.end(body);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    }
  };
}
