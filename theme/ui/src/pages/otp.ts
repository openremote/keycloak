import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-radio-group";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { field, layout, submitButton } from "../layout";

export const pageId = "login-otp.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/** 2FA login. */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, otpLogin } = kcContext;
  const { msgStr } = i18n;
  const credentials = otpLogin.userOtpCredentials;

  return layout({
    kcContext,
    heading: msgStr("loginAccountTitle"),
    back: { href: url.loginRestartFlowUrl, label: msgStr("backToLoginCredentials") },
    content: html`
      <form id="kc-otp-login-form" action=${url.loginAction} method="post">
        <!--
          Not in the design, and only rendered when the account has more than one OTP
          credential registered - the design shows the single-device case, which matches.
          Keycloak posts selectedCredentialId to decide which device to verify against;
          without this, a user with a phone and a tablet cannot choose and is silently
          verified against whichever Keycloak defaulted to.
        -->
        ${credentials.length > 1
          ? html`
              <or-vaadin-radio-group class="or-field" id="kc-otp-credential-box">
                <label slot="label">${msgStr("select2faDevice")}</label>
                ${credentials.map(
                  (credential, index) => html`
                    <vaadin-radio-button>
                      <!-- userLabel is whatever the user typed as the device name during
                           setup, and Keycloak lets that be blank - which renders a radio with
                           no visible or accessible label at all. Fall back to a position. -->
                      <label slot="label" for=${`kc-otp-credential-${index}`}>
                        ${credential.userLabel?.trim() ||
                        msgStr("otpDeviceFallback", String(index + 1))}
                      </label>
                      <input
                        slot="input"
                        id=${`kc-otp-credential-${index}`}
                        type="radio"
                        name="selectedCredentialId"
                        value=${credential.id}
                        ?checked=${credential.id === otpLogin.selectedCredentialId}
                      />
                    </vaadin-radio-button>
                  `
                )}
              </or-vaadin-radio-group>
            `
          : null}
        ${field({
          kcContext,
          name: "otp",
          label: msgStr("authenticatorCode"),
          autocomplete: "one-time-code",
          numeric: true,
          autofocus: true,
          // Keycloak reports OTP errors under the "totp" field, not "otp".
          errorFields: ["totp"]
        })}
        ${submitButton(msgStr("doSubmit"))}
      </form>
    `
  });
}
