/*
 * Checks this theme against the Keycloak it is written for.
 *
 * The theme owns a handful of pages and leaves the rest to Keycloak, so most of what it depends
 * on lives upstream rather than here: the message key behind every control, which pages exist at
 * all, what Keycloak's own version of a page we replaced now looks like. None of that is checked
 * by the build. An upgrade can rename a key or add a control, and everything still compiles.
 *
 * Two kinds of check, because they answer different questions.
 *
 * What is wrong is checked against the Keycloak the Dockerfile pins, and fails: a page we
 * implement that Keycloak no longer has, a message key we name that it no longer defines, a
 * stand-in in i18n.ts that Keycloakify has caught up with. Each is true or false on its own, so
 * there is nothing to record and nothing to keep up to date.
 *
 * What merely moved is reported, and only when this branch changes the pinned version: which of
 * the templates behind our pages differ between the version main pins and the one here. Nothing
 * here can decide whether such a change matters, so it goes in front of whoever is doing the
 * upgrade rather than blocking them.
 *
 * There is no baseline file because there is nothing to put in one. A Keycloak version's
 * templates never change, so the published jar for each version is the record, and the
 * Dockerfile and git history say which versions those are.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(UI_DIR, "..", "..");
const CACHE_DIR = join(UI_DIR, ".keycloak-cache");


/* keycloak.v2 is what unimplemented pages fall through to; base is what both are built on. */
const THEMES = ["base", "keycloak.v2"];

/* Rendered by every page, so a change here reaches ours whether or not their own file moved. */
const SHARED_TEMPLATES = ["template.ftl", "user-profile-commons.ftl"];

/*
 * Keys this theme names that Keycloak has never defined. `languages` is the locale switcher's
 * accessible name, and Keycloak's own template.ftl asks for it too, so asking for it is right
 * even though only Keycloakify's bundle resolves it. Checked in both directions below, so an
 * entry that stops being true says so rather than sitting here.
 */
const UNDEFINED_UPSTREAM = new Set(["languages"]);

function pinnedVersion(dockerfile) {
  const match = /^ARG VERSION=(\S+)\s*$/m.exec(dockerfile);

  if (match === null) {
    throw new Error("No `ARG VERSION=` line in the Dockerfile");
  }

  return match[1];
}

function git(...args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * The version this branch started from, or undefined when it has not moved or git cannot say.
 *
 * Deliberately the merge base rather than the previous version in history: the question is
 * whether *this* change bumps Keycloak, not when the last bump was.
 */
function versionBranchedFrom(version) {
  for (const ref of ["origin/main", "main"]) {
    try {
      const base = git("merge-base", "HEAD", ref);
      const before = pinnedVersion(git("show", `${base}:Dockerfile`));

      return before === version ? undefined : before;
    } catch {
      // No such ref, no git, or a shallow clone without the merge base. Try the next one.
    }
  }

  return undefined;
}

/** The directory holding `theme/<name>/login/...`, downloading Keycloak's themes if needed. */
async function themesRoot(version) {
  const extracted = join(CACHE_DIR, version);

  if (existsSync(join(extracted, "theme", "base", "login"))) {
    return extracted;
  }

  const jar = join(CACHE_DIR, `keycloak-themes-${version}.jar`);

  if (!existsSync(jar)) {
    await download(version, jar);
  }

  rmSync(extracted, { recursive: true, force: true });
  mkdirSync(extracted, { recursive: true });
  unpack(jar, extracted);

  return extracted;
}

async function download(version, jar) {
  const url =
    "https://repo1.maven.org/maven2/org/keycloak/keycloak-themes/" +
    `${version}/keycloak-themes-${version}.jar`;

  console.log(`Downloading ${url}`);
  mkdirSync(CACHE_DIR, { recursive: true });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  writeFileSync(jar, Buffer.from(await response.arrayBuffer()));
}

/*
 * Either unzip or the JDK's jar, whichever the machine has: unzip is on the runners, jar comes
 * with the toolchain this repo already builds with. A zip reader of our own would be more code
 * here than either is trouble.
 */
function unpack(jar, into) {
  const tools = [
    { command: "unzip", args: ["-q", "-o", jar, "theme/*/login/*", "-d", into] },
    { command: "jar", args: ["xf", jar, "theme"], options: { cwd: into } }
  ];

  for (const tool of tools) {
    try {
      execFileSync(tool.command, tool.args, { stdio: "pipe", ...tool.options });
      return;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error("Neither `unzip` nor `jar` is on the PATH, and one of them has to be.");
}

/** The pages this theme implements, read the way scripts/write-implemented-pages.mjs reads them. */
function implementedPages() {
  const dir = join(UI_DIR, "src", "pages");
  const pages = new Set();

  for (const basename of readdirSync(dir)) {
    if (!basename.endsWith(".ts")) {
      continue;
    }

    const match = /export const pageId\s*=\s*"([^"]+)"/.exec(readFileSync(join(dir, basename), "utf8"));

    if (match !== null) {
      pages.add(match[1]);
    }
  }

  if (pages.size === 0) {
    throw new Error("No page implementations found in src/pages");
  }

  return [...pages].sort();
}

function loginDir(root, theme) {
  return join(root, "theme", theme, "login");
}

/** Every login template Keycloak ships, as `<theme>/<file>`. */
function templateNames(root) {
  const names = [];

  for (const theme of THEMES) {
    for (const basename of readdirSync(loginDir(root, theme))) {
      if (basename.endsWith(".ftl")) {
        names.push(`${theme}/${basename}`);
      }
    }
  }

  return names.sort();
}

function templateText(root, name) {
  const [theme, basename] = name.split("/");
  const path = join(loginDir(root, theme), basename);

  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** Keys Keycloak's own bundle defines. The values are its business, not ours. */
function keycloakMessageKeys(root) {
  const properties = readFileSync(join(loginDir(root, "base"), "messages", "messages_en.properties"), "latin1");

  return new Set(
    properties
      .split("\n")
      .map(line => /^([^#=\s]+)=/.exec(line))
      .filter(match => match !== null)
      .map(match => match[1])
  );
}

/** Keys this theme names outright. Anything assembled at runtime goes through advancedMsgStr. */
function requestedMessageKeys() {
  const keys = new Set();

  for (const file of sourceFiles(join(UI_DIR, "src"))) {
    for (const match of readFileSync(file, "utf8").matchAll(/\b(?:msgStr|advancedMsgStr)\("([^"$]+)"/g)) {
      keys.add(match[1]);
    }
  }

  return [...keys].sort();
}

function sourceFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    // src/dev never ships, and its strings are the harness's own.
    if (entry.isDirectory()) {
      if (entry.name !== "dev") {
        files.push(...sourceFiles(path));
      }
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

/**
 * The keys declared in i18n.ts's withCustomTranslations block.
 *
 * Read by walking braces rather than by matching indentation, so reformatting that file cannot
 * quietly turn this into an empty list.
 */
function customTranslationKeys() {
  const source = readFileSync(join(UI_DIR, "src", "i18n.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const start = source.indexOf("withCustomTranslations(");

  if (start === -1) {
    throw new Error("No withCustomTranslations call in src/i18n.ts");
  }

  const keys = [];
  let depth = 0;

  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
      continue;
    }

    if (source[i] === "}") {
      depth--;

      if (depth === 0) {
        break;
      }

      continue;
    }

    /*
     * Depth 2 is a message key: depth 1 is the argument, whose own keys are the language tags
     * the block is organized by. Reading them by depth rather than by indentation means
     * reformatting that file cannot quietly turn this into an empty list.
     */
    if (depth === 2) {
      const match = /^(\w+)\s*:/.exec(source.slice(i));

      if (match !== null && /[\s{,]/.test(source[i - 1])) {
        keys.push(match[1]);
      }
    }
  }

  return keys;
}

const version = pinnedVersion(readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8"));
const root = await themesRoot(version);

const pages = implementedPages();
const names = new Set(templateNames(root));
const keycloakKeys = keycloakMessageKeys(root);
const ourKeys = customTranslationKeys();
const keycloakifyMessages = (await import("keycloakify/login/i18n/messages_defaultSet/en.js")).default;

const problems = [];

for (const page of pages) {
  if (!THEMES.some(theme => names.has(`${theme}/${page}`))) {
    problems.push(`Keycloak ${version} has no ${page}, so our page for it has no counterpart.`);
  }
}

for (const key of requestedMessageKeys()) {
  if (!keycloakKeys.has(key) && !UNDEFINED_UPSTREAM.has(key) && !ourKeys.includes(key)) {
    problems.push(
      `Message key "${key}" is not defined by Keycloak ${version}. It still type-checks, ` +
        "because the types come from Keycloakify's copy, but nothing on the server resolves it."
    );
  }
}

for (const key of UNDEFINED_UPSTREAM) {
  if (keycloakKeys.has(key)) {
    problems.push(`Keycloak ${version} defines "${key}" now, so drop it from UNDEFINED_UPSTREAM.`);
  }
}

for (const key of ourKeys) {
  if (keycloakKeys.has(key) && Object.hasOwn(keycloakifyMessages, key)) {
    problems.push(
      `i18n.ts carries "${key}" only because Keycloakify's message set lacked it. It ships it ` +
        "now, so delete ours and let Keycloak's own translation through."
    );
  }
}

if (problems.length > 0) {
  console.error(`\nAgainst Keycloak ${version}:\n`);

  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }

  console.error('\nSee "Keeping up with Keycloak" in theme/ui/README.md.\n');
  process.exit(1);
}

console.log(`Keycloak ${version}: ${pages.length} implemented pages, every message key defined.`);

const before = versionBranchedFrom(version);

if (before === undefined) {
  process.exit(0);
}

/*
 * Everything below is the upgrade report. It cannot fail the run: whether a template that moved
 * matters to our version of that page is a judgment, and the point is to put it in front of
 * someone rather than to have a script guess.
 */
const previousRoot = await themesRoot(before);
const watched = [...pages, ...SHARED_TEMPLATES].flatMap(basename =>
  THEMES.map(theme => `${theme}/${basename}`)
).sort();

const changed = watched.filter(name => {
  const now = templateText(root, name);
  const then = templateText(previousRoot, name);

  return now !== undefined && then !== undefined && now !== then;
});

const previousNames = new Set(templateNames(previousRoot));
const added = [...names].filter(name => !previousNames.has(name)).sort();
const removed = [...previousNames].filter(name => !names.has(name)).sort();

const lines = [`## Keycloak ${before} to ${version}`, ""];

lines.push(
  changed.length === 0
    ? "No template behind a page this theme implements changed."
    : `Changed behind our pages, worth reading before merging the upgrade:\n\n${changed
        .map(name => `- \`${name}\`\n  \`diff -u .keycloak-cache/{${before},${version}}/theme/${name.replace("/", "/login/")}\``)
        .join("\n")}`
);

if (added.length > 0) {
  lines.push("", `New upstream, ours to implement or leave to Keycloak:\n\n${added.map(name => `- \`${name}\``).join("\n")}`);
}

if (removed.length > 0) {
  lines.push("", `Gone upstream:\n\n${removed.map(name => `- \`${name}\``).join("\n")}`);
}

const report = `${lines.join("\n")}\n`;

console.log(`\n${report}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
