/// <reference types="@rspack/core/module" />

/*
 * Pulls in rspack's own ambient declarations for the two things it injects into the bundle:
 * import.meta.webpackContext, which src/page-registry.ts uses to discover the page modules,
 * and process.env, whose NODE_ENV it narrows to "development" | "production" - the constant
 * src/main.ts branches on to keep the dev harness out of production builds.
 *
 * Declaring either by hand would be redundant and worse: rspack's webpackContext signature
 * also covers include/exclude/preload/prefetch/chunkName and returns a properly typed
 * Rspack.Context.
 */
