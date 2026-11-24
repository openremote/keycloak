/*
 * The message keys this theme's pages name, read from their source.
 *
 * Read here rather than in each script, because two of them have to agree on it: the packaging step
 * has Keycloak resolve each page's keys when it renders that page, and the Keycloak check asks whether
 * Keycloak still defines them. The dev server asks the same of its stock renderer.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { implementedPageFiles } from "./implemented-pages.mjs";

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/*
 * A static import or re-export of one of our own files. A type-only one brings in no code, and so no
 * messages, and a stylesheet is not followed because it does not resolve to a .ts file.
 */
const LOCAL_IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["'](?<path>\.{1,2}\/[^"']+)["']/gm;

/*
 * Keys this theme names, each to the files that name it. The literals in the key argument rather than
 * only one straight after the paren, because a page may choose between two keys and both are rendered
 * somewhere: `msgStr(realm.duplicateEmailsAllowed ? "emailInstructionUsername" : "emailInstruction")`.
 *
 * The key argument alone: what follows it are values interpolated into the message, and a literal
 * among those is not a key. In any of the three quotes, because `msgStr('doLogIn')` type-checks as
 * well and no formatter here rewrites it to double quotes. A key assembled at runtime, which includes
 * a template literal with a `${}` in it, is not a literal and cannot be read here, which is what
 * advancedMsgStr is for: Keycloak resolves a key that arrives in kcContext without being asked.
 */
export function messageKeyUses() {
  const uses = new Map();

  for (const file of sourceFiles()) {
    for (const key of keysIn(readFileSync(file, "utf8"))) {
      uses.set(key, new Set([...(uses.get(key) ?? []), file]));
    }
  }

  return uses;
}

/*
 * Each implemented page's keys, sorted: those its module names, and those of every file it imports,
 * which is how the shared layout's reach each page.
 */
export function pageMessageKeys() {
  const keys = new Map();

  for (const [pageId, basename] of implementedPageFiles()) {
    const found = new Set();

    for (const file of withImports(join(SRC_DIR, "pages", basename))) {
      keysIn(readFileSync(file, "utf8")).forEach(key => found.add(key));
    }

    keys.set(pageId, [...found].sort());
  }

  return keys;
}

/*
 * The literals in a key argument that are keys, matched by `literal` into its `key` group.
 *
 * One that is compared against is not: `msgStr(kind === "otp" ? "a" : "b")` names a and b. Nor is
 * one concatenated with something: `msg(prefix + '.' + option)` assembles its key at runtime, and
 * the `.` is no more a key than the prefix is.
 */
export function keyLiterals(argument, literal) {
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
export function keyArgument(source, start) {
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

/* The keys one file's msgStr and advancedMsgStr calls name. */
function keysIn(source) {
  const keys = [];

  for (const call of source.matchAll(/\b(?:msgStr|advancedMsgStr)\(/g)) {
    const argument = keyArgument(source, call.index + call[0].length);

    keys.push(...keyLiterals(argument, /(["'`])(?<key>[^"'`$]+)\1/g));
  }

  return keys;
}

/* A file and every one of ours it imports, however indirectly. */
function withImports(entry) {
  const files = new Set();

  const visit = file => {
    if (files.has(file)) {
      return;
    }

    files.add(file);

    for (const match of readFileSync(file, "utf8").matchAll(LOCAL_IMPORT)) {
      const target = sourceFile(join(dirname(file), match.groups.path));

      if (target !== undefined) {
        visit(target);
      }
    }
  };

  visit(entry);
  return files;
}

/* The .ts file an import specifier names, written with or without its extension. */
function sourceFile(specifier) {
  return [specifier, `${specifier}.ts`, join(specifier, "index.ts")].find(
    candidate => candidate.endsWith(".ts") && existsSync(candidate)
  );
}

function sourceFiles() {
  // src/dev never ships, and its strings are the harness's own.
  return readdirSync(SRC_DIR, { recursive: true })
    .filter(path => path.endsWith(".ts") && !/^dev[\\/]/.test(path))
    .map(path => join(SRC_DIR, path));
}
