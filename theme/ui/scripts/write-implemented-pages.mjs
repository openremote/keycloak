/*
 * Writes the login pages this theme implements, each to the message keys it names, for the
 * packaging step to act on.
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
 *
 * The keys are for Keycloak to resolve. Keycloakify's generated template already hands the page
 * every message Keycloak resolved for a key-shaped string in kcContext, in
 * `x-keycloakify.messages`, which the page's i18n checks before Keycloakify's bundled copy. The
 * keys a page names itself are not in kcContext, so they would come from that copy, which lags
 * Keycloak's wording and has fewer languages. theme/build.gradle adds a lookup for each to the
 * page's template, and Keycloak resolves them like the rest: in the user's language, with the
 * realm's own overrides. Per page rather than every key on every page, because each one is
 * written into the page itself.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pageMessageKeys } from "./message-keys.mjs";

/* Where theme/build.gradle reads it, rather than below the working directory. */
const OUTPUT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "build_keycloak", "implemented-pages.json");

/*
 * Keycloakify also writes these aliases, under the names Keycloak used before the user
 * profile became mandatory. Keep one only when its real page is implemented.
 */
const ALIASES = {
  "register.ftl": "register-user-profile.ftl",
  "login-update-profile.ftl": "update-user-profile.ftl"
};

/* What the template's lookup accepts; it skips anything else without a word. */
const RESOLVABLE = /^[a-zA-Z0-9-_.]+$/;

const pages = {};

for (const [pageId, keys] of pageMessageKeys()) {
  const unresolvable = keys.filter(key => !RESOLVABLE.test(key));

  if (unresolvable.length > 0) {
    throw new Error(
      `${pageId} names ${unresolvable.map(key => `"${key}"`).join(", ")}, which Keycloakify's template cannot ` +
        "look up: a key there is letters, digits, `-`, `_` and `.` only."
    );
  }

  pages[pageId] = keys;

  if (ALIASES[pageId] !== undefined) {
    pages[ALIASES[pageId]] = keys;
  }
}

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, `${JSON.stringify(pages, null, 2)}\n`, "utf8");

const counts = Object.entries(pages).map(([template, keys]) => `${template} (${keys.length} keys)`);
console.log(`Implemented pages (${counts.length}): ${counts.join(", ")}`);
