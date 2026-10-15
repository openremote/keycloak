/*
 * The login pages this theme implements.
 *
 * Read here rather than in each script, because two of them have to agree on it: the packaging step
 * keeps the generated template for every page in this list, and the Keycloak check asks whether
 * Keycloak still has one. A declaration that changed shape with only one of them updated would drop
 * a page from the jar while the check went on reporting it as implemented.
 *
 * src/page-registry.ts reads the same declaration at runtime, through the bundler rather than from
 * disk, for the reason this is derived at all: adding a file to src/pages should be the only step
 * needed to implement a page.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* Beside this file rather than below the working directory, so either script can run from anywhere. */
const PAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "pages");

/* `export const pageId = "login.ftl";` */
const DECLARATION = /export const pageId\s*=\s*"([^"]+)"/;

/** Every page id declared in src/pages, sorted. */
export function implementedPages() {
  const pages = new Set();

  for (const basename of readdirSync(PAGES_DIR)) {
    if (!basename.endsWith(".ts")) {
      continue;
    }

    const match = DECLARATION.exec(readFileSync(join(PAGES_DIR, basename), "utf8"));

    if (match !== null) {
      pages.add(match[1]);
    }
  }

  if (pages.size === 0) {
    throw new Error(`No page implementations found in ${PAGES_DIR}.`);
  }

  return [...pages].sort();
}
