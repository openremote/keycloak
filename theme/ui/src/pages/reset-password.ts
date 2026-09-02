import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { field, layout, submitButton } from "../layout";

/** Narrowed to this page: kcContext is a discriminated union keyed on pageId. */
export const pageId = "login-reset-password.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, realm, auth, messagesPerField } = kcContext;
  const { msgStr } = i18n;

  const label = !realm.loginWithEmailAllowed
    ? msgStr("username")
    : !realm.registrationEmailAsUsername
      ? msgStr("usernameOrEmail")
      : msgStr("email");

  return layout({
    kcContext,
    i18n,
    heading: msgStr("emailForgotTitle"),
    displayMessage: !messagesPerField.existsError("username"),
    intro: msgStr("emailInstruction"),
    back: { href: url.loginUrl, label: msgStr("backToLogin") },
    content: html`
      <form id="kc-reset-password-form" action=${url.loginAction} method="post">
        ${field({
          kcContext,
          name: "username",
          label,
          value: auth?.attemptedUsername,
          autocomplete: "username",
          autofocus: true
        })}
        ${submitButton(msgStr("doSubmit"))}
      </form>
    `
  });
}
