import { i18nBuilder } from "keycloakify/login/i18n/noJsx";

/*
 * Translations.
 *
 * Keycloakify ships Keycloak's own message bundle for every language Keycloak translates, and
 * fetches the right one at runtime, so pages address strings by Keycloak's message keys rather
 * than by literal English and a realm with internationalization on is translated for free.
 *
 * The `noJsx` entry point is what makes this usable here: Keycloakify's i18n is otherwise a
 * React hook, but it also ships a plain function API, so a Lit theme gets the whole message
 * set for free.
 *
 * The wording is Keycloak's, deliberately. Overriding a string only ever works in one language,
 * so every other locale keeps Keycloak's phrasing regardless, and it puts this theme in the
 * business of maintaining auth copy. If a string reads wrong it reads wrong in every language and
 * the fix belongs upstream.
 *
 * What is left below is the two things that are not wording choices: keys Keycloak has no message
 * for at all, and a decoration the design draws in CSS instead. Nothing else belongs here - not
 * even a string that reads wrong.
 */

/*
 * Keys Keycloak has no translation for in any language, so English is the only thing we can
 * fall back to. `withCustomTranslations` is the right home for exactly these: getI18n uses the
 * block for the current language if there is one and the `en` block otherwise, which means
 * anything put here leaks into every locale. Adding a language block below translates them.
 *
 * That leak is why nothing else may go here. It is also why the English rewordings never could:
 * a Dutch realm rendered a Dutch "Gebruikersnaam" above an English "Log in to your account".
 */
const { getI18n: getI18n_base, ofTypeI18n } = i18nBuilder
  .withThemeName<"openremote">()
  .withCustomTranslations({
    en: {
      // Both of these are additions to Keycloak's own login-otp.ftl, which offers no way back
      // and gives its list of devices no label at all - so there is no key to reuse.
      backToLoginCredentials: "Back to login credentials",
      select2faDevice: "Select your 2FA device",
      /*
       * Not ours: this is Keycloak's own string, verbatim, capital O and all
       * (26.7 messages_en.properties line 18). It is here only because Keycloakify's bundled
       * copy of the message set predates it, so removing this line blanks the button rather
       * than falling back to Keycloak's wording. Delete it once Keycloakify catches up.
       */
      doSwitchOrganization: "Switch Organization",
      // Fallback label for an OTP credential the user saved without naming it. Keycloak's own
      // template renders the blank label as-is, giving a radio with no accessible name.
      otpDeviceFallback: "Device {0}"
    }
  })
  .build();

export type I18n = typeof ofTypeI18n;

/*
 * Keycloak decorates its navigation links with a literal "«" or "»" in *every* language, and
 * the design draws that chevron in CSS (.or-card__back a::before). Without this the links show
 * two of them.
 *
 * This is not a wording override: the text is Keycloak's in every language, only the glyph the
 * stylesheet is already drawing is taken off.
 */
const DECORATED_LINK_KEYS = new Set([
  "backToLogin",
  "backToApplication",
  "backToLoginCredentials",
  "backToLoginPage",
  "proceedWithAction"
]);

const LEADING_CHEVRON = /^\s*(?:&laquo;|&raquo;|«|»)\s*/;

function localize(i18n: I18n): I18n {
  const undecorate = (key: string, message: string): string =>
    DECORATED_LINK_KEYS.has(key) ? message.replace(LEADING_CHEVRON, "") : message;

  return {
    ...i18n,
    msgStr: (key, ...args) => undecorate(key, i18n.msgStr(key, ...args)),
    advancedMsgStr: (key, ...args) =>
      // advancedMsgStr takes keys that may arrive wrapped as "${key}" from kcContext.
      undecorate(/^\$\{(.+)\}$/.exec(key)?.[1] ?? key, i18n.advancedMsgStr(key, ...args))
  };
}

export function getI18n(params: Parameters<typeof getI18n_base>[0]): {
  i18n: I18n;
  prI18n_currentLanguage: Promise<I18n> | undefined;
} {
  const { i18n, prI18n_currentLanguage } = getI18n_base(params);

  return {
    i18n: localize(i18n),
    prI18n_currentLanguage: prI18n_currentLanguage?.then(localize)
  };
}
