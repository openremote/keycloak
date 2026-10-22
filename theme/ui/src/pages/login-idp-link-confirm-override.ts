import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { layout, submitButton } from "../layout";

export const pageId = "login-idp-link-confirm-override.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * First broker login, when the local account being linked is already linked to a different
 * account at the same provider. This is Keycloak's "Confirm override existing link" step, which
 * the default first broker login flow does not include: a realm adds it to a flow of its own.
 *
 * The question ("...your account is already linked with different Google account x. Can you
 * confirm if you want to replace the existing link with the new account?") arrives as
 * kcContext.message, so the layout's alert carries it and this page is the two answers.
 * Overriding posts `submitAction`; declining is restarting the login, which is a link.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, idpDisplayName } = kcContext;
  const { msgStr } = i18n;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("confirmOverrideIdpTitle"),
    content: html`
      <form id="kc-idp-link-confirm-override-form" action=${url.loginAction} method="post">
        <div class="or-actions">
          <!-- The argument is unused by the English message but is what Keycloak passes. -->
          ${submitButton(
            msgStr("confirmOverrideIdpContinue", idpDisplayName),
            "submitAction",
            "confirmOverride"
          )}
          <p class="or-card__aside">
            ${msgStr("pageExpiredMsg1")}
            <a class="or-link" href=${url.loginRestartFlowUrl}>${msgStr("doClickHere")}</a>
          </p>
        </div>
      </form>
    `
  });
}
