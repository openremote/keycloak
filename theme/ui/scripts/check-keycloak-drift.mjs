/*
 * Checks this theme against the Keycloak it is written for.
 *
 * The theme owns a handful of pages and leaves the rest to Keycloak, so most of what it depends on
 * lives upstream: the message key behind every control, which pages exist at all, what Keycloak's
 * own version of a page we replaced looks like. The build checks none of it, and an upgrade can
 * rename a key or relabel a control with everything here still compiling.
 *
 * Failures are facts about the version the Dockerfile pins, so there is nothing to record and
 * nothing to keep up to date: a page that is gone, a key that is undefined, a list entry that has
 * outlived itself, a control upstream relabelled. Everything else is a report, printed only when
 * this branch moves the pinned version, because whether a template that moved matters to our
 * version of that page is a judgment and nothing here can make it.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { implementedPageFiles } from "./implemented-pages.mjs";
import { keyArgument, keyLiterals, messageKeyUses } from "./message-keys.mjs";

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(UI_DIR, "..", "..");
const CACHE_DIR = join(UI_DIR, ".keycloak-cache");

/* Maven Central and npm, or the job would sit on a stalled read until CI's own limit cut it off. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/* A path as the report prints it: from the repository's root, with `/` on Windows too. */
function repoPath(path) {
  return relative(REPO_ROOT, path).replaceAll("\\", "/");
}

/* Where the lists below live, so a failure cleared by editing one says where to go. */
const SCRIPT = repoPath(fileURLToPath(import.meta.url));

/*
 * What `./gradlew installDist` unpacks for the dev server's stock pages. Reused when it is
 * there and current, so a developer who has built once does not download the same jar twice.
 * It is written by a Sync task, which deletes anything it did not put there, so the cache
 * above stays outside it.
 */
const GRADLE_THEMES_DIR = join(UI_DIR, ".keycloak");

/* The theme unimplemented pages fall through to, and base, which every theme is built on. */
const THEMES = ["base", parentTheme()];

/* Rendered by every page, so a change here reaches ours whether or not their own file moved. */
const SHARED_TEMPLATES = ["template.ftl", "user-profile-commons.ftl"];

/*
 * Keys this theme names that Keycloak has never defined. `languages` is the locale switcher's
 * accessible name, which Keycloak's own template.ftl asks for too, so naming it is right even
 * though only Keycloakify's bundle resolves it.
 */
const UNDEFINED_UPSTREAM = new Set(["languages"]);

/*
 * Keys Keycloak's version of one of our pages names that this theme deliberately does not. A control
 * upstream relabelled fails below; an entry here is how a decision not to follow it is recorded,
 * in the diff rather than in someone's memory, with the reason beside it.
 *
 * Both lists are checked in both directions, so an entry that stops being true says so.
 */
const UPSTREAM_ONLY = new Set();

/*
 * The theme a page this one does not implement is served from, which is configurable: the build
 * rewrites the generated `parent=` to it.
 *
 * The default comes from the line theme/build.gradle resolves it from, and
 * ORG_GRADLE_PROJECT_loginParentTheme overrides it as it does for Gradle. A `-PloginParentTheme` on
 * a Gradle command line, or an entry in a gradle.properties, is not seen: to check a build that uses
 * one, pass the same value in the environment.
 */
function parentTheme() {
  const build = readFileSync(join(REPO_ROOT, "theme", "build.gradle"), "utf8");
  const match = /gradleProperty\(['"]loginParentTheme['"]\)\s*\.getOrElse\(['"]([^'"]+)['"]\)/.exec(build);

  if (match === null) {
    throw new Error("No `loginParentTheme` default in theme/build.gradle");
  }

  return process.env.ORG_GRADLE_PROJECT_loginParentTheme ?? match[1];
}

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
  /* The branch a pull request targets first: one stacked on another branch did not come from main. */
  const target = process.env.GITHUB_BASE_REF;

  for (const ref of [...(target ? [`origin/${target}`] : []), "origin/main", "main"]) {
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
  const manifest = join(GRADLE_THEMES_DIR, "stock.json");

  if (existsSync(manifest)) {
    const unpacked = JSON.parse(readFileSync(manifest, "utf8"));

    // Gradle unpacks only the themes the dev server renders, which a parent theme may not be.
    if (
      unpacked.keycloakVersion === version &&
      THEMES.every(theme => existsSync(loginDir(GRADLE_THEMES_DIR, theme)))
    ) {
      return GRADLE_THEMES_DIR;
    }
  }

  const extracted = join(CACHE_DIR, version);

  if (existsSync(messagesFile(extracted))) {
    return extracted;
  }

  const jar = join(CACHE_DIR, `keycloak-themes-${version}.jar`);

  if (!existsSync(jar)) {
    await download(version, jar);
  }

  /* Unpacked beside the cache and renamed in, so an extraction cut short is never read as one. */
  const partial = `${extracted}.partial`;

  rmSync(partial, { recursive: true, force: true });
  rmSync(extracted, { recursive: true, force: true });
  mkdirSync(partial, { recursive: true });
  unpack(jar, partial);
  renameSync(partial, extracted);

  return extracted;
}

async function download(version, jar) {
  const url =
    "https://repo1.maven.org/maven2/org/keycloak/keycloak-themes/" +
    `${version}/keycloak-themes-${version}.jar`;

  console.log(`Downloading ${url}`);
  mkdirSync(CACHE_DIR, { recursive: true });

  const bytes = Buffer.from(await (await get(url)).arrayBuffer());

  /*
   * Checked against the checksum beside it, and renamed in rather than written where it is read:
   * a download cut short or mangled in transit would otherwise be cached as the jar and fail every
   * run after it, with nothing but the path to say why.
   */
  const published = /[0-9a-f]{40}/.exec(await (await get(`${url}.sha1`)).text());
  const digest = createHash("sha1").update(bytes).digest("hex");

  if (published === null || digest !== published[0]) {
    throw new Error(`${url} arrived as sha1 ${digest}, against ${published?.[0] ?? "no readable checksum"}`);
  }

  const partial = `${jar}.partial`;

  writeFileSync(partial, bytes);
  renameSync(partial, jar);
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }

  return response;
}

/*
 * Either unzip or the JDK's jar, whichever the machine has: unzip is on the runners, jar comes
 * with the toolchain this repo already builds with. A zip reader of our own would be more code
 * here than either is trouble.
 *
 * All 2 MB of it, rather than the login directories a pattern would pick out: how a pattern expands
 * across `/` differs between unzip builds, and Git for Windows' leaves the messages behind.
 */
function unpack(jar, into) {
  const tools = [
    { command: "unzip", args: ["-q", "-o", jar, "-d", into] },
    { command: "jar", args: ["xf", jar], options: { cwd: into } }
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

function loginDir(root, theme) {
  return join(root, "theme", theme, "login");
}

/** A theme's English bundle. base's is also what an extraction is judged complete by. */
function messagesFile(root, theme = "base") {
  return join(loginDir(root, theme), "messages", "messages_en.properties");
}

/*
 * Keycloak's own version of each of the given files: the parent theme's copy where it has one, base
 * otherwise, which is how Keycloak resolves a template and how withImports resolves an import. A
 * base copy the parent overrides is served to nobody, so a key only that copy names is not drift.
 */
function asServed(root, basenames) {
  const names = [];

  for (const basename of basenames) {
    for (const theme of [...THEMES].reverse()) {
      const name = `${theme}/${basename}`;

      if (templateText(root, name) !== undefined) {
        names.push(name);
        break;
      }
    }
  }

  return names;
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

/*
 * The given templates plus everything they `<#import>`, transitively, each import resolved the way
 * Keycloak resolves it: through the theme serving the page, whichever theme the importing file came
 * from, so base/error.ftl imports keycloak.v2's template.ftl. Names that do not exist are dropped,
 * and only the literal import form is read, which is the only one Keycloak's own templates use.
 *
 * The page files alone are not enough: much of what a page renders lives in a macro it imports,
 * which can change while the page file does not.
 */
function withImports(root, names) {
  const seen = new Set();
  const queue = [...names];

  while (queue.length > 0) {
    const name = queue.pop();
    const source = templateText(root, name);

    if (seen.has(name) || source === undefined) {
      continue;
    }

    seen.add(name);
    queue.push(...directImports(root, name));
  }

  return [...seen];
}

/* What one template `<#import>`s, each import resolved as withImports resolves it. */
function directImports(root, name) {
  return [...(templateText(root, name) ?? "").matchAll(/<#import\s+"([^"]+\.ftl)"/g)].flatMap(match =>
    asServed(root, [match[1].replace(/^.*\//, "")])
  );
}

/*
 * One of Keycloak's pages rather than one of its macros: pages render the layout, macros are
 * imported into them. Only pages are ours to implement or leave to Keycloak.
 */
function isPage(root, name) {
  return (templateText(root, name) ?? "").includes("registrationLayout");
}

/*
 * Keys the given templates name, in each of the forms Keycloak's own templates use them in:
 *
 *   - `msg("doSubmit")`, and `msg('showPassword')`, which field.ftl and the base pages prefer.
 *   - `msg(useGrid?then("identity-provider-login-label-divider", "orLabel"))`, where FreeMarker
 *     picks between two keys.
 *   - `<@buttons.button label="doSubmit"/>`, where the macro resolves it: `${msg(label)}`. That is
 *     how the buttons on most of the pages we implement are written.
 *
 * The literals in the key argument, read by keyLiterals as messageKeyUses reads ours, so
 * `msg(prefix + '.' + option)` in user-profile-commons.ftl names no key. A space before `label`
 * rather than a word boundary, which would take `aria-label` with it, and no `$` in a value, because
 * an interpolated one is not a key until FreeMarker has resolved it.
 */
function templateMessageKeys(root, names) {
  const keys = new Set();

  for (const name of names) {
    const source = templateText(root, name) ?? "";

    for (const call of source.matchAll(/\bmsg\(/g)) {
      const argument = keyArgument(source, call.index + call[0].length);

      for (const key of keyLiterals(argument, /(["'])(?<key>[^"'$]+)\1/g)) {
        keys.add(key);
      }
    }

    for (const match of source.matchAll(/\slabel="([^"$]+)"/g)) {
      keys.add(match[1]);
    }
  }

  return keys;
}

/*
 * Keycloak's own English messages, as key to text: base's bundle with the parent theme's over it,
 * which is how Keycloak resolves them, a theme's own messages taking precedence over those it
 * inherits. The keys are what the checks are about; the text is read only to notice that one
 * changed under a key this theme names. A value continued onto another line with a backslash is
 * read as its first line, which can hide such a change but cannot invent one.
 */
function keycloakMessages(root) {
  const messages = new Map();

  for (const theme of THEMES) {
    const file = messagesFile(root, theme);

    if (!existsSync(file)) {
      continue;
    }

    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^([^#=\s]+)=(.*)$/.exec(line);

      if (match !== null) {
        messages.set(match[1], match[2].trim());
      }
    }
  }

  return messages;
}

/*
 * One token of TypeScript, close enough to read i18n.ts by: a comment, a string, a word, or any
 * other character but whitespace. Read whole, a URL inside a message does not start a comment, and
 * a brace or a colon inside one is not structure.
 */
const TOKEN = /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<quote>["'`])(?<string>(?:\\[\s\S]|(?!\k<quote>)[^\\])*)\k<quote>|(?<word>\w+)|\S/g;

/**
 * The keys of an object in i18n.ts, found by what opens it: `KEYCLOAK_STAND_INS =` for one of the
 * message objects, whose keys are at depth 1, or `withCustomTranslations(` for the keys the call
 * declares itself, at depth 2, inside a language tag.
 *
 * Read from its tokens rather than by matching indentation, so reformatting that file cannot
 * quietly turn this into an empty list, and a comment that writes the code out is not taken for
 * it. A key is the string or word a property opens with, so the prose after it cannot name one.
 */
function objectKeys(opener, keyDepth) {
  const tokens = i18nTokens();
  const start = tokens.findIndex((_, i) => opener.every((text, j) => tokens[i + j]?.[0] === text));

  if (start === -1) {
    throw new Error(`No \`${opener.join(" ")}\` in src/i18n.ts`);
  }

  const keys = [];
  let depth = 0;

  for (let i = start + opener.length; i < tokens.length; i++) {
    const text = tokens[i][0];

    if (text === "{") {
      depth++;
    } else if (text === "}" && --depth === 0) {
      break;
    } else if (text === ":" && depth === keyDepth && ["{", ","].includes(tokens[i - 2][0])) {
      keys.push(tokens[i - 1].groups.string ?? tokens[i - 1].groups.word);
    }
  }

  return keys;
}

/**
 * The keys in i18n.ts's DECORATED_LINK_KEYS, whose leading chevron the theme takes off: the strings
 * from the name to the `]` that closes its array. Reading none is an error, so a reshaped
 * declaration cannot quietly turn this into an empty list.
 */
function decoratedLinkKeys() {
  const tokens = i18nTokens();
  const start = tokens.findIndex(
    (token, i) => token.groups.word === "DECORATED_LINK_KEYS" && tokens[i + 1]?.[0] === "="
  );
  const keys = [];

  for (let i = start + 1; start !== -1 && i < tokens.length && tokens[i][0] !== "]"; i++) {
    if (tokens[i].groups.string !== undefined) {
      keys.push(tokens[i].groups.string);
    }
  }

  if (keys.length === 0) {
    throw new Error("No DECORATED_LINK_KEYS array of keys in src/i18n.ts");
  }

  return keys;
}

/* i18n.ts as tokens, without its comments, which may write code out that is not there. */
function i18nTokens() {
  return [...readFileSync(join(UI_DIR, "src", "i18n.ts"), "utf8").matchAll(TOKEN)].filter(
    token => token.groups.comment === undefined
  );
}

/** The installed Keycloakify's version, and its KcContext types, which name every page it has. */
function installedKeycloakify() {
  const root = dirname(fileURLToPath(import.meta.resolve("keycloakify/package.json")));

  return {
    version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    types: readFileSync(join(root, "login", "KcContext", "KcContext.d.ts"), "utf8")
  };
}

/*
 * The Keycloakify releases newer than the installed one, oldest first, including those Yarn's
 * npmMinimalAgeGate still holds back, which `npm info` does not apply: one of them may have what an
 * upgrade needs. Asked of Yarn, so the registry, credentials and proxy in .yarnrc.yml apply.
 */
function newerKeycloakify(installed) {
  const yarnPath = /^yarnPath:\s*(\S+)\s*$/m.exec(readFileSync(join(UI_DIR, ".yarnrc.yml"), "utf8"))?.[1];

  if (yarnPath === undefined) {
    throw new Error("No `yarnPath` in theme/ui/.yarnrc.yml, which the report runs Yarn by.");
  }

  const yarn = (...args) =>
    JSON.parse(
      execFileSync(process.execPath, [join(UI_DIR, yarnPath), ...args, "--json"], {
        cwd: UI_DIR,
        encoding: "utf8",
        stdio: "pipe",
        timeout: DOWNLOAD_TIMEOUT_MS
      })
    );
  const { versions } = yarn("npm", "info", "keycloakify", "--fields", "versions");

  return versions
    .filter(release => /^\d+\.\d+\.\d+$/.test(release) && compareVersions(release, installed.version) > 0)
    .sort(compareVersions);
}

/* Two releases in order, by their major, minor and patch numbers. */
function compareVersions(a, b) {
  const [x, y] = [a, b].map(release => release.split(".").map(part => parseInt(part, 10)));

  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

const version = pinnedVersion(readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8"));
const root = await themesRoot(version);

for (const theme of THEMES) {
  if (!existsSync(loginDir(root, theme))) {
    throw new Error(
      `Keycloak ${version} ships no "${theme}" login theme. Check \`loginParentTheme\` in ` +
        "theme/build.gradle, or ORG_GRADLE_PROJECT_loginParentTheme in the environment."
    );
  }
}

const pageFiles = implementedPageFiles();
const pages = [...pageFiles.keys()].sort();
const names = new Set(templateNames(root));
const messages = keycloakMessages(root);
/* Each key to the files that name it, from the repository root, so the report can say where to change one. */
const uses = new Map([...messageKeyUses()].map(([key, files]) => [key, new Set([...files].map(repoPath))]));
const requested = [...uses.keys()].sort();
const keycloakStandIns = objectKeys(["KEYCLOAK_STAND_INS", "="], 1);
const ownMessages = objectKeys(["OWN_MESSAGES", "="], 1);
const ourKeys = [...keycloakStandIns, ...ownMessages];
const decorated = decoratedLinkKeys();
const keycloakifyMessages = (await import("keycloakify/login/i18n/messages_defaultSet/en.js")).default;

/* Keycloak's own versions of the pages we implement, and every macro behind them. */
const counterparts = asServed(root, pages);
const upstreamKeys = templateMessageKeys(root, withImports(root, counterparts));

const problems = [];

for (const page of pages) {
  if (!THEMES.some(theme => names.has(`${theme}/${page}`))) {
    problems.push(`Keycloak ${version} has no ${page}, so our page for it has no counterpart.`);
  }
}

for (const key of requested) {
  if (!messages.has(key) && !UNDEFINED_UPSTREAM.has(key) && !ourKeys.includes(key)) {
    problems.push(
      `Message key "${key}" is not defined by Keycloak ${version}. It still type-checks, ` +
        "because the types come from Keycloakify's copy, but nothing on the server resolves it."
    );
  }
}

for (const key of UNDEFINED_UPSTREAM) {
  if (messages.has(key)) {
    problems.push(`Keycloak ${version} defines "${key}" now, so drop it from UNDEFINED_UPSTREAM in ${SCRIPT}.`);
  }
}

/* A key the call declares itself is in neither object, so nothing here would say when it can go. */
for (const key of objectKeys(["withCustomTranslations", "("], 2)) {
  problems.push(
    `withCustomTranslations in src/i18n.ts declares "${key}" itself. Put it in KEYCLOAK_STAND_INS or ` +
      "OWN_MESSAGES, so this check knows which it is."
  );
}

/*
 * A stand-in is one of Keycloak's messages that Keycloakify's bundled set lacks. Keycloak resolves it
 * on the page like any other key; ours gives the key its type, which comes from Keycloakify's set,
 * so once that has the key, ours is only a stale copy.
 */
for (const key of keycloakStandIns) {
  if (!messages.has(key)) {
    problems.push(
      `KEYCLOAK_STAND_INS in src/i18n.ts lists "${key}", which Keycloak ${version} does not define. ` +
        "If Keycloak renamed it, follow the rename. If it is a message of our own, move it to OWN_MESSAGES."
    );
  } else if (Object.hasOwn(keycloakifyMessages, key)) {
    problems.push(
      `src/i18n.ts stands in for "${key}" only because Keycloakify's message set lacked it. It ships ` +
        "it now, so delete ours from KEYCLOAK_STAND_INS."
    );
  }
}

/*
 * Ours is a message under a key that only we define. Once Keycloak defines it, Keycloak's message
 * shows in place of ours; once Keycloakify does, ours hides its translations.
 */
for (const key of ownMessages) {
  if (messages.has(key) || Object.hasOwn(keycloakifyMessages, key)) {
    const consequence = messages.has(key)
      ? `Keycloak ${version} defines now, so its message shows in place of ours`
      : "Keycloakify defines now, and ours hides its translations";

    problems.push(
      `OWN_MESSAGES in src/i18n.ts lists "${key}", which ${consequence}. If it means the same, move it to ` +
        "KEYCLOAK_STAND_INS with Keycloak's English while Keycloakify lacks it, or drop it. Otherwise rename ours."
    );
  }
}

/*
 * Not only the keys our calls name: an entry no key resolves strips nothing, and one left behind
 * when Keycloak renamed a link means the page, moved to the new key, shows two chevrons.
 */
for (const key of decorated) {
  if (!messages.has(key) && !ourKeys.includes(key)) {
    problems.push(
      `DECORATED_LINK_KEYS in src/i18n.ts lists "${key}", which Keycloak ${version} does not define. ` +
        "If Keycloak renamed that link, list its new key instead, or the page using it shows two chevrons. Otherwise drop it."
    );
  }
}

for (const key of UPSTREAM_ONLY) {
  if (!upstreamKeys.has(key)) {
    problems.push(`UPSTREAM_ONLY lists "${key}", which Keycloak ${version} does not name in its version of any page we implement. Drop it, or check the spelling, in ${SCRIPT}.`);
  }

  if (requested.includes(key)) {
    problems.push(`UPSTREAM_ONLY lists "${key}", which this theme names now. Drop it, in ${SCRIPT}.`);
  }
}

/*
 * What this script assumes about Keycloak's markup. These three readers are regexes over upstream
 * templates, and one that stops matching does not complain: the report simply gets shorter and an
 * upgrade looks clean. So each has to prove it still finds something.
 */
if (!counterparts.some(name => withImports(root, [name]).length > 1)) {
  problems.push(`No \`<#import>\` resolves in Keycloak's versions of our pages, so the report cannot see the macros they import. Fix \`withImports\` in ${SCRIPT}.`);
}

if (!counterparts.some(name => isPage(root, name))) {
  problems.push(`No page of Keycloak's renders \`registrationLayout\`, so the report cannot tell its pages from its macros. Fix \`isPage\` in ${SCRIPT}.`);
}

if (upstreamKeys.size === 0) {
  problems.push(`No \`msg("...")\` resolves in Keycloak's versions of our pages, so the report cannot see a control it relabelled. Fix \`templateMessageKeys\` in ${SCRIPT}.`);
}

/* Only where the parent theme renders its buttons through the macro: the older one has no pages. */
const macroCalls = counterparts.filter(name => (templateText(root, name) ?? "").includes("<@buttons.button"));

if (macroCalls.length > 0 && !macroCalls.some(name => /\slabel="[^"$]+"/.test(templateText(root, name) ?? ""))) {
  problems.push(`No label resolves in the pages of Keycloak's that render a button through its macro, so the report cannot see one it relabelled. Fix \`templateMessageKeys\` in ${SCRIPT}.`);
}
if (problems.length > 0) {
  console.error(`\nAgainst Keycloak ${version}:\n`);

  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }

  console.error('\nSee "Keeping up with Keycloak" in theme/ui/README.md.\n');
  process.exit(1);
}

const status = `Keycloak ${version}: ${pages.length} implemented pages, every message key defined.`;
const before = versionBranchedFrom(version);

/* On a branch that moves the version, this goes under the report's title instead. */
if (before === undefined) {
  console.log(status);
  process.exit(0);
}

const previousRoot = await themesRoot(before);
const keycloakify = installedKeycloakify();
const newer = newerKeycloakify(keycloakify);
const I18N = repoPath(join(UI_DIR, "src", "i18n.ts"));

/* Both versions, so a template imported in only one of them, or moved between themes, is watched. */
const ours = [...pages, ...SHARED_TEMPLATES];
const watched = [
  ...new Set([
    ...withImports(root, asServed(root, ours)),
    ...withImports(previousRoot, asServed(previousRoot, ours))
  ])
].sort();

/*
 * The watched templates a version serves. Around a move between themes, one version has a copy it
 * serves to nobody: base's after the parent theme takes a page over, or before it gives one back.
 * That copy's edits and keys are not drift, and the move is compared across instead.
 */
const servedIn = at => watched.filter(name => asServed(at, [name.split("/")[1]])[0] === name);
const servedNow = servedIn(root);
const servedThen = servedIn(previousRoot);

const changed = servedNow.filter(
  name => servedThen.includes(name) && templateText(root, name) !== templateText(previousRoot, name)
);

const previousNames = new Set(templateNames(previousRoot));

/*
 * Files Keycloak serves from another theme now: the parent theme started overriding one base
 * served, or stopped. Neither is new or gone, since the file was served throughout, so each is
 * compared across the move instead.
 */
const basenames = new Set([...previousNames, ...names].map(name => name.split("/")[1]));
const moved = [...basenames].sort().flatMap(basename => {
  const [then] = asServed(previousRoot, [basename]);
  const [now] = asServed(root, [basename]);

  return then !== undefined && now !== undefined && then !== now ? [{ then, now }] : [];
});
const inOurPages = ({ then, now }) => watched.includes(then) || watched.includes(now);

/*
 * A template is new when no theme had one by its name before, and gone when none has one now. A copy
 * added or dropped beside one that was served throughout is neither, since that one still is.
 */
const appeared = [...names].filter(name => asServed(previousRoot, [name.split("/")[1]]).length === 0).sort();
const removed = [...previousNames].filter(name => asServed(root, [name.split("/")[1]]).length === 0).sort();
const newPages = [...new Set(appeared.filter(name => isPage(root, name)).map(name => name.split("/")[1]))];

/*
 * A control Keycloak relabelled: its own version of one of our pages names a key our theme does not.
 * Nothing above sees this, because the key we still name goes on resolving.
 */
const named = new Set([...requested, ...ourKeys]);
const upstreamBefore = templateMessageKeys(previousRoot, servedThen);
const upstreamNow = templateMessageKeys(root, servedNow);
const startedUsing = [...upstreamNow]
  .filter(key => !upstreamBefore.has(key) && !named.has(key) && !UPSTREAM_ONLY.has(key))
  .sort();

/* Wording rewritten under a key we already name, including a parameter appearing where none was. */
const messagesBefore = keycloakMessages(previousRoot);
const reworded = requested
  .filter(key => messages.has(key) && messagesBefore.has(key) && messages.get(key) !== messagesBefore.get(key))
  .sort();

/*
 * Each template in Keycloak's version of our pages that changed, in place or by moving to another
 * theme, and which of them fail: the ones naming a key Keycloak started using.
 */
const changes = [...changed.map(name => ({ then: name, now: name })), ...moved.filter(inOurPages)]
  .map(describeChange)
  .sort((a, b) => a.now.localeCompare(b.now));
const relabelled = changes.filter(change => change.started.length > 0);

/* A key Keycloak started using in no template that changed, which only a new kind of change makes. */
const unplaced = startedUsing.filter(key => !relabelled.some(change => change.started.includes(key)));

/* Our pages whose counterpart in a version imports a template, directly or through others. */
function pagesBehind(at, name) {
  return pages.filter(page => withImports(at, asServed(at, [page])).includes(name));
}

/*
 * One template in Keycloak's version of our pages across the upgrade: which of our pages it is part
 * of, the keys it started naming that fail, and the keys it stopped naming that our pages still use.
 * A macro new in this version is read as part of the template importing it, directly or through
 * another new macro, since that is where it shows up.
 */
function describeChange({ then, now }) {
  const newMacros = [];

  for (const queue = [now]; queue.length > 0; ) {
    for (const name of directImports(root, queue.shift())) {
      if (appeared.includes(name) && !newMacros.includes(name)) {
        newMacros.push(name);
        queue.push(name);
      }
    }
  }

  const keysThen = templateMessageKeys(previousRoot, [then]);
  const keysNow = templateMessageKeys(root, [now, ...newMacros]);

  return {
    then,
    now,
    newMacros,
    pages: [...new Set([...pagesBehind(root, now), ...pagesBehind(previousRoot, then)])].sort(),
    started: [...keysNow].filter(key => !keysThen.has(key) && startedUsing.includes(key)).sort(),
    stillOurs: [...keysThen].filter(key => !keysNow.has(key) && named.has(key) && !upstreamNow.has(key)).sort()
  };
}

/* Keycloak's English for a key, quoted, with the doubled quotes MessageFormat needs read as one. */
function english(key, at = messages) {
  const text = at.get(key) ?? messagesBefore.get(key);

  return text === undefined ? "none in Keycloak's English" : `"${text.replaceAll("''", "'")}"`;
}

function code(text) {
  return `\`${text}\``;
}

/* "a", "a and b", "a, b and c", or with "or" in place of "and". */
function series(items, conjunction = "and") {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

/* The files of ours that name a key, from src/pages or else from src: `login.ts`, `layout.ts`. */
function namedIn(key) {
  return series([...(uses.get(key) ?? [])].sort().map(file => code(file.replace(/^theme\/ui\/src\/(pages\/)?/, ""))));
}

/* A Markdown table, padded so that it lines up in the console too. */
function table(rows) {
  const cells = rows.map(row => row.map(cell => cell.replaceAll("|", "\\|")));
  const widths = cells[0].map((_, column) => Math.max(...cells.map(row => row[column].length)));
  const line = row => `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`;

  return [line(cells[0]), line(widths.map(width => "-".repeat(width))), ...cells.slice(1).map(line)];
}

/*
 * A template's path from theme/ui, where `yarn check-keycloak` runs, as this run read it: under
 * `.keycloak/` rather than `.keycloak-cache/` when Gradle had unpacked that version.
 */
function templatePath(at, name) {
  const [theme, basename] = name.split("/");

  return relative(UI_DIR, join(loginDir(at, theme), basename)).replaceAll("\\", "/");
}

/* Our files for some of our pages, as `login.ts`, or "every page" for all of them. */
function ourFiles(pageIds) {
  return pageIds.length === pages.length ? "every page" : series(pageIds.map(page => code(pageFiles.get(page))));
}

/* What Keycloak did to a template, as a phrase that follows "Keycloak". */
function whatChanged(change) {
  const [theme, basename] = change.now.split("/");
  const ownPage = change.pages.length === 1 && change.pages[0] === basename;
  const its = ownPage ? "its " : "";
  let did = `changed ${its}${code(change.now)}`;

  if (change.then !== change.now) {
    did = `serves ${its}${code(basename)} from ${code(theme)} now, not ${code(change.then.split("/")[0])}`;
  }

  if (ownPage) {
    return did;
  }

  if (change.pages.length === pages.length) {
    return `${did}, part of every page`;
  }

  return `${did}, part of its ${series(change.pages.map(code))}`;
}

function inKeycloakify(key) {
  return Object.hasOwn(keycloakifyMessages, key);
}

/*
 * Every failing key in one table: the keys Keycloak's version of our pages added that ours lacks,
 * beside those it removed that ours still uses, with the ids of the pages each one is on, a line each.
 */
function failureTable() {
  const rows = [
    ...relabelled.flatMap(change => [
      ...change.started.map(key => ["added", key, change.pages]),
      ...change.stillOurs.map(key => ["removed", key, change.pages])
    ]),
    ...unplaced.flatMap(key =>
      servedNow
        .filter(name => templateMessageKeys(root, [name]).has(key))
        .map(name => ["added", key, pagesBehind(root, name)])
    )
  ];

  return table([
    ["Change", "Key", "English", `In Keycloakify ${keycloakify.version}`, "Pages"],
    ...rows.map(([change, key, ids]) => [
      change,
      code(key),
      english(key),
      inKeycloakify(key) ? "yes" : "no",
      ids.length === pages.length ? "every page" : ids.map(code).join("<br>")
    ])
  ]);
}

/* The changes that do not fail, one row each, with the keys removed that ours still uses where any were. */
function otherChangesTable(changes) {
  const removedAny = changes.some(change => change.stillOurs.length > 0);

  return table([
    ["Our page", "Keycloak", ...(removedAny ? ["Removed, and ours still uses"] : [])],
    ...changes.map(change => [
      ourFiles(change.pages),
      whatChanged(change),
      ...(removedAny ? [series(change.stillOurs.map(code))] : [])
    ])
  ]);
}

/*
 * Each key Keycloak reworded, before and after. Then any whose placeholders changed, since the
 * arguments our page passes may no longer fit.
 */
function rewordedTable(keys) {
  const placeholders = text => [...new Set(text.match(/\{\d+\}/g) ?? [])].sort().join(", ") || "none";
  const shifted = keys.filter(key => placeholders(english(key, messagesBefore)) !== placeholders(english(key)));

  return [
    ...table([
      ["Key", "Shown by", `Keycloak ${before}`, `Keycloak ${version}`],
      ...keys.map(key => [code(key), namedIn(key), english(key, messagesBefore), english(key)])
    ]),
    ...(shifted.length > 0 ? [""] : []),
    ...shifted.map(key => {
      const [then, now] = [english(key, messagesBefore), english(key)].map(placeholders);

      return `- ${code(key)} takes ${now === "none" ? "no placeholders" : now} now, where it took ${then}: check the arguments our page passes.`;
    })
  ];
}

/* A template's diff across the upgrade, as commands to run in theme/ui, with each macro new in this version it imports. */
function diffBlock(change) {
  const macros = change.newMacros.map(name => code(name.split("/")[1]));

  return [
    `${code(change.now)}${macros.length > 0 ? `, and the ${series(macros)} it imports, new in ${version}` : ""}:`,
    "",
    "```sh",
    `diff -u ${templatePath(previousRoot, change.then)} ${templatePath(root, change.now)}`,
    ...change.newMacros.map(name => `cat ${templatePath(root, name)}`),
    "```"
  ];
}

function newPageItem(page) {
  const [served] = asServed(root, [page]);
  const verdict = keycloakify.types.includes(`"${page}"`)
    ? `Keycloakify ${keycloakify.version} has it: see it in the dev server, and add it to \`theme/ui/src/pages\` if it should look like ours.`
    : `Keycloakify ${keycloakify.version} has no types or mock for it, so it can neither be built on nor seen in the dev server.`;

  return [`- ${code(page)}, served from ${code(served.split("/")[0])}`, `  - ${verdict}`];
}

/* What fails, and everything else the upgrade changed: each a list of sections. */
const failures = [];
const others = [];

if (relabelled.length > 0 || unplaced.length > 0) {
  failures.push([
    "### Keycloak relabelled a control on our pages",
    "",
    "Keycloak's version of our pages uses new message keys, for a control it relabelled or added, while our " +
      `theme does not. Use those keys on our pages or add them to \`UPSTREAM_ONLY\` in \`${SCRIPT}\`. A removed ` +
      "key is one Keycloak dropped there that our page still uses, often the one a new key replaces." +
      /*
       * What adopting a key costs where the installed Keycloakify has no message for it: a stand-in
       * in src/i18n.ts, for its type.
       */
      (startedUsing.some(key => !inKeycloakify(key))
        ? ` A key not in Keycloakify also needs Keycloak's English in \`KEYCLOAK_STAND_INS\` in \`${I18N}\`, for ` +
          "its type."
        : ""),
    "",
    ...failureTable()
  ]);
}

const otherChanges = changes.filter(change => !relabelled.includes(change));

/* Templates Keycloak deleted that its version of one of our pages imported. */
const removedOurs = removed.filter(name => watched.includes(name));

if (otherChanges.length > 0 || removedOurs.length > 0) {
  others.push([
    "### Changed in Keycloak's version of our pages",
    "",
    "Compare each with our page, and follow it where it applies.",
    "",
    ...(otherChanges.length > 0 ? otherChangesTable(otherChanges) : []),
    ...(otherChanges.length > 0 && removedOurs.length > 0 ? [""] : []),
    ...removedOurs.map(name => `- ${code(name)} is gone. Keycloak's version of ${ourFiles(pagesBehind(previousRoot, name))} imported it.`)
  ]);
}

if (reworded.length > 0) {
  others.push([
    "### Reworded upstream",
    "",
    "Keycloak changed the English of these messages, and our pages show the new wording.",
    "",
    ...rewordedTable(reworded)
  ]);
}

if (newPages.length > 0) {
  others.push([
    "### New pages upstream",
    "",
    "Our theme does not implement these, so Keycloak serves its own.",
    "",
    ...newPages.flatMap(newPageItem)
  ]);
}

const elsewhere = [
  ...moved.filter(move => !inOurPages(move)).map(({ then, now }) => `- ${code(then)} is served from ${code(now)} now`),
  ...removed.filter(name => !watched.includes(name)).map(name => `- ${code(name)} is gone`)
];

if (elsewhere.length > 0) {
  others.push(["### Elsewhere upstream", "", "No part of a page we implement, so nothing to change.", "", ...elsewhere]);
}

if (changes.length > 0) {
  others.push([
    "### Upstream diffs",
    "",
    "Optional, for reading a change above in full. Run them in `theme/ui` once `yarn check-keycloak` has " +
      "downloaded the files.",
    ...[...relabelled, ...otherChanges].flatMap(change => ["", ...diffBlock(change)])
  ]);
}

const group = (title, sections) => [
  `## ${title}`,
  ...(sections.length === 0 ? [["None."]] : sections).flatMap(section => ["", ...section])
];

/*
 * How far the installed Keycloakify is behind, and the commands that find out whether a newer one
 * helps.
 */
function keycloakifyLag() {
  const intro = "Our pages take their types and dev-server mocks from Keycloakify, not from Keycloak.";

  if (newer.length === 0) {
    return [`${intro} ${keycloakify.version} is installed, the newest release.`];
  }

  const newest = newer.at(-1);
  const releases = newer.length === 1 ? "1 release" : `${newer.length} releases`;

  return [
    `${intro} ${keycloakify.version} is installed, ${releases} behind the newest (${newest}). Where something below ` +
      `is missing from ${keycloakify.version}, upgrade and run this check again to see whether ${newest} has it:`,
    "",
    "```sh",
    "yarn up keycloakify",
    "yarn check-keycloak",
    "```"
  ];
}

const report = [
  `# Keycloak ${before} to ${version}`,
  "",
  status,
  "",
  `- Release notes: https://www.keycloak.org/docs/${version}/release_notes/`,
  `- Upgrading guide: https://www.keycloak.org/docs/${version}/upgrading/`,
  "",
  "Please read both: this check only reads login templates and English messages.",
  "",
  ...keycloakifyLag(),
  "",
  ...group("Failures", failures),
  "",
  ...group("Other changes", others),
  ""
].join("\n");

console.log(`\n${report}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}

if (process.env.GITHUB_ACTIONS === "true") {
  const annotations = [
    ...startedUsing.map(key => ["error", `Keycloak labels a control with "${key}", our theme does not`]),
    ...otherChanges.map(({ then, now }) => ["warning", `Keycloak ${then === now ? "changed" : `serves ${now} in place of`} ${then}, part of a page we implement`]),
    ...reworded.map(key => ["warning", `"${key}" is reworded upstream, and our pages show it`]),
    ...newPages
      .filter(page => !keycloakify.types.includes(`"${page}"`))
      .map(page => ["warning", `${page} is new upstream, and Keycloakify ${keycloakify.version} does not have it`])
  ];

  for (const [level, text] of annotations) {
    console.log(`::${level} title=Keycloak drift::${text}`);
  }
}

/*
 * Only the relabelled control fails, because our pages are what there is to change. Whether a
 * template that merely moved, or wording Keycloak rewrote, matters to our version of a page is a
 * judgment with nothing here to edit, so failing on it would be a red that no change can clear.
 *
 * The report above has already said which keys and what to do about them, so there is nothing to
 * add here but the exit code.
 */
if (startedUsing.length > 0) {
  process.exit(1);
}
