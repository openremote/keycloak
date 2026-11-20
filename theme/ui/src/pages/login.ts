import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-password-field";
import "@openremote/or-vaadin-components/or-vaadin-checkbox";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { field, layout, submitButton, usernameLabel } from "../layout";

/** Narrowed to this page: kcContext is a discriminated union keyed on pageId. */
export const pageId = "login.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, realm, login, social, auth, usernameHidden, registrationDisabled, messagesPerField } =
    kcContext;
  const { msgStr } = i18n;

  const label = usernameLabel(realm, i18n);

  /*
   * Keycloak sets usernameHidden when the flow already knows who is logging in: a
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
                    label,
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
                // When the username is not asked for, this is the first field, so it takes focus -
                // as it does in Keycloak's own template (`autofocus=usernameHidden??`).
                autofocus: !showUsername,
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
              <!-- In the design, Sign in, Forgot password and the register prompt are one
                   group 16px apart, rather than separate blocks on the card's 24px rhythm.
                   Order matters and is the design's: the register prompt sits above the
                   identity providers, not below them. -->
              <div class="or-actions">
                ${submitButton(msgStr("doLogIn"), "login")}
                ${realm.resetPasswordAllowed
                  ? html`<p class="or-card__aside">
                      <a class="or-link" href=${url.loginResetCredentialsUrl}
                        >${msgStr("doForgotPassword")}</a
                      >
                    </p>`
                  : null}
                <!-- Only rendered when the realm actually allows registration. -->
                ${realm.registrationAllowed && !registrationDisabled
                  ? html`<p class="or-card__aside">
                      ${msgStr("noAccount")}
                      <a class="or-link" href=${url.registrationUrl}>${msgStr("doRegister")}</a>
                    </p>`
                  : null}
              </div>
            </form>
          `
        : null}
      ${realm.password && social?.providers?.length
        ? socialProviders(social.providers, url.resourcesPath, i18n)
        : null}
    `
  });
}

type Provider = NonNullable<NonNullable<PageContext["social"]>["providers"]>[number];

/*
 * The identity providers, laid out and labelled as Keycloak's own login page does: up to three
 * as a full-width list under "or", each button saying what it does, and more than that as a grid
 * under a label of its own, where a button only has room for the provider's name.
 *
 * One form per provider, posting to its login URL, so that each is the design system's submit
 * button. Keycloak's own page links there instead; the URL takes a POST as well as a GET.
 */
function socialProviders(providers: Provider[], resourcesPath: string, i18n: I18n): TemplateResult {
  const { msgStr } = i18n;
  const grid = providers.length > 3;

  return html`
    <div id="kc-social-providers" class="or-social">
      <p class="or-social__label">${msgStr(grid ? "identity-provider-login-label-divider" : "orLabel")}</p>
      <div class="or-social__providers ${grid ? "or-social__providers--grid" : ""}">
        ${providers.map(
          provider => html`
            <form action=${provider.loginUrl} method="post">
              ${submitButton(
                grid ? provider.displayName : msgStr("signInWithProvider", provider.displayName),
                undefined,
                undefined,
                "secondary",
                providerIcon(provider.providerId, resourcesPath)
              )}
            </form>
          `
        )}
      </div>
    </div>
  `;
}

/* The providers Keycloak's login page has an icon of its own for. Any other gets its generic one. */
const ICONS = new Set([
  "bitbucket",
  "facebook",
  "github",
  "gitlab",
  "google",
  "instagram",
  "linkedin-openid-connect",
  "microsoft",
  "openshift-v4",
  "paypal",
  "stackoverflow",
  "twitter"
]);

/* The icons drawn in black, which Keycloak also has a light version of for a dark page. */
const DARK_ICONS = new Set(["default", "github", "instagram", "twitter"]);

/*
 * The provider's icon, Keycloak's own. Our theme has none of these, and Keycloak serves a resource
 * our theme lacks from the parent theme, so they are found under our resources path. A parent theme
 * without them leaves the button with its label alone.
 */
function providerIcon(providerId: string, resourcesPath: string): TemplateResult {
  const name = ICONS.has(providerId) ? providerId : "default";
  const image = (file: string, variant: string) =>
    html`<img
      slot="prefix"
      class="or-social__icon ${variant}"
      src="${resourcesPath}/img/social/${file}.svg"
      alt=""
      @error=${hide}
    />`;

  if (!DARK_ICONS.has(name)) {
    return image(name, "");
  }

  return html`${image(name, "or-social__icon--on-light")}${image(`${name}-light`, "or-social__icon--on-dark")}`;
}

function hide(event: Event): void {
  (event.currentTarget as HTMLElement).hidden = true;
}
