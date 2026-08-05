import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-password-field";
import "@openremote/or-vaadin-components/or-vaadin-email-field";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { field, layout, submitButton } from "../layout";

export const pageId = "register.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * Driven by Keycloak's user profile (kcContext.profile.attributesByName) rather than a
 * hardcoded field list. That is how registration actually works from Keycloak 24 onwards:
 * the realm's User Profile configuration decides which attributes exist, whether they are
 * required, and their input type.
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
  const { url, profile, passwordRequired, recaptchaRequired, recaptchaSiteKey } = kcContext;
  const { msgStr, advancedMsgStr } = i18n;
  const attributes = inDesignOrder(Object.values(profile.attributesByName));

  return layout({
    kcContext,
    heading: msgStr("registerTitle"),
    back: { href: url.loginUrl, label: msgStr("backToLogin") },
    content: html`
      <form id="kc-register-form" action=${url.registrationAction} method="post">
        <!-- Decoys: some password managers autofill the first text/password pair on a page,
             which would silently populate the registration form. -->
        <input type="text" readonly value="this is not a login form" style="display:none" />
        <input type="password" readonly value="this is not a login form" style="display:none" />

        ${attributes.map(attribute =>
          field({
            kcContext,
            name: attribute.name,
            /* displayName is a message key wrapped as ${...} for the built-in attributes and
               free text for anything a realm has added; advancedMsgStr handles both, and
               falls back to the attribute name when there is neither. */
            label: advancedMsgStr(attribute.displayName ?? attribute.name),
            type: attribute.name === "email" ? "email" : "text",
            value: attribute.value,
            required: attribute.required,
            autocomplete: attribute.autocomplete
          })
        )}
        ${passwordRequired
          ? html`
              ${field({
                kcContext,
                name: "password",
                label: msgStr("password"),
                type: "password",
                autocomplete: "new-password"
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
        ${recaptchaRequired
          ? html`<div
              class="or-recaptcha g-recaptcha"
              data-size="compact"
              data-sitekey=${recaptchaSiteKey}
            ></div>`
          : null}
        ${submitButton(msgStr("doRegister"), "register")}
      </form>
    `
  });
}
