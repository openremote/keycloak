/*
 * A custom project's own theme, served to the dev server so its stylesheets can be worked on
 * without a Keycloak container.
 *
 * OR_CHILD_THEME points at the theme's login directory, the one holding theme.properties:
 *
 *   OR_CHILD_THEME=~/acme/deployment/keycloak/themes/acme/login yarn start
 *
 *   GET /__child-theme          the stylesheets to load, or none when nothing is configured
 *   GET /__child-theme/<path>   a file from that theme's resources
 *
 * `orStyles` is read from theme.properties and resolved against resources/, which is what
 * Keycloak does with it, so the preview goes through the same two values production does rather
 * than a parallel arrangement of its own.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { themeProperties } from "./stock.mjs";

const TYPES = {
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export function childTheme({ themeDir }) {
  const resourcesDir = themeDir === null ? null : path.join(themeDir, "resources");

  /* Read per request, so editing theme.properties needs a reload rather than a restart. */
  const styles = () => {
    if (themeDir === null) {
      return [];
    }

    const declared = themeProperties(path.join(themeDir, "theme.properties")).orStyles ?? "";

    return declared
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(style => (/^(?:https?:)?\/\//.test(style) ? style : `/__child-theme/${style}`));
  };

  return {
    resourcesDir,

    install(app) {
      app.get("/__child-theme", (_request, response) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ themeDir, styles: styles() }));
      });

      app.get(/^\/__child-theme\/(.+)$/, async (request, response) => {
        const relative = decodeURIComponent(request.params[0]);
        const file =
          resourcesDir === null || relative.includes("..") ? null : path.join(resourcesDir, relative);

        if (file === null) {
          response.statusCode = 404;
          response.end();
          return;
        }

        try {
          const body = await readFile(file);
          response.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
          // Edited between reloads, so never from the browser's cache.
          response.setHeader("cache-control", "no-store");
          response.end(body);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    }
  };
}
