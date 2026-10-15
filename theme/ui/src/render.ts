import { render } from "lit";
import type { KcContext } from "./login/KcContext";
import { getI18n } from "./i18n";
import { pages } from "./page-registry";

export type ThemeOverride = "light" | "dark" | null;

/**
 * Whether a visitor's own `prefers-color-scheme` puts the page into dark mode.
 *
 * Off until the manager has a dark mode of its own. The login page is the first thing a user
 * sees, and following the OS preference here means a dark login handing over to a light manager.
 *
 * Only the automatic path is off. The styling is the `:root[theme~="dark"]` block
 * `@openremote/theme` already ships, so turning this flag back on is the whole change, and the
 * dev server still shows the pages dark with ?theme=dark in the meantime.
 *
 * index.html repeats this decision inline, before first paint. Change both together.
 */
const FOLLOW_SYSTEM_DARK_MODE = false;

/**
 * Reuses the :root[theme~="dark"] block the design system already ships, so there is no
 * second palette to maintain.
 *
 * `override` must win over the OS preference rather than simply be absent from it, so that
 * "light" stays light on a machine set to dark.
 *
 * index.html applies the same rule inline before first paint; this keeps it correct
 * afterwards, including when the dev switcher changes it without reloading.
 */
export function applyTheme(override: ThemeOverride): void {
  const prefersDark =
    FOLLOW_SYSTEM_DARK_MODE && (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);

  if (override === "dark" || (override !== "light" && prefersDark)) {
    document.documentElement.setAttribute("theme", "dark");
  } else {
    document.documentElement.removeAttribute("theme");
  }
}

export function readThemeOverride(search: string): ThemeOverride {
  const value = new URLSearchParams(search).get("theme");
  return value === "light" || value === "dark" ? value : null;
}

export function renderPage(kcContext: KcContext, root: HTMLElement): void {
  /*
   * A page with no module in src/pages cannot reach this: the build keeps a template only for the
   * pages found there (ui/scripts/write-implemented-pages.mjs reads the same directory this
   * registry scans), so Keycloak serves everything else from its own theme and never loads this
   * bundle for it. If the two ever disagree, say which page rather than rendering an empty card.
   */
  const page = pages.get(kcContext.pageId);

  if (page === undefined) {
    throw new Error(
      `No implementation for ${kcContext.pageId}. The build should not have kept a template for it.`
    );
  }

  /*
   * i18n resolves synchronously in English so there is no blank first paint; for any other
   * realm language the bundle is fetched and prI18n_currentLanguage settles, at which point
   * we render again. Lit diffs, so that second pass only touches the strings that changed.
   *
   * prI18n_currentLanguage is undefined when there is nothing to wait for: English, or a
   * realm with internationalization off, which is the common case.
   */
  const { i18n, prI18n_currentLanguage } = getI18n({ kcContext });

  render(page(kcContext, i18n), root);

  void prI18n_currentLanguage?.then(translated => {
    render(page(kcContext, translated), root);
  });
}
