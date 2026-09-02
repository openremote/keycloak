import { i18nBuilder } from "keycloakify/login/i18n/noJsx";

/*
 * Translations.
 *
 * Keycloakify ships Keycloak's own message bundle for ~30 languages and fetches the right one
 * at runtime, so pages address strings by Keycloak's message keys rather than by literal
 * English and a realm with internationalization on is translated for free.
 *
 * The `noJsx` entry point is what makes this usable here: Keycloakify's i18n is otherwise a
 * React hook, but it also ships a plain function API, so a Lit theme gets the whole message
 * set for free.
 *
 * Everything below is an OpenRemote departure from that bundle, in two kinds - see
 * UNIVERSAL_ADDITIONS and ENGLISH_WORDING.
 */

/*
 * Keys Keycloak has no translation for in any language, so English is the only thing we can
 * fall back to. `withCustomTranslations` is the right home for exactly these: getI18n uses the
 * block for the current language if there is one and the `en` block otherwise, which means
 * anything put here leaks into every locale. Adding a language block below translates them.
 */
const { getI18n: getI18n_base, ofTypeI18n } = i18nBuilder
  .withThemeName<"openremote">()
  .withCustomTranslations({
    en: {
      backToLoginCredentials: "Back to login credentials",
      select2faDevice: "Select your 2FA device",
      identityProviderLoginLabel: "Or continue with",
      // Keycloak renders this control but ships no message for it.
      doSwitchOrganization: "Switch organization",
      // Fallback label for an OTP credential the user saved without naming it.
      otpDeviceFallback: "Device {0}"
    }
  })
  .build();

export type I18n = typeof ofTypeI18n;

/*
 * House style for OpenRemote's *English* copy, applied only when the page is in English.
 *
 * These are all cases where Keycloak's English differs from the design and its other
 * languages are perfectly good - "Sign In" against "Log in", title case against sentence
 * case, "Forgot Your Password?" against "Password recovery". Putting them through
 * withCustomTranslations instead would apply them to every language, because that `en` block
 * doubles as the fallback for languages with no block of their own: a Dutch realm rendered a
 * Dutch "Gebruikersnaam" above an English "Log in to your account".
 *
 * Anything genuinely wrong in Keycloak's translations belongs upstream, not here.
 */
const ENGLISH_WORDING: Record<string, string> = {
  // Headings, worded to match the design.
  loginAccountTitle: "Log in to your account",
  emailForgotTitle: "Password recovery",
  registerTitle: "Register new account",

  // Keycloak's English is title case where the design is sentence case throughout.
  doLogIn: "Log in",
  doForgotPassword: "Forgot password?",
  passwordNew: "New password",
  loginTotpDeviceName: "Device name",
  backToLogin: "Back to login",
  backToApplication: "Back to application",

  /*
   * The design labels this "Email address"; Keycloak's English says just "Email".
   *
   * This one is also in ../../src/main/messages/messages_en.properties, and has to be: the
   * register page gets its labels from the user profile as "${email}", which Keycloak resolves
   * server-side, and that resolution outranks everything the client supplies.
   */
  email: "Email address"
};

/*
 * Keycloak decorates its navigation links with a literal "«" or "»" in *every* language, and
 * the design draws that chevron in CSS. The English strings above already omit it; this takes
 * it off the other 29 languages, which would otherwise show two chevrons.
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
  const isEnglish = i18n.currentLanguage.languageTag === "en";

  const resolve = (key: string, fallback: () => string): string => {
    const wording = isEnglish ? ENGLISH_WORDING[key] : undefined;
    const message = wording ?? fallback();
    return DECORATED_LINK_KEYS.has(key) ? message.replace(LEADING_CHEVRON, "") : message;
  };

  return {
    ...i18n,
    msgStr: (key, ...args) => resolve(key, () => i18n.msgStr(key, ...args)),
    advancedMsgStr: (key, ...args) => {
      // advancedMsgStr takes keys that may arrive wrapped as "${key}" from kcContext.
      const unwrapped = /^\$\{(.+)\}$/.exec(key)?.[1] ?? key;
      return resolve(unwrapped, () => i18n.advancedMsgStr(key, ...args));
    }
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
