/*
 * Everything that only exists for local development lives behind this module, which main.ts
 * reaches only via a dynamic import inside an `if (process.env.NODE_ENV === "development")`
 * branch. That placement is load-bearing: with the dynamic imports one level up, in a
 * module-level function merely *called* from the guarded branch, rspack could no longer
 * eliminate them and the page switcher shipped in the production bundle.
 */
import { render } from "lit";
import { createGetKcContextMock } from "keycloakify/login/KcContext/getKcContextMock";
import type { KcContext } from "../login/KcContext";
import { applyBranding } from "../branding";
import { implementedPageIds } from "../page-registry";
import { applyTheme, readThemeOverride, renderPage } from "../render";
import { compareMode, compareRealm, mountCompare } from "./compare";
import { installFlows, rewriteNavigation } from "./flows";
import { mountPageNav } from "./page-nav";
import {
  applyMinimal,
  applySettings,
  effectiveToggles,
  readSettings,
  togglesFor
} from "./settings";
import { fallbackView, renderStock, type StockVariant } from "./stock";

const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension: { themeName: "openremote", properties: {} },
  kcContextExtensionPerPage: {}
});

/** Matches the realm used in the Figma designs, so the two line up when comparing. */
const REALM_DISPLAY_NAME = "Manufacturer";

/**
 * Drives the page from mocks and switches pages without reloading the document.
 *
 * A full navigation per click meant re-parsing the bundle and, because rspack injects CSS
 * via JS in development, repainting an unstyled frame every time - which is what made
 * switching pages flash. Re-rendering in place removes the reload entirely: Lit diffs the
 * existing DOM, and the design-system stylesheet and the rail are never torn down.
 */
export function runDevMode(root: HTMLElement): void {
  const currentPageId = () => new URLSearchParams(location.search).get("page") ?? "login.ftl";
  const currentSettings = () => readSettings(location.search);
  const currentLanguage = () => new URLSearchParams(location.search).get("lang");

  /** The context the page on screen was rendered from, for the flows' language switcher. */
  let rendered: KcContext | undefined;

  /*
   * The page's mock, shaped for a given selection of settings.
   *
   * One function for both the page on screen and the throwaway renders effectiveToggles compares,
   * so the two cannot be shaped differently - a difference there would show up as a setting
   * that seems to matter and does not, or the reverse.
   */
  const buildContext = (pageId: string, settings: readonly string[]): KcContext => {
    const kcContext = getKcContextMock({ pageId: pageId as never }) as KcContext;

    /*
     * The language the user picked from the switcher. Keycloak remembers it the same way across
     * pages - a cookie there, a query parameter here - and getI18n fetches the bundle for it.
     */
    const lang = currentLanguage();
    const locale = (kcContext as { locale?: { currentLanguageTag: string } }).locale;

    if (lang !== null && locale !== undefined) {
      locale.currentLanguageTag = lang;
    }

    /*
     * Start from the barest realm the theme can be asked to render, then let the rail switch
     * features back on. Most of a login page is realm configuration, and Keycloakify's mocks
     * enable an arbitrary mixture of it - which both hid the states a real deployment has and
     * made the mocks disagree with each other, so the same field read "Username or email" on
     * one page and "Username" on the next.
     */
    applyMinimal(kcContext);

    // Cast because only some page variants declare this on realm; here we are just shaping
    // mock data, not reading it. Not a setting - it is the realm's name, which is always shown.
    (kcContext.realm as Record<string, unknown>).displayName = REALM_DISPLAY_NAME;

    /*
     * The QR is left exactly as Keycloakify ships it, because it is shaped like the one Keycloak
     * sends - a fixed 246px canvas with a quiet zone in the range a real one falls in - so the
     * preview goes through the same crop as production rather than being made to look right here.
     *
     * The mock does list only two authenticator apps and pre-resolves their names, where Keycloak
     * sends message keys. Use the keys, so the preview matches the design and exercises the lookup
     * in config-totp.ts.
     */
    const totp = (kcContext as { totp?: { supportedApplications: string[] } }).totp;

    if (totp !== undefined) {
      totp.supportedApplications = [
        "totpAppMicrosoftAuthenticatorName",
        "totpAppFreeOTPName",
        "totpAppGoogleName"
      ];
    }

    /*
     * The mock names the registered devices "label1"/"label2". In production this is the
     * "Device Name" the user typed during 2FA setup, so use something that reads like one -
     * otherwise the preview looks broken rather than showing what a user would see.
     */
    const otpLogin = (
      kcContext as { otpLogin?: { userOtpCredentials: { userLabel: string }[] } }
    ).otpLogin;

    if (otpLogin !== undefined) {
      const names = ["Phone", "Tablet"];
      otpLogin.userOtpCredentials.forEach((credential, index) => {
        credential.userLabel = names[index] ?? `Device ${index + 1}`;
      });
    }

    /*
     * The info page's mock heads itself "<Message header>", a literal that is not a message key -
     * so the harness showed a plausible heading while production showed the raw key
     * "accountUpdatedTitle". Keycloak sends a key here, and the one it sends after the
     * update-password flow is exactly that, so use it.
     *
     * On a real Keycloak, Keycloakify's generated template resolves every key-shaped string in the
     * context with the server's own msg() and hands the result over in
     * `x-keycloakify.messages`, which the page's i18n checks first. That is how this key gets its
     * text in production even though Keycloakify's bundled messages lack it. There is no server
     * here, so supply what it would, in a fresh object: the mocks share theirs.
     */
    const info = kcContext as { messageHeader?: string };

    if (info.messageHeader !== undefined) {
      info.messageHeader = "accountUpdatedTitle";
      kcContext["x-keycloakify"] = {
        ...kcContext["x-keycloakify"],
        messages: { ...kcContext["x-keycloakify"].messages, accountUpdatedTitle: "Account updated" }
      };
    }

    /*
     * Two mocks are too thin for Keycloak's own templates to render from, which the stock pane
     * showed as a render error rather than a page. Both are Keycloakify's mocks being shorter
     * than the data Keycloak sends, so the fix belongs here rather than in a template.
     */

    /*
     * Recovery codes are displayed as `code[0..3]-code[4..7]-code[8..]`, so anything under nine
     * characters makes Keycloak's own template fail on the slice. The mock ships "code123".
     */
    const recoveryCodes = (
      kcContext as {
        recoveryAuthnCodesConfigBean?: {
          generatedRecoveryAuthnCodesList: string[];
          generatedRecoveryAuthnCodesAsString: string;
        };
      }
    ).recoveryAuthnCodesConfigBean;

    if (recoveryCodes !== undefined) {
      recoveryCodes.generatedRecoveryAuthnCodesList = [
        "K7QM4XR2PL9T",
        "B3HN8WVC5ZDY",
        "T6FJ2QKA7MRX",
        "P9CD4YUB3NHW",
        "X2VT7GLM6QKS",
        "R5NZ9PHF4TCB",
        "M8KW3JXD7YQV",
        "D4RB6SNT2WPG"
      ];
      recoveryCodes.generatedRecoveryAuthnCodesAsString =
        recoveryCodes.generatedRecoveryAuthnCodesList.join(", ");
    }

    /*
     * webauthn-register reads `residentKey`, which the mock leaves out entirely, and sets
     * `requireResidentKey` to "required" - a value Keycloak never sends. Both are documented by
     * Keycloak's own webauthnRegister.js: residentKey carries the WebAuthn value ("required",
     * "preferred", "discouraged") and requireResidentKey the deprecated "Yes"/"No". "not
     * specified" is what an unconfigured realm sends for both, and the value that page is most
     * likely to be seen with.
     */
    const webauthn = kcContext as { requireResidentKey?: string; residentKey?: string };

    if (webauthn.requireResidentKey !== undefined) {
      webauthn.requireResidentKey = "not specified";
      webauthn.residentKey = "not specified";
    }

    applySettings(kcContext, settings);

    /*
     * Every link, form action and language URL in the mock points at a Keycloak that is not
     * running - or, for the languages, at a GitHub gist. Replaced with markers that flows.ts
     * resolves to the page Keycloak would show next. This used to rewrite four named keys, which
     * covered the plain links and left every form submit and the language switcher broken.
     *
     * Last, after the settings: some of those add URLs of their own - the identity providers -
     * and a URL added after this point would still post to the dev server.
     */
    rewriteNavigation(kcContext);

    return kcContext;
  };

  /*
   * Renders the page for a selection into a detached element and returns its markup - for
   * comparison only, nothing here is ever attached.
   *
   * A fresh element every time rather than one reused: Lit updates a reused container by
   * diffing, and a removed-then-restored attribute comes back at the end of the attribute list,
   * which would make identical pages compare as different. Comments go because Lit's part
   * markers carry no content.
   */
  const markupFor =
    (pageId: string) =>
    (settings: readonly string[]): string => {
      const scratch = document.createElement("div");
      renderPage(buildContext(pageId, settings), scratch);
      return scratch.innerHTML.replace(/<!--[\s\S]*?-->/g, "");
    };

  // Bumped on every render, so a stock page that answers after the user has moved on is dropped.
  let generation = 0;

  /** Settings each page was last found to care about, so a re-render does not start from nothing. */
  const offered = new Map<string, readonly string[]>();

  const show = (): void => {
    const pageId = currentPageId();
    const settings = currentSettings();
    const mine = ++generation;
    applyTheme(readThemeOverride(location.search));

    const kcContext = buildContext(pageId, settings);
    const toggles = togglesFor(kcContext);
    const implemented = implementedPageIds.includes(pageId);

    /*
     * The same page with each unticked setting switched on, for the stock renders to compare
     * against. Built only if a stock page is actually wanted, and at most once.
     */
    let variants: StockVariant[] | undefined;
    const stockVariants = (): StockVariant[] =>
      (variants ??= toggles
        .filter(toggle => !settings.includes(toggle.id))
        .map(toggle => ({ id: toggle.id, kcContext: buildContext(pageId, [...settings, toggle.id]) })));

    /*
     * Which settings to offer: those that change our page, found in the browser (settings.ts),
     * plus those that change a stock page, found by the dev server. Ours is known now; the stock
     * side arrives a moment later and can only add to it.
     */
    const matters = new Set<string>(settings);

    /*
     * The first publish also keeps whatever the same page was offering a moment ago. Without it
     * every click shrank the list to the settings our own render knows about and then grew it
     * again when the stock answer arrived - two visible changes, for a set that usually ends up
     * identical. The second publish passes the computed set, so a setting that genuinely stopped
     * mattering still goes, just once and on complete information.
     */
    const publish = (ids: Iterable<string> = [...matters, ...(offered.get(pageId) ?? [])]): void => {
      const shown = new Set(ids);
      nav.setCurrent(
        pageId,
        toggles.filter(toggle => shown.has(toggle.id)),
        settings,
        toggles.filter(toggle => !shown.has(toggle.id))
      );
    };

    const stock: Promise<readonly string[]>[] = [];

    if (implemented) {
      effectiveToggles(toggles, settings, markupFor(pageId)).shown.forEach(toggle =>
        matters.add(toggle.id)
      );
      renderPage(kcContext, root);
    } else {
      /*
       * Nothing of ours to show, so show what production does: Keycloak's own page, in the theme it
       * falls back to. Nothing here can say which settings matter until that answers, so the first
       * sight of a page offers all of them rather than guessing; on later renders what the page
       * answered last time is a far better guess, and using it stops the list from opening to its
       * full width and collapsing again on every click.
       */
      if (offered.has(pageId)) {
        offered.get(pageId)?.forEach(id => matters.add(id));
      } else {
        toggles.forEach(toggle => matters.add(toggle.id));
      }

      if (root.querySelector(".dev-fallback") === null) {
        render(fallbackView(pageId, { status: "loading" }), root);
      }

      stock.push(
        renderStock("fallback", kcContext, stockVariants()).then(result => {
          if (mine === generation) {
            render(fallbackView(pageId, { status: "done", ...result }), root);
          }
          matters.clear();
          settings.forEach(id => matters.add(id));
          // A failed render cannot say which settings matter, so it offers all of them.
          return "changed" in result ? result.changed : toggles.map(toggle => toggle.id);
        })
      );
    }

    rendered = kcContext;
    void applyBranding(kcContext);
    publish();

    stock.push(compare.setPage(pageId, () => renderStock("compare", kcContext, stockVariants())));

    void Promise.all(stock).then(results => {
      if (mine !== generation) {
        return;
      }
      results.flat().forEach(id => matters.add(id));
      offered.set(pageId, [...matters]);
      publish(matters);
    });
  };

  const navigate = (search: string): void => {
    history.pushState(null, "", search);
    show();
  };

  // Links, forms and the language switcher on the pages themselves. See flows.ts.
  installFlows({ pageId: currentPageId, kcContext: () => rendered, navigate });

  const compare = mountCompare({ realm: compareRealm, mode: compareMode });

  const nav = mountPageNav({
    current: currentPageId(),
    isDark: () => document.documentElement.getAttribute("theme") === "dark",
    navigate
  });

  window.addEventListener("popstate", show);
  show();
}
