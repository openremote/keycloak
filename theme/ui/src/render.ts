import { render } from "lit";
import type { KcContext } from "./login/KcContext";
import { fallbackPage } from "./fallback";
import { getI18n } from "./i18n";
import { pages } from "./page-registry";

export type ThemeOverride = "light" | "dark" | null;

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
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const dark = override !== null ? override === "dark" : prefersDark;

  if (dark) {
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
  // Anything without a module in src/pages lands on the placeholder - see fallback.ts for
  // why that matters when weighing Keycloakify up.
  const page = pages.get(kcContext.pageId) ?? fallbackPage;

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
