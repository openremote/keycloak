/*
 * Keycloakify's compiler detects that this project provides a login theme by the presence
 * of this file.
 *
 * The types come from the main `keycloakify` package, deliberately not from
 * `@keycloakify/login-ui`: that one is a React port of Keycloak's default login UI and its
 * README currently says "Do not use yet, a public announcement will be made when it is
 * ready". Everything needed here - the typed kcContext and the per-page mocks - lives in
 * `keycloakify/login`, whose KcContext directory has no React imports.
 *
 * Pages get real per-page narrowing from it, so a typo in a kcContext field is a compile
 * error rather than a blank spot on the page.
 */
import type { ExtendKcContext } from "keycloakify/login";

export type KcContextExtension = {
  themeName: string;
  properties: Record<string, string | undefined>;
  /**
   * Set by Keycloak when the user is mid-flow in an organization that offers others to switch
   * to. Keycloakify does not model it yet, but its own template.ftl renders the control, so
   * without this the option simply disappears.
   */
  switchOrganizationEnabled?: boolean;
};

/*
 * Per-page additions. Keycloakify's built-in types do not cover every value Keycloak
 * actually puts in the FreeMarker context; this is the documented way to fill the gaps.
 *
 * login-update-password.ftl really does receive `username` at runtime - the FreeMarker
 * theme renders it into the hidden field password managers key off - but it is missing from
 * the shipped type.
 *
 * Note this must not be Record<string, never>: ExtendKcContext intersects the per-page map
 * into each page variant, and that collapses the whole union to `never`, silently turning
 * every kcContext field access into a type error.
 */
export type KcContextExtensionPerPage = {
  "login-update-password.ftl": { username: string };
};

export type KcContext = ExtendKcContext<KcContextExtension, KcContextExtensionPerPage>;
