/*
 * Writes the list of login pages this theme implements, for the packaging step to act on.
 *
 * Keycloakify emits a .ftl for all ~39 login pages and routes every one of them into
 * src/main.ts, which would mean owning all 39. We implement the handful in src/pages; for
 * the rest - webauthn, OAuth device grant, recovery codes, organizations, SAML post binding
 * and so on - theme/build.gradle drops the generated template while packaging, so Keycloak
 * resolves those pages through the generated `parent=keycloak` and serves them from its own
 * theme: complete, translated, and not ours to maintain.
 *
 * The list is derived from src/pages rather than written out by hand, for the same reason
 * src/page-registry.ts scans that directory: adding a file there should be the only step
 * needed to implement a page.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PAGES_DIR = "src/pages";
const OUTPUT_FILE = join("build_keycloak", "implemented-pages.txt");

/*
 * Keycloakify also writes these aliases, under the names Keycloak used before the user
 * profile became mandatory. Keep one only when its real page is implemented.
 */
const ALIASES = {
  "register.ftl": "register-user-profile.ftl",
  "login-update-profile.ftl": "update-user-profile.ftl"
};

const pageIds = new Set();

for (const basename of readdirSync(PAGES_DIR)) {
  if (!basename.endsWith(".ts")) {
    continue;
  }

  const source = readFileSync(join(PAGES_DIR, basename), "utf8");
  // Matches `export const pageId = "login.ftl";` - the same declaration page-registry.ts
  // reads at runtime.
  const match = /export const pageId\s*=\s*"([^"]+)"/.exec(source);

  if (match === null) {
    continue;
  }

  pageIds.add(match[1]);

  const alias = ALIASES[match[1]];

  if (alias !== undefined) {
    pageIds.add(alias);
  }
}

if (pageIds.size === 0) {
  throw new Error(`No page implementations found in ${PAGES_DIR}.`);
}

const sorted = [...pageIds].sort();

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, `${sorted.join("\n")}\n`, "utf8");

console.log(`Implemented pages (${sorted.length}): ${sorted.join(", ")}`);
