import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { layout, resolvedHeading } from "../layout";

export const pageId = "info.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * Keycloak's general-purpose "here is what happened" page. It is not in the design, but it is
 * not a rare corner either - it is what a user sees at the end of several ordinary flows:
 *
 *   "Your account has been updated."        after a required action completes
 *   "Perform the following action(s)"       after following an action-token email link
 *
 * plus email verification and account-deletion confirmations. Left unimplemented it fell
 * through to Keycloak's own theme, so those flows ended on an unbranded page.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { message, messageHeader, requiredActions, skipLink, pageRedirectUri, actionUri, client } =
    kcContext;
  const { msgStr, advancedMsgStr } = i18n;

  /*
   * requiredActions are Keycloak's own action names (UPDATE_PASSWORD, CONFIGURE_TOTP, ...),
   * which resolve through the message bundle. advancedMsgStr rather than msgStr because the
   * key is built at runtime and a realm may have an action we do not know about.
   */
  const actions = requiredActions
    ?.map(action => advancedMsgStr(`requiredAction.${action}`))
    .join(", ");

  /*
   * Where to send the user next, in Keycloak's own order of preference. skipLink means the
   * flow deliberately ends here - typically because the browser tab is not where the user
   * continues - so offering a link would be wrong.
   */
  const next = ((): { href: string; label: string } | undefined => {
    if (skipLink) {
      return undefined;
    }

    if (pageRedirectUri) {
      return { href: pageRedirectUri, label: msgStr("backToApplication") };
    }

    if (actionUri) {
      return { href: actionUri, label: msgStr("proceedWithAction") };
    }

    if (client?.baseUrl) {
      return { href: client.baseUrl, label: msgStr("backToApplication") };
    }

    return undefined;
  })();

  /*
   * The header is a message key (see resolvedHeading). When it cannot be resolved, message.summary
   * is the right thing to show instead: the server rendered it, it is already localized, and on
   * this page it says the same thing the header would have.
   */
  const heading = resolvedHeading(messageHeader, advancedMsgStr) ?? message.summary;

  return layout({
    kcContext,
    i18n,
    heading,
    // The heading carries message.summary, so the alert would say it twice.
    displayMessage: false,
    // Only when it would not simply repeat the heading.
    intro: heading === message.summary ? undefined : message.summary,
    content: html`
      ${actions ? html`<p class="or-card__lead">${actions}</p>` : null}
      ${next
        ? html`<p class="or-card__aside">
            <a class="or-link" href=${next.href}>${next.label}</a>
          </p>`
        : null}
    `
  });
}
