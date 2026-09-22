import { html, type TemplateResult } from "lit";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { layout } from "../layout";

export const pageId = "login-idp-link-email.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * First broker login, step two: the realm verifies the duplicate email before linking, so it
 * has sent a mail and this page is what the browser waits on.
 *
 * Both links go to the same URL, which is Keycloak's design rather than a mistake here: a GET
 * of the login action re-sends the mail, and it is also how a user who verified in another
 * browser gets this tab moving again.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, realm, idpAlias, idpDisplayName, brokerContext } = kcContext;
  const { msgStr } = i18n;
  const provider = idpDisplayName ?? idpAlias;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("emailLinkIdpTitle", provider),
    content: html`
      <div class="or-prose">
        <p>
          ${msgStr("emailLinkIdp1", provider, brokerContext.username, realm.displayName)}
        </p>
        <p>
          ${msgStr("emailLinkIdp2")}
          <a class="or-link" href=${url.loginAction}>${msgStr("doClickHere")}</a>
          ${msgStr("emailLinkIdp3")}
        </p>
        <p>
          ${msgStr("emailLinkIdp4")}
          <a class="or-link" href=${url.loginAction}>${msgStr("doClickHere")}</a>
          ${msgStr("emailLinkIdp5")}
        </p>
      </div>
    `
  });
}
