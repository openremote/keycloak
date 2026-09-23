import { html, type TemplateResult } from "lit";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { layout } from "../layout";

export const pageId = "login-page-expired.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * Shown when the login page has been open longer than the realm's login timeout, so the
 * authentication session behind it is gone. Reachable from every flow - leave any login page
 * on screen long enough and this is what the next click lands on - which is why it is worth
 * having rather than falling through to Keycloak's own theme.
 *
 * The two links are not alternatives to each other in the way they read. `loginAction`
 * continues the *existing* browser session's flow, which works when the user has since logged
 * in in another tab; `loginRestartFlowUrl` throws it away and starts again. Keycloak offers
 * both because it cannot tell which happened, and so do we.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url } = kcContext;
  const { msgStr } = i18n;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("pageExpiredTitle"),
    content: html`
      <div class="or-prose">
        <p>
          ${msgStr("pageExpiredMsg1")}
          <a class="or-link" href=${url.loginRestartFlowUrl}>${msgStr("doClickHere")}</a>.
        </p>
        <p>
          ${msgStr("pageExpiredMsg2")}
          <a class="or-link" href=${url.loginAction}>${msgStr("doClickHere")}</a>.
        </p>
      </div>
    `
  });
}
