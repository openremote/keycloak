import { html, type TemplateResult } from "lit";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { layout } from "../layout";

export const pageId = "error.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * Note this page renders no message of its own. On error.ftl kcContext.message *is* the
 * content, and layout() already surfaces it: rendering it here too printed the same
 * sentence twice, once in the alert and once as body text. The alert is the one to keep: it
 * carries message.type, which a plain paragraph throws away.
 *
 * skipLink is set by Keycloak when the flow deliberately ends here and there is nowhere to
 * send the user back to, so the link is dropped even though the client has a base URL.
 *
 * traceId arrives only when tracing is enabled on the server (KC_TRACING_ENABLED). It is
 * what support asks for, so it belongs on screen rather than only in the server log.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { client, skipLink, traceId } = kcContext;
  const { msgStr } = i18n;

  const backToApplication =
    !skipLink && client?.baseUrl
      ? html`<p class="or-card__aside">
          <a class="or-link" href=${client.baseUrl}>${msgStr("backToApplication")}</a>
        </p>`
      : null;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("errorTitle"),
    content: html`
      ${traceId
        ? html`<p class="or-prose" id="traceId">${msgStr("traceIdSupportMessage", traceId)}</p>`
        : null}
      ${backToApplication}
    `
  });
}
