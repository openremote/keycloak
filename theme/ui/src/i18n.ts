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
 * What is left below is the two things that are not wording choices: keys Keycloakify's bundled
 * message set has no message for, and a decoration the design draws in CSS instead. Nothing else
 * belongs here, not even a string that reads wrong.
 */

/*
 * Keycloak's own messages that Keycloakify's bundled message set has yet to ship, copied verbatim
 * from Keycloak's English. Without one, the control it labels renders blank. Each is temporary:
 * the Keycloak check fails once the installed Keycloakify has it, and then it goes.
 */
const KEYCLOAK_STAND_INS = {
  // The organization switcher, under "Try another way".
  doSwitchOrganization: "Switch Organization",
  // The error page, when tracing is on: the identifier support asks for.
  traceIdSupportMessage: "If you contact support, please provide the following trace identifier: {0}",
  // The verify-email page an application opens as a required action.
  emailVerifyInstruction4:
    "To verify your email address, we are about to send you email with instructions to the address {0}.",
  emailVerifyResend: "Re-send verification email",
  emailVerifySend: "Send verification email"
};

/*
 * Messages of our own, for what Keycloak's templates have no key for. Neither Keycloak nor
 * Keycloakify defines any of them, and the check fails if one starts to: ours would hide its
 * translations.
 */
const OWN_MESSAGES = {
  // Additions to Keycloak's login-otp.ftl, which offers no way back and gives its list of devices
  // no label.
  backToLoginCredentials: "Back to login credentials",
  select2faDevice: "Select your 2FA device",
  // An OTP credential the user saved without naming it. Keycloak's own template renders the blank
  // label as it is, giving a radio with no accessible name.
  otpDeviceFallback: "Device {0}"
};

/*
 * English is the only thing either can fall back to. getI18n uses the block for the current
 * language if there is one and the `en` block otherwise, so everything here shows in every
 * language. Adding a language block below translates them.
 */
const { getI18n: getI18n_base, ofTypeI18n } = i18nBuilder
  .withThemeName<"openremote">()
  .withCustomTranslations({
    en: { ...KEYCLOAK_STAND_INS, ...OWN_MESSAGES }
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
 *
 * The Keycloak check fails on an entry Keycloak does not define, so one left behind when a link is
 * renamed upstream says so instead of letting the second chevron back in.
 */
const DECORATED_LINK_KEYS = new Set([
  "backToLogin",
  "backToApplication",
  "backToLoginCredentials",
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
