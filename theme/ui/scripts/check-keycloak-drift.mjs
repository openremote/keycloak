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
import { implementedPages } from "./implemented-pages.mjs";

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(UI_DIR, "..", "..");
const CACHE_DIR = join(UI_DIR, ".keycloak-cache");

/* Maven Central, or the job would sit on a stalled read until CI's own limit cut it off. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/* Where the lists below live, so a failure cleared by editing one says where to go. */
const SCRIPT = relative(REPO_ROOT, fileURLToPath(import.meta.url));

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
 * Keys Keycloak names behind one of our pages that this theme deliberately does not. A control
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

/** Keycloak's English bundle, which is also what an extraction is judged complete by. */
function messagesFile(root) {
  return join(loginDir(root, "base"), "messages", "messages_en.properties");
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
 * The page files alone were not enough: 26.8.0 redesigned the identity provider buttons inside
 * social-providers.ftl and left the login.ftl that imports it untouched.
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

    for (const match of source.matchAll(/<#import\s+"([^"]+\.ftl)"/g)) {
      queue.push(...asServed(root, [match[1].replace(/^.*\//, "")]));
    }
  }

  return [...seen];
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
 *     picks between two keys, as 26.8.0's social-providers.ftl does.
 *   - `<@buttons.button label="doSubmit"/>`, where the macro resolves it: `${msg(label)}`. That is
 *     how the buttons on most of the pages we implement are written.
 *
 * The literals in the key argument, read by keyLiterals as requestedMessageKeys reads ours, so
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
 * Keycloak's own English bundle, as key to text. The keys are what the checks are about; the text
 * is read only to notice that one changed under a key this theme names. A value continued onto
 * another line with a backslash is read as its first line, which can hide such a change but
 * cannot invent one.
 */
function keycloakMessages(root) {
  const properties = readFileSync(messagesFile(root), "utf8");
  const messages = new Map();

  for (const line of properties.split("\n")) {
    const match = /^([^#=\s]+)=(.*)$/.exec(line);

    if (match !== null) {
      messages.set(match[1], match[2].trim());
    }
  }

  return messages;
}

/*
 * Keys this theme names. The literals in the key argument rather than only one straight after the
 * paren, because a page may choose between two keys and both are rendered somewhere:
 * `msgStr(realm.duplicateEmailsAllowed ? "emailInstructionUsername" : "emailInstruction")`.
 *
 * The key argument alone: what follows it are values interpolated into the message, and a literal
 * among those is not a key. A key assembled at runtime is not a literal and cannot be checked here,
 * which is what advancedMsgStr is for.
 */
function requestedMessageKeys() {
  const keys = new Set();

  for (const file of sourceFiles(join(UI_DIR, "src"))) {
    const source = readFileSync(file, "utf8");

    for (const call of source.matchAll(/\b(?:msgStr|advancedMsgStr)\(/g)) {
      const argument = keyArgument(source, call.index + call[0].length);

      for (const key of keyLiterals(argument, /"(?<key>[^"$]+)"/g)) {
        keys.add(key);
      }
    }
  }

  return [...keys].sort();
}

/*
 * The literals in a key argument that are keys, matched by `literal` into its `key` group.
 *
 * One that is compared against is not: `msgStr(kind === "otp" ? "a" : "b")` names a and b. Nor is
 * one concatenated with something: `msg(prefix + '.' + option)` assembles its key at runtime, and
 * the `.` is no more a key than the prefix is.
 */
function keyLiterals(argument, literal) {
  const keys = [];

  for (const match of argument.matchAll(literal)) {
    const before = argument.slice(0, match.index);
    const after = argument.slice(match.index + match[0].length);

    if (!/(?:[=!]==?|\+)\s*$/.test(before) && !/^\s*(?:[=!]==?|\+)/.test(after)) {
      keys.push(match.groups.key);
    }
  }

  return keys;
}

/*
 * The first argument of the call whose parenthesis `start` follows: up to the comma that ends it,
 * nested calls and their commas included, so a key chosen inside one is part of it.
 */
function keyArgument(source, start) {
  let depth = 0;

  for (let i = start; i < source.length; i++) {
    const character = source[i];

    if (depth === 0 && (character === "," || character === ")")) {
      return source.slice(start, i);
    }

    if ("([{".includes(character)) {
      depth++;
    } else if (")]}".includes(character)) {
      depth--;
    }
  }

  return source.slice(start);
}

function sourceFiles(dir) {
  // src/dev never ships, and its strings are the harness's own.
  return readdirSync(dir, { recursive: true })
    .filter(path => path.endsWith(".ts") && !/^dev[\\/]/.test(path))
    .map(path => join(dir, path));
}

/*
 * One token of TypeScript, close enough to read i18n.ts by: a comment, a string, a word, or any
 * other character but whitespace. Read whole, a URL inside a message does not start a comment, and
 * a brace or a colon inside one is not structure.
 */
const TOKEN = /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<quote>["'`])(?<string>(?:\\[\s\S]|(?!\k<quote>)[^\\])*)\k<quote>|(?<word>\w+)|\S/g;

/**
 * The keys declared in i18n.ts's withCustomTranslations block.
 *
 * Read from its tokens rather than by matching indentation, so reformatting that file cannot
 * quietly turn this into an empty list, and a comment that writes the call out is not taken for
 * it. Depth 2 is a message key: depth 1 is the argument, whose own keys are the language tags the
 * block is organized by. A key is the string or word a property opens with, so the prose after it
 * cannot name one.
 */
function customTranslationKeys() {
  const tokens = [...readFileSync(join(UI_DIR, "src", "i18n.ts"), "utf8").matchAll(TOKEN)].filter(
    token => token.groups.comment === undefined
  );
  const start = tokens.findIndex(
    (token, i) => token.groups.word === "withCustomTranslations" && tokens[i + 1]?.[0] === "("
  );

  if (start === -1) {
    throw new Error("No withCustomTranslations call in src/i18n.ts");
  }

  const keys = [];
  let depth = 0;

  for (let i = start + 2; i < tokens.length; i++) {
    const text = tokens[i][0];

    if (text === "{") {
      depth++;
    } else if (text === "}" && --depth === 0) {
      break;
    } else if (text === ":" && depth === 2 && ["{", ","].includes(tokens[i - 2][0])) {
      keys.push(tokens[i - 1].groups.string ?? tokens[i - 1].groups.word);
    }
  }

  return keys;
}

/** The installed Keycloakify's version, and its KcContext types, which name every page it has. */
function installedKeycloakify() {
  const root = dirname(fileURLToPath(import.meta.resolve("keycloakify/package.json")));

  return {
    version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    types: readFileSync(join(root, "login", "KcContext", "KcContext.d.ts"), "utf8")
  };
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

const pages = implementedPages();
const names = new Set(templateNames(root));
const messages = keycloakMessages(root);
const requested = requestedMessageKeys();
const ourKeys = customTranslationKeys();
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

/*
 * Both, not just Keycloak's own bundle: Keycloakify's is what resolves a key in the browser, so a
 * key Keycloak defines and Keycloakify has yet to ship still needs ours, blank button otherwise.
 * The entries in i18n.ts say which are there for that reason.
 */
for (const key of ourKeys) {
  if (messages.has(key) && Object.hasOwn(keycloakifyMessages, key)) {
    problems.push(
      `i18n.ts carries "${key}" only because Keycloakify's message set lacked it. It ships it ` +
        "now, so delete ours and let Keycloak's own translation through."
    );
  }
}

for (const key of UPSTREAM_ONLY) {
  if (!upstreamKeys.has(key)) {
    problems.push(`UPSTREAM_ONLY lists "${key}", which Keycloak ${version} does not name behind any page we implement. Drop it, or check the spelling, in ${SCRIPT}.`);
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
  problems.push(`No \`<#import>\` resolves in Keycloak's versions of our pages, so the report cannot see the macros behind them. Fix \`withImports\` in ${SCRIPT}.`);
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

console.log(`Keycloak ${version}: ${pages.length} implemented pages, every message key defined.`);

const before = versionBranchedFrom(version);

if (before === undefined) {
  process.exit(0);
}

const previousRoot = await themesRoot(before);

/* Both versions, so a template imported in only one of them, or moved between themes, is watched. */
const ours = [...pages, ...SHARED_TEMPLATES];
const watched = [
  ...new Set([
    ...withImports(root, asServed(root, ours)),
    ...withImports(previousRoot, asServed(previousRoot, ours))
  ])
].sort();

const changed = watched.filter(name => {
  const now = templateText(root, name);
  const then = templateText(previousRoot, name);

  return now !== undefined && then !== undefined && now !== then;
});

const previousNames = new Set(templateNames(previousRoot));
const appeared = [...names].filter(name => !previousNames.has(name)).sort();
const removed = [...previousNames].filter(name => !names.has(name)).sort();
const addedPages = appeared.filter(name => isPage(root, name));
const addedMacros = appeared.filter(name => !isPage(root, name) && watched.includes(name));

/*
 * New pages the installed Keycloakify has no mock or type for. The dev server lists Keycloakify's
 * pages and ours are written against its types, so neither has one of these until Keycloakify is
 * updated. Within its major it only adds, and package.json already allows any release of it.
 */
const keycloakify = installedKeycloakify();
const notInKeycloakify = [...new Set(addedPages.map(name => name.split("/")[1]))].filter(
  page => !keycloakify.types.includes(`"${page}"`)
);
const keycloakifyMajor = keycloakify.version.split(".")[0];

/*
 * A control Keycloak relabelled: its own version of one of our pages names a key our theme does not.
 * Nothing above sees this, because the key we still name goes on resolving. 26.8.0 moved the
 * identity provider buttons from `identity-provider-login-label` to `signInWithProvider` this way.
 */
const named = new Set([...requested, ...ourKeys]);
const upstreamBefore = templateMessageKeys(previousRoot, watched);
const startedUsing = [...templateMessageKeys(root, watched)]
  .filter(key => !upstreamBefore.has(key) && !named.has(key) && !UPSTREAM_ONLY.has(key))
  .sort();

/* Wording rewritten under a key we already name, including a parameter appearing where none was. */
const messagesBefore = keycloakMessages(previousRoot);
const reworded = requested
  .filter(key => messages.has(key) && messagesBefore.has(key) && messages.get(key) !== messagesBefore.get(key))
  .sort();

/*
 * A stand-in of ours Keycloak has started defining, so ours is English over a string it now
 * translates. Not a failure: Keycloakify's bundle is what resolves a key in the browser, and until
 * it ships this one, ours is the only thing that renders. The check above fails when it does.
 */
const nowUpstream = ourKeys.filter(key => messages.has(key) && !messagesBefore.has(key)).sort();

/* The release notes cover far more than templates and keys, and both URLs come from the version. */
const lines = [
  `## Keycloak ${before} to ${version}`,
  "",
  `Release notes: https://www.keycloak.org/docs/${version}/release_notes/`,
  `Upgrading guide: https://www.keycloak.org/docs/${version}/upgrading/`,
  "",
  "Please read both: this check only reads login templates and English messages."
];

if (startedUsing.length > 0) {
  lines.push(
    "",
    "### Failure: Drift detected",
    "",
    "Keycloak relabelled a control our pages also have. Use its key on our page, or record why ours differ in \`UPSTREAM_ONLY\`.",
    "",
    `See \`${SCRIPT}\`.`,
    "",
    startedUsing.map(key => `- \`${key}\`: ${messages.get(key) ?? "(not in the English bundle)"}`).join("\n")
  );
}

const sections = [
  ["Keycloak changed these behind our pages", changed.map(name => `- \`${name}\`\n  \`diff -u .keycloak-cache/{${before},${version}}/theme/${name.replace("/", "/login/")}\``)],
  ["Reworded upstream, and we render it", reworded.map(key => `- \`${key}\`\n  was: ${messagesBefore.get(key)}\n  now: ${messages.get(key)}`)],
  ["Defined upstream now, and src/i18n.ts stands in for it", nowUpstream.map(key => `- \`${key}\`: ${messages.get(key)}`)],
  ["New pages upstream", addedPages.map(name => `- \`${name}\``)],
  [
    `New pages Keycloakify ${keycloakify.version} does not have. Update it to its latest ${keycloakifyMajor}.x release and ` +
      "check they show up in the dev server; if they do not, no release has them yet",
    notInKeycloakify.map(page => `- \`${page}\``)
  ],
  ["New macros behind our pages", addedMacros.map(name => `- \`${name}\``)],
  ["Gone upstream", removed.map(name => `- \`${name}\``)]
].filter(([, items]) => items.length > 0);

lines.push(
  "",
  "### Consider checking",
  "",
  sections.length === 0
    ? "Nothing behind our pages changed."
    : sections.map(([heading, items]) => `${heading}:\n\n${items.join("\n")}`).join("\n\n")
);

const report = `${lines.join("\n")}\n`;

console.log(`\n${report}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}

if (process.env.GITHUB_ACTIONS === "true") {
  const annotations = [
    ...startedUsing.map(key => ["error", `Keycloak labels a control with "${key}", our theme does not`]),
    ...changed.map(name => ["warning", `${name} changed behind one of our pages`]),
    ...reworded.map(key => ["warning", `"${key}" is reworded upstream, and we render it`]),
    ...nowUpstream.map(key => ["warning", `Keycloak defines "${key}" now, which src/i18n.ts stands in for`]),
    ...notInKeycloakify.map(page => ["warning", `${page} is new upstream, and Keycloakify ${keycloakify.version} does not have it`])
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
