/*
 * Writes the list of login pages this theme implements, for the packaging step to act on.
 *
 * Keycloakify emits a .ftl for every login page Keycloak has and routes them all into
 * src/main.ts, which would mean owning all 39. We implement the handful in src/pages; for
 * the rest (webauthn, OAuth device grant, recovery codes, organizations, SAML post binding
 * and so on), theme/build.gradle drops the generated template while packaging, so Keycloak
 * resolves those pages through the built theme's `parent=` and serves them from its own
 * theme: complete, translated, and not ours to maintain.
 *
 * The list is derived from src/pages rather than written out by hand, for the same reason
 * src/page-registry.ts scans that directory: adding a file there should be the only step
 * needed to implement a page. scripts/implemented-pages.mjs does the reading, because the
 * Keycloak check has to answer from the same list.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { implementedPages } from "./implemented-pages.mjs";

/* Where theme/build.gradle reads it, rather than below the working directory. */
const OUTPUT_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "build_keycloak",
  "implemented-pages.txt"
);

/*
 * Keycloakify also writes these aliases, under the names Keycloak used before the user
 * profile became mandatory. Keep one only when its real page is implemented.
 */
const ALIASES = {
  "register.ftl": "register-user-profile.ftl",
  "login-update-profile.ftl": "update-user-profile.ftl"
};

const pageIds = new Set();

for (const pageId of implementedPages()) {
  pageIds.add(pageId);

  const alias = ALIASES[pageId];

  if (alias !== undefined) {
    pageIds.add(alias);
  }
}

const sorted = [...pageIds].sort();

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, `${sorted.join("\n")}\n`, "utf8");

console.log(`Implemented pages (${sorted.length}): ${sorted.join(", ")}`);
