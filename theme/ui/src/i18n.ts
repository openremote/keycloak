import type { KcContext } from "./login/KcContext";

/*
 * Translations.
 *
 * Pages address strings by Keycloak's message keys rather than by literal English, and Keycloak
 * resolves them while it renders the page, in the user's language and with the realm's overrides:
 * theme/build.gradle adds a lookup to each page's template for the keys the page names, as
 * Keycloakify's template already does for those kcContext carries. They arrive in
 * `x-keycloakify.messages`, and nothing else here translates. A key Keycloak has no message for
 * shows as itself, as it does on Keycloak's own pages.
 *
 * The wording is Keycloak's, deliberately. Overriding a string only ever works in one language,
 * so every other locale keeps Keycloak's phrasing regardless, and it puts this theme in the
 * business of maintaining auth copy. If a string reads wrong it reads wrong in every language and
 * the fix belongs upstream.
 *
 * What is left below is the two things that are not wording choices: messages for keys Keycloak
 * has none for, and a decoration the design draws in CSS instead. Nothing else belongs here, not
 * even a string that reads wrong.
 */

/*
 * Messages of our own, for what Keycloak has no message for, in English wherever OWN_TRANSLATIONS
 * has none. The Keycloak check fails if Keycloak starts to define one: its message then shows
 * instead.
 */
const OWN_MESSAGES = {
  // Additions to Keycloak's login-otp.ftl, which offers no way back and gives its list of devices
  // no label.
  backToLoginCredentials: "Back to login credentials",
  select2faDevice: "Select your 2FA device",
  // An OTP credential the user saved without naming it. Keycloak's own template renders the blank
  // label as it is, giving a radio with no accessible name.
  otpDeviceFallback: "Device {0}",
  // The language switcher's accessible name. Keycloak's own template asks for this key too, but has
  // no message for it, so screen readers there hear the key.
  languages: "Languages"
};

/*
 * Our messages in other languages, by language tag. The switcher's accessible name only, copied
 * from Keycloakify's bundled messages, which translated it for these.
 */
const OWN_TRANSLATIONS: Record<string, Partial<Record<keyof typeof OWN_MESSAGES, string>>> = {
  ar: { languages: "اللغات" },
  ca: { languages: "Idiomes" },
  cs: { languages: "Jazyky" },
  da: { languages: "Sprog" },
  de: { languages: "Sprachen" },
  el: { languages: "Γλώσσες" },
  es: { languages: "Idiomas" },
  fa: { languages: "زبان‌ها" },
  fi: { languages: "Kielet" },
  fr: { languages: "Langues" },
  hu: { languages: "Nyelvek" },
  it: { languages: "Lingue" },
  ja: { languages: "言語" },
  ka: { languages: "ენები" },
  lt: { languages: "Kalbos" },
  lv: { languages: "Valodas" },
  nl: { languages: "Talen" },
  no: { languages: "Språk" },
  pl: { languages: "Języki" },
  pt: { languages: "Idiomas" },
  "pt-BR": { languages: "Idiomas" },
  ru: { languages: "Языки" },
  sk: { languages: "Jazyky" },
  sv: { languages: "Språk" },
  th: { languages: "ภาษา" },
  tr: { languages: "Diller" },
  uk: { languages: "Мови" },
  "zh-CN": { languages: "语言" },
  "zh-TW": { languages: "語言" }
};

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

type Args = (string | undefined)[];

export type I18n = {
  /** The message for a key the page names, with `{0}`, `{1}`, ... filled in from `args`. */
  msgStr: (key: string, ...args: Args) => string;
  /**
   * The same for a string that came from kcContext, which is a key, a key wrapped as "${key}", or
   * text a realm configured, shown as it is.
   */
  advancedMsgStr: (key: string, ...args: Args) => string;
};

/** The language Keycloak renders a page in: English unless the realm has internationalization on. */
export function languageTag(kcContext: KcContext): string {
  return (kcContext.realm.internationalizationEnabled && kcContext.locale?.currentLanguageTag) || "en";
}

export function getI18n(kcContext: KcContext): I18n {
  const language = languageTag(kcContext);
  // A regional variant Keycloak has no translation of its own for, such as de-CH, takes its language's.
  const own = { ...OWN_MESSAGES, ...(OWN_TRANSLATIONS[language] ?? OWN_TRANSLATIONS[language.split("-")[0]]) };
  const sources: Record<string, string>[] = [kcContext["x-keycloakify"].messages, own];
  const lookup = (key: string) => sources.find(messages => Object.hasOwn(messages, key))?.[key];

  // In one pass, so an argument is inserted as it is: not read for `$&`, nor for another `{1}`.
  const format = (key: string, message: string, args: Args) => {
    const filled = message.replace(/\{(\d+)\}/g, (placeholder, i: string) => args[Number(i)] ?? placeholder);

    return DECORATED_LINK_KEYS.has(key) ? filled.replace(LEADING_CHEVRON, "") : filled;
  };

  return {
    msgStr: (key, ...args) => format(key, lookup(key) ?? key, args),
    advancedMsgStr: (text, ...args) => {
      const key = /^\$\{(.+)\}$/.exec(text)?.[1] ?? text;
      const message = lookup(key);

      return message === undefined ? text : format(key, message, args);
    }
  };
}
