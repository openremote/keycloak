/// <reference types="@rspack/core/module" />

/*
 * Pulls in rspack's own ambient declarations for the things it injects into the bundle:
 * import.meta.webpackContext (used by src/page-registry.ts to discover the page modules)
 * and process.env, which DefinePlugin replaces at build time.
 *
 * Both were hand-written here at first, which was redundant and worse: rspack's
 * webpackContext signature also covers include/exclude/preload/prefetch/chunkName and
 * returns a properly typed Rspack.Context, and its process.env already narrows NODE_ENV to
 * "development" | "production".
 *
 * The one thing it cannot give us is the type of our own env var - Rspack.Process["env"] has
 * an `[key: string]: any` index signature, so process.env.OR_MANAGER_URL comes back as
 * `any`. That is annotated at the single read site in src/branding.ts rather than papered
 * over with a competing global declaration here.
 */
