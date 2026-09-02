/*
 * Everything that only exists for local development lives behind this module, which main.ts
 * reaches only via a dynamic import inside an `if (process.env.NODE_ENV === "development")`
 * branch. That placement is load-bearing: with the dynamic imports one level up, in a
 * module-level function merely *called* from the guarded branch, rspack could no longer
 * eliminate them and the page switcher shipped in the production bundle.
 */
import { createGetKcContextMock } from "keycloakify/login/KcContext/getKcContextMock";
import type { KcContext } from "../login/KcContext";
import { applyBranding } from "../branding";
import { applyTheme, readThemeOverride, renderPage } from "../render";
import { mountPageNav } from "./page-nav";

const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension: { themeName: "openremote", properties: {} },
  kcContextExtensionPerPage: {}
});

/** Matches the realm used in the Figma designs, so the two line up when comparing. */
const REALM_DISPLAY_NAME = "Manufacturer";

/*
 * kcContext.url values in the mocks point at a Keycloak that is not running, so links built
 * from them ("Back to login", "Register", "Forgot password?") would navigate straight off
 * the dev server. Rewrite them to point at the equivalent mock page instead.
 *
 * Rewriting the context beats matching on the rendered href, which is what this did first:
 * several of these keys share the same placeholder URL in the mocks, so the lookup was
 * ambiguous and "Back to login" on the register page landed on login-reset-password.
 */
const PAGE_FOR_URL_KEY: Record<string, string> = {
  loginUrl: "login.ftl",
  loginRestartFlowUrl: "login.ftl",
  registrationUrl: "register.ftl",
  loginResetCredentialsUrl: "login-reset-password.ftl"
};

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

  const searchForPage = (pageId: string): string => {
    const params = new URLSearchParams(location.search);
    params.set("page", pageId);
    return `?${params}`;
  };

  const show = (): void => {
    const pageId = currentPageId();
    applyTheme(readThemeOverride(location.search));

    const kcContext = getKcContextMock({ pageId: pageId as never }) as KcContext;

    const urls = kcContext.url as Record<string, string | undefined>;
    for (const [key, target] of Object.entries(PAGE_FOR_URL_KEY)) {
      if (urls[key] !== undefined) {
        urls[key] = searchForPage(target);
      }
    }

    /*
     * Match the realm the designs assume, and keep it consistent across pages. Keycloakify's
     * per-page mocks disagree with each other - login.ftl allows email login while
     * login-reset-password.ftl does not - which made the same field read "Username or email"
     * on one page and "Username" on the next.
     */
    // Cast because only some page variants declare these fields on realm; here we are just
    // shaping mock data, not reading it.
    const realm = kcContext.realm as Record<string, unknown>;
    realm.displayName = REALM_DISPLAY_NAME;
    realm.loginWithEmailAllowed = true;
    realm.registrationEmailAsUsername = false;

    /*
     * The mock QR is left exactly as Keycloakify ships it: 246x246 with a 25px quiet zone,
     * which is what Keycloak really sends (measured: 20px for one realm, 37px for the same
     * realm renamed), so the preview goes through src/qr.ts the same way production does. It
     * used to be swapped for a pre-cropped copy, which made the harness look right and hid
     * the fact that production did not.
     *
     * The mock does list only two authenticator apps and pre-resolves their names, where
     * Keycloak sends message keys for three. Use the keys, so the preview matches the design
     * and exercises the lookup in config-totp.ts.
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
     * Keycloakify mocks login-update-password as a forced password reset, where Keycloak
     * hides both the "Sign out from other devices" checkbox and Cancel. Users reach this
     * page far more often through an app-initiated UPDATE_PASSWORD action, and that variant
     * is the one worth previewing since it is the only page with a secondary action.
     */
    if (pageId === "login-update-password.ftl") {
      (kcContext as { isAppInitiatedAction?: boolean }).isAppInitiatedAction = true;
    }

    renderPage(kcContext, root);
    void applyBranding(kcContext);

    nav.setCurrent(pageId);
  };

  // Delegated so it survives re-renders, and covers both the rail and the links the pages
  // themselves render - both now point at "?page=...".
  document.addEventListener("click", event => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;

    if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }

    const url = new URL(anchor.href, location.href);

    if (url.pathname !== location.pathname || !url.searchParams.has("page")) {
      return;
    }

    event.preventDefault();
    history.pushState(null, "", url.search);
    show();
  });

  const nav = mountPageNav({
    current: currentPageId(),
    isDark: () => document.documentElement.getAttribute("theme") === "dark",
    navigate: search => {
      history.pushState(null, "", search);
      show();
    }
  });

  window.addEventListener("popstate", show);
  show();
}
