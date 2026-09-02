import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-password-field";
import "@openremote/or-vaadin-components/or-vaadin-checkbox";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { errorOf, field, layout, submitButton } from "../layout";
import { profileField } from "../profile";

export const pageId = "register.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * Invisible reCAPTCHA calls back by *name* on the global object once it has a token, and only
 * then may the form be submitted. A <script> tag written into a Lit template would never run -
 * scripts inserted as parsed HTML are inert - so the callback is installed here instead.
 *
 * form.submit() rather than requestSubmit() matches Keycloak's own register.ftl.
 */
declare global {
  interface Window {
    onSubmitRecaptcha?: () => void;
  }
}

function installRecaptchaCallback(): void {
  window.onSubmitRecaptcha = () => {
    const form = document.getElementById("kc-register-form");

    if (form instanceof HTMLFormElement) {
      form.submit();
    }
  };
}

/*
 * Driven by Keycloak's user profile (kcContext.profile.attributesByName) rather than a
 * hardcoded field list. That is how registration works from Keycloak 24 onwards: the realm's
 * User Profile configuration decides which attributes exist, whether they are required, and
 * how each is rendered. src/profile.ts does the rendering; this file is the page around it.
 */

/*
 * The design specifies First name, Last name, Email address. Keycloak's user profile hands
 * attributes over in its own order (username, email, firstName, lastName), so reorder to
 * match, and append anything the design does not cover - custom realm attributes, or
 * `username` on realms that do not use email-as-username - after them.
 */
const DESIGN_ORDER = ["firstName", "lastName", "email"];

function inDesignOrder<T extends { name: string }>(attributes: T[]): T[] {
  const known = DESIGN_ORDER.map(name => attributes.find(a => a.name === name)).filter(
    (a): a is T => a !== undefined
  );
  const rest = attributes.filter(a => !DESIGN_ORDER.includes(a.name));
  return [...known, ...rest];
}

export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const {
    url,
    realm,
    locale,
    profile,
    passwordRequired,
    termsAcceptanceRequired,
    recaptchaRequired,
    recaptchaVisible,
    recaptchaSiteKey,
    recaptchaAction,
    messageHeader,
    messagesPerField
  } = kcContext;
  const { msgStr, advancedMsgStr } = i18n;
  const attributes = inDesignOrder(Object.values(profile.attributesByName));

  /*
   * With internationalization on, Keycloak adds a `locale` attribute to the registration
   * profile. It is not a question for the user: its job is to carry the language they are
   * reading the page in onto the account being created. Keycloak's own
   * user-profile-commons.ftl special-cases it exactly this way, and without it the field
   * renders as a text input labeled "locale" and posts back empty.
   */
  const isCarriedLocale = (name: string): boolean =>
    name === "locale" && !!realm.internationalizationEnabled && !!locale?.currentLanguageTag;

  const termsError = errorOf(kcContext, "termsAccepted");
  const invisibleRecaptcha = !!recaptchaRequired && !recaptchaVisible;

  if (invisibleRecaptcha) {
    installRecaptchaCallback();
  }

  return layout({
    kcContext,
    i18n,
    heading: messageHeader ? advancedMsgStr(messageHeader) : msgStr("registerTitle"),
    /* Keycloak's own register.ftl uses exactly this: every field renders its own error, and
       with a profile-driven form the field names are not knowable in advance, so only
       genuinely global messages belong in the alert. */
    displayMessage: messagesPerField.exists("global"),
    back: { href: url.loginUrl, label: msgStr("backToLogin") },
    content: html`
      <form id="kc-register-form" action=${url.registrationAction} method="post">
        <!-- Decoys: some password managers autofill the first text/password pair on a page,
             which would silently populate the registration form. -->
        <input type="text" readonly value="this is not a login form" style="display:none" />
        <input type="password" readonly value="this is not a login form" style="display:none" />

        ${attributes.map((attribute, index) =>
          isCarriedLocale(attribute.name)
            ? html`<input
                type="hidden"
                id="locale"
                name="locale"
                .value=${locale?.currentLanguageTag ?? ""}
              />`
            : profileField({ kcContext, i18n, attribute, autofocus: index === 0 })
        )}
        ${passwordRequired
          ? html`
              ${field({
                kcContext,
                name: "password",
                label: msgStr("password"),
                type: "password",
                autocomplete: "new-password",
                errorFields: ["password", "password-confirm"]
              })}
              ${field({
                kcContext,
                name: "password-confirm",
                label: msgStr("passwordConfirm"),
                type: "password",
                autocomplete: "new-password"
              })}
            `
          : null}

        <!-- Terms are a realm setting, not a profile attribute, so they arrive separately.
             Without this control a realm that requires terms cannot be registered against at
             all: Keycloak rejects the POST for a missing termsAccepted it never asked for. -->
        ${termsAcceptanceRequired
          ? html`
              <div class="or-terms">
                <p class="or-terms__title">${msgStr("termsTitle")}</p>
                <div class="or-terms__text">${advancedMsgStr("termsText")}</div>
                <or-vaadin-checkbox
                  class="or-field"
                  name="termsAccepted"
                  value="on"
                  ?invalid=${!!termsError}
                >
                  <label slot="label">${msgStr("acceptTerms")}</label>
                  <input slot="input" type="checkbox" />
                  ${termsError ? html`<div slot="error-message">${termsError}</div>` : null}
                </or-vaadin-checkbox>
              </div>
            `
          : null}
        ${recaptchaRequired && recaptchaVisible === true
          ? html`<div class="or-recaptcha g-recaptcha" data-sitekey=${recaptchaSiteKey}></div>`
          : null}

        <!--
          Invisible reCAPTCHA is a property of the *button*: grecaptcha intercepts the click,
          solves the challenge and then calls back to submit. That is why the submit control is
          spelled out here rather than going through submitButton() - it needs the g-recaptcha
          class and data-* hooks on the element grecaptcha binds to.
        -->
        ${invisibleRecaptcha
          ? html`
              <div class="or-submit">
                <or-vaadin-button
                  class="or-submit__styled g-recaptcha"
                  theme="primary"
                  data-sitekey=${recaptchaSiteKey}
                  data-callback=${"onSubmitRecaptcha"}
                  data-action=${recaptchaAction}
                >
                  ${msgStr("doRegister")}
                </or-vaadin-button>
                <button
                  class="or-submit__fallback g-recaptcha"
                  type="submit"
                  name="register"
                  data-sitekey=${recaptchaSiteKey}
                  data-callback=${"onSubmitRecaptcha"}
                  data-action=${recaptchaAction}
                >
                  ${msgStr("doRegister")}
                </button>
              </div>
            `
          : submitButton(msgStr("doRegister"), "register")}
      </form>
    `
  });
}
