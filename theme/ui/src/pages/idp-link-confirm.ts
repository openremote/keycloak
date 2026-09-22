import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { layout, submitButton } from "../layout";

export const pageId = "login-idp-link-confirm.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * First broker login, step one: someone signed in through an identity provider and the email
 * that came back already belongs to a local account.
 *
 * The question itself - "User with email x already exists. How do you want to continue?" -
 * arrives as kcContext.message, so the layout's alert is the whole of the prose here and this
 * page is only the two answers.
 *
 * Both are POSTs to the same action distinguished by `submitAction`, which is why they are
 * submit buttons in one form rather than links.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, idpAlias, idpDisplayName, hideReviewButton } = kcContext;
  const { msgStr } = i18n;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("confirmLinkIdpTitle"),
    content: html`
      <form id="kc-idp-link-confirm-form" action=${url.loginAction} method="post">
        <div class="or-actions">
          <!--
            Keycloak renders these the other way round and gives neither precedence. Linking is
            made the primary action because it is the one the flow exists to offer: the user
            has just proved they own the provider account, and reviewing the profile is the
            detour. The design's Actions frame pairs exactly one primary with one tertiary.

            The argument is unused by the English message ("Add to existing account") but not by
            every translation, and it is what Keycloak passes.
          -->
          ${submitButton(
            msgStr("confirmLinkIdpContinue", idpDisplayName ?? idpAlias),
            "submitAction",
            "linkAccount"
          )}
          ${hideReviewButton
            ? null
            : submitButton(
                msgStr("confirmLinkIdpReviewProfile"),
                "submitAction",
                "updateProfile",
                "tertiary"
              )}
        </div>
      </form>
    `
  });
}
