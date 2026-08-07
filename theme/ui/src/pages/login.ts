import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-password-field";
import "@openremote/or-vaadin-components/or-vaadin-checkbox";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { field, layout, submitButton } from "../layout";

/** Narrowed to this page: kcContext is a discriminated union keyed on pageId. */
export const pageId = "login.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, realm, login, social } = kcContext;
  const { msgStr } = i18n;

  const usernameLabel = !realm.loginWithEmailAllowed
    ? msgStr("username")
    : !realm.registrationEmailAsUsername
      ? msgStr("usernameOrEmail")
      : msgStr("email");

  return layout({
    kcContext,
    heading: msgStr("loginAccountTitle"),
    content: html`
      ${realm.password
        ? html`
            <form id="kc-form-login" action=${url.loginAction} method="post">
              ${field({
                kcContext,
                name: "username",
                label: usernameLabel,
                value: login.username,
                autocomplete: "username",
                autofocus: true,
                errorFields: ["username", "password"]
              })}
              ${field({
                kcContext,
                name: "password",
                label: msgStr("password"),
                type: "password",
                autocomplete: "current-password",
                errorFields: ["username", "password"]
              })}
              ${realm.rememberMe
                ? html`<!-- name and checked belong on the component; Vaadin manages the
                            slotted input and drops anything it did not set. See field(). -->
                    <or-vaadin-checkbox
                      class="or-field"
                      name="rememberMe"
                      value="on"
                      ?checked=${!!login.rememberMe}
                    >
                      <label slot="label">${msgStr("rememberMe")}</label>
                      <input slot="input" type="checkbox" />
                    </or-vaadin-checkbox>`
                : null}
              <!-- The design's "Actions" frame: the button and the link are one group 16px
                   apart, rather than two blocks on the card's 24px rhythm. -->
              <div class="or-actions">
                ${submitButton(msgStr("doLogIn"), "login")}
                ${realm.resetPasswordAllowed
                  ? html`<p class="or-card__aside">
                      <a class="or-link" href=${url.loginResetCredentialsUrl}
                        >${msgStr("doForgotPassword")}</a
                      >
                    </p>`
                  : null}
              </div>
            </form>
          `
        : null}
      ${realm.password && social?.providers?.length
        ? html`
            <div id="kc-social-providers" class="or-social">
              <div class="or-social__divider">
                <span>${msgStr("identityProviderLoginLabel")}</span>
              </div>
              <!-- One form per provider rather than a link: Keycloak expects a POST to the
                   provider's login URL. -->
              ${social.providers.map(
                provider => html`
                  <form action=${provider.loginUrl} method="post">
                    ${submitButton(provider.displayName, undefined, undefined, "secondary")}
                  </form>
                `
              )}
            </div>
          `
        : null}
    `
    // No "New user? Register" footer: the design's login card ends at "Forgot password?" and
    // registration is reached from the application, not from here.
  });
}
