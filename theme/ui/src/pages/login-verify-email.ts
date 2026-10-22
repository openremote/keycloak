import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { cancelButton, layout, submitButton } from "../layout";

export const pageId = "login-verify-email.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * The VERIFY_EMAIL required action: after registering, after a first sign-in through an identity
 * provider whose email the realm does not trust, or when an application asks for it.
 *
 * Keycloak sends `verifyEmail`, the address, once the mail has gone out. When an application
 * asked for the action, it waits to be asked before sending: an application-initiated action gets
 * Send and Cancel, and otherwise the link sends it. That link, a GET of the login action, is also
 * how a mail already sent goes out again.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, user, verifyEmail, isAppInitiatedAction } = kcContext;
  const { msgStr } = i18n;
  const sent = verifyEmail !== undefined;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("emailVerifyTitle"),
    /*
     * Keycloak's own template drops the warning on every application-initiated action: "You need
     * to verify your email address to activate your account" is for a user the flow stopped, not
     * one who asked.
     */
    suppressWarning: isAppInitiatedAction,
    content: html`
      <div class="or-prose">
        <p>
          ${sent
            ? msgStr("emailVerifyInstruction1", verifyEmail)
            : msgStr("emailVerifyInstruction4", user?.email ?? "")}
        </p>
      </div>
      ${isAppInitiatedAction
        ? html`<form id="kc-verify-email-form" action=${url.loginAction} method="post">
            <div class="or-actions">
              <!-- Keycloak gives re-sending less weight than the first send: the mail is
                   usually on its way already. -->
              ${sent
                ? submitButton(msgStr("emailVerifyResend"), undefined, undefined, "secondary")
                : submitButton(msgStr("emailVerifySend"))}
              ${cancelButton(msgStr("doCancel"))}
            </div>
          </form>`
        : /* Keycloak's info section: a centered band set off below the page, with the line break
             its template puts before the link. */
          html`<hr class="or-divider" />
            <p class="or-card__aside">
              ${msgStr("emailVerifyInstruction2")}<br />
              <a class="or-link" href=${url.loginAction}>${msgStr("doClickHere")}</a>
              ${msgStr("emailVerifyInstruction3")}
            </p>`}
    `
  });
}
