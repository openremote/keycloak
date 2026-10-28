import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { cancelButton, layout, submitButton } from "../layout";

export const pageId = "link-idp-action.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * The idp_link required action: an application, or Keycloak's own account console, asked to link
 * the signed-in account with an identity provider. This page asks before the browser is sent
 * there.
 *
 * Continue and Cancel post to the same action, and Keycloak tells them apart by the presence of
 * `cancel-aia`. It reads nothing from `continue`, which is posted only because its own form
 * posts it.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, idpDisplayName } = kcContext;
  const { msgStr } = i18n;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("linkIdpActionTitle", idpDisplayName),
    intro: msgStr("linkIdpActionMessage", idpDisplayName),
    // As Keycloak's own template: a failed link is reported on an error page, not here.
    displayMessage: false,
    content: html`
      <form id="kc-link-idp-form" action=${url.loginAction} method="post">
        <div class="or-actions">
          ${submitButton(msgStr("doContinue"), "continue")}
          ${cancelButton(msgStr("doCancel"))}
        </div>
      </form>
    `
  });
}
