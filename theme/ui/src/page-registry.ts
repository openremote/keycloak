import type { TemplateResult } from "lit";
import type { I18n } from "./i18n";
import type { KcContext } from "./login/KcContext";

/*
 * Discovers the implemented pages by scanning src/pages at build time, so there is no list
 * to keep in sync: adding a file to src/pages that exports `pageId` and `render` is all it
 * takes to implement a page, and the dev page switcher picks it up automatically.
 *
 * import.meta.webpackContext is rspack's (webpack-compatible) context module. "sync" mode
 * inlines every match into the bundle, which is what we want - these are the pages Keycloak
 * may serve, and the correct one is chosen at runtime from kcContext.pageId.
 */
/*
 * `i18n` is passed to every page but declared by only the ones that need it - a function of
 * one parameter is assignable to a type of two, so pages that render fixed copy keep the
 * shorter signature.
 */
type PageModule = {
  pageId: KcContext["pageId"];
  render: (kcContext: KcContext, i18n: I18n) => TemplateResult;
};

const context = import.meta.webpackContext("./pages", {
  recursive: false,
  regExp: /\.ts$/,
  mode: "sync"
});

function toPages(): ReadonlyMap<string, PageModule["render"]> {
  const pages = new Map<string, PageModule["render"]>();

  for (const key of context.keys()) {
    const module = context(key) as Partial<PageModule>;

    // Ignore anything in the directory that is not a page module.
    if (typeof module.pageId !== "string" || typeof module.render !== "function") {
      continue;
    }

    pages.set(module.pageId, module.render);
  }

  return pages;
}

/**
 * pageId -> renderer, for every page under src/pages.
 *
 * Each page narrows kcContext to its own variant internally (via
 * `Extract<KcContext, { pageId: typeof pageId }>`), so a field that page's kcContext does not
 * actually carry is a compile error. The registry itself is necessarily untyped across that
 * boundary - the map key is what guarantees the pairing - so the cast in PageModule is the
 * single deliberate escape hatch in this file.
 */
export const pages = toPages();

/** Sorted pageIds that have an implementation. Used by the dev page switcher. */
export const implementedPageIds: readonly string[] = [...pages.keys()].sort((a, b) =>
  a.localeCompare(b)
);
