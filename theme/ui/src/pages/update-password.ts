import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-password-field";
import "@openremote/or-vaadin-components/or-vaadin-checkbox";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { cancelButton, field, layout, submitButton } from "../layout";

export const pageId = "login-update-password.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, username, isAppInitiatedAction, messagesPerField } = kcContext;
  const { msgStr } = i18n;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("updatePasswordTitle"),
    displayMessage: !messagesPerField.existsError("password", "password-confirm"),
    content: html`
      <form id="kc-passwd-update-form" action=${url.loginAction} method="post">
        <!-- Hidden username/current-password pair so password managers can associate the
             change with the right account and offer to update the stored entry. -->
        <input
          type="text"
          id="username"
          name="username"
          .value=${username ?? ""}
          autocomplete="username"
          readonly
          style="display:none"
        />
        <input
          type="password"
          id="password"
          name="password"
          autocomplete="current-password"
          style="display:none"
        />

        ${field({
          kcContext,
          name: "password-new",
          label: msgStr("passwordNew"),
          type: "password",
          autocomplete: "new-password",
          autofocus: true,
          errorFields: ["password", "password-confirm"]
        })}
        ${field({
          kcContext,
          name: "password-confirm",
          label: msgStr("passwordConfirm"),
          type: "password",
          autocomplete: "new-password"
        })}
        ${isAppInitiatedAction
          ? html`<or-vaadin-checkbox class="or-field">
              <label slot="label" for="logout-sessions">${msgStr("logoutOtherSessions")}</label>
              <input
                slot="input"
                id="logout-sessions"
                name="logout-sessions"
                type="checkbox"
                value="on"
                checked
              />
            </or-vaadin-checkbox>`
          : null}
        <div class="or-actions">
          ${submitButton(msgStr("doSubmit"))}
          ${isAppInitiatedAction ? cancelButton(msgStr("doCancel")) : null}
        </div>
      </form>
    `
  });
}
