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
  const { url, realm, login, social, auth, usernameHidden, registrationDisabled, messagesPerField } =
    kcContext;
  const { msgStr } = i18n;

  const usernameLabel = !realm.loginWithEmailAllowed
    ? msgStr("username")
    : !realm.registrationEmailAsUsername
      ? msgStr("usernameOrEmail")
      : msgStr("email");

  /*
   * Keycloak sets usernameHidden when the flow already knows who is logging in - a
   * re-authentication, or an identity-provider link. It expects the username field to be gone
   * entirely, not merely disabled: rendering it again invites the user to change an identity
   * the flow has already fixed, and "Remember me" is meaningless at that point.
   */
  const showUsername = !usernameHidden;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("loginAccountTitle"),
    // Mirrors Keycloak's own login.ftl: the alert would otherwise repeat the error that
    // field() already renders against the credentials.
    displayMessage: !messagesPerField.existsError("username", "password"),
    content: html`
      ${realm.password
        ? html`
            <form id="kc-form-login" action=${url.loginAction} method="post">
              ${showUsername
                ? field({
                    kcContext,
                    name: "username",
                    label: usernameLabel,
                    value: login.username,
                    autocomplete: "username",
                    autofocus: true,
                    errorFields: ["username", "password"]
                  })
                : null}
              ${field({
                kcContext,
                name: "password",
                label: msgStr("password"),
                type: "password",
                autocomplete: "current-password",
                // With the username gone this field is the only place the error can land.
                errorFields: ["username", "password"]
              })}
              ${realm.rememberMe && showUsername
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
              <!-- Which credential the user picked on a "try another way" screen. Keycloak
                   posts it back so the flow verifies against that one; dropping it silently
                   falls back to whichever credential Keycloak considers default. -->
              <input
                type="hidden"
                id="id-hidden-input"
                name="credentialId"
                .value=${auth?.selectedCredential ?? ""}
              />
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
      <!-- Not in the design, whose login card ends at "Forgot password?" - but without it a
           realm with self-registration enabled has no way into the register page, which the
           old theme and Keycloak's own both offer. Only rendered when the realm allows it. -->
      ${realm.password && realm.registrationAllowed && !registrationDisabled
        ? html`<p class="or-card__info">
            ${msgStr("noAccount")}
            <a class="or-link" href=${url.registrationUrl}>${msgStr("doRegister")}</a>
          </p>`
        : null}
    `
  });
}
