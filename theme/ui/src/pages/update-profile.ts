import { html, type TemplateResult } from "lit";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { cancelButton, layout, submitButton } from "../layout";
import { profileFields } from "../profile";

export const pageId = "login-update-profile.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * The UPDATE_PROFILE required action: same profile form as idp-review-user-profile, reached
 * either because an administrator set the action on the account or because an application
 * deep-linked to it with kc_action.
 *
 * It is here rather than folded into that page because the two are separate pageIds with
 * separate headings and only this one can be cancelled - Keycloak offers the cancel exactly
 * when the application initiated the action, since only then is there something to go back to.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, isAppInitiatedAction, messagesPerField } = kcContext;
  const { msgStr } = i18n;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("loginProfileTitle"),
    displayMessage: messagesPerField.exists("global"),
    content: html`
      <form id="kc-update-profile-form" action=${url.loginAction} method="post">
        ${profileFields(kcContext, i18n)}
        <div class="or-actions">
          ${submitButton(msgStr("doSubmit"))}
          ${isAppInitiatedAction ? cancelButton(msgStr("doCancel")) : null}
        </div>
      </form>
    `
  });
}
