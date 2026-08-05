import { i18nBuilder } from "keycloakify/login/i18n/noJsx";

/*
 * Translations.
 *
 * Keycloakify ships Keycloak's own message bundle for ~30 languages and fetches the right one
 * at runtime, so pages address strings by Keycloak's message keys rather than by literal
 * English. Everything below is an OpenRemote departure from that bundle.
 *
 * The `noJsx` entry point is what makes this usable here: Keycloakify's i18n is otherwise a
 * React hook, but it also ships a plain function API, so a Lit theme gets the whole message
 * set for free.
 *
 * Resolution order inside getI18n is: messages the Keycloak server put in kcContext, then
 * these, then the bundled set for the current language, then the bundled English set. The
 * server only contributes dynamically-determined keys - user-profile option labels, required
 * actions, validation errors - so for ordinary UI labels these overrides win.
 *
 * Declaring them only under `en` is deliberate, and is not English-only behaviour: when the
 * realm's language has no entry here getI18n falls back to the `en` one, so a translated realm
 * gets Keycloak's translation for every key we have *not* overridden and our wording for the
 * handful we have. Add a language block to translate these too.
 */
const { getI18n, ofTypeI18n } = i18nBuilder
  .withThemeName<"openremote">()
  .withCustomTranslations({
    en: {
      // Headings, worded to match the OpenRemote design.
      loginAccountTitle: "Log in to your account",
      emailForgotTitle: "Password recovery",
      registerTitle: "Register new account",

      /*
       * Keycloak's base wording is title case ("Sign In", "New Password", "Device Name") where
       * the design is sentence case throughout, and it decorates its back links with a literal
       * "«" - the design draws that chevron in CSS, so the glyph must not be in the string.
       */
      doLogIn: "Log in",
      doForgotPassword: "Forgot password?",
      passwordNew: "New password",
      loginTotpDeviceName: "Device name",
      backToLogin: "Back to login",
      backToApplication: "Back to application",

      /*
       * The design labels this "Email address"; Keycloak's base bundle says just "Email".
       *
       * This one is also in ../../src/main/resources/theme/openremote/login/messages, and has
       * to be: the register page gets its labels from the user profile as "${email}", which
       * Keycloak resolves server-side, and that resolution outranks everything here.
       */
      email: "Email address",

      // Not in Keycloak's bundle at all.
      backToLoginCredentials: "Back to login credentials",
      select2faDevice: "Select your 2FA device",
      identityProviderLoginLabel: "Or continue with",
      // Fallback label for an OTP credential the user saved without naming it.
      otpDeviceFallback: "Device {0}"
    }
  })
  .build();

export type I18n = typeof ofTypeI18n;

export { getI18n };
