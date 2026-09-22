import { html, type TemplateResult } from "lit";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { layout, submitButton } from "../layout";
import { profileFields } from "../profile";

export const pageId = "idp-review-user-profile.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * First broker login, step zero: confirm the profile the provider handed over before an
 * account is created from it. Shown when the realm's Review Profile step is set to "on", or to
 * "missing" and the provider left something out - GitHub, for instance, gives no email at all
 * unless the app asked for the user:email scope.
 *
 * Same form as registration, minus everything registration adds: no password, no terms, no
 * captcha, because the provider has already authenticated the user.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, messagesPerField } = kcContext;
  const { msgStr } = i18n;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("loginIdpReviewProfileTitle"),
    // Keycloak's own template: every field renders its own error, so only genuinely global
    // messages belong in the alert.
    displayMessage: messagesPerField.exists("global"),
    content: html`
      <form id="kc-idp-review-profile-form" action=${url.loginAction} method="post">
        ${profileFields(kcContext, i18n)}
        <div class="or-actions">${submitButton(msgStr("doSubmit"))}</div>
      </form>
    `
  });
}
