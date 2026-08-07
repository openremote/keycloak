import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-radio-group";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { field, layout, submitButton } from "../layout";

export const pageId = "login-otp.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/**
 * Mirrors the radio group's selection into the hidden input that actually gets posted.
 *
 * The group owns the state; the input is only a carrier, for the same reason the submit
 * buttons have one - the Vaadin component does not participate in form submission itself.
 */
function syncSelectedCredential(event: Event): void {
  const group = event.currentTarget as HTMLElement & { value?: string };
  const carrier = group
    .closest("form")
    ?.querySelector<HTMLInputElement>('input[name="selectedCredentialId"]');

  if (carrier && typeof group.value === "string") {
    carrier.value = group.value;
  }
}

/** 2FA login. */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, otpLogin } = kcContext;
  const { msgStr } = i18n;
  const credentials = otpLogin.userOtpCredentials;
  const selectedCredentialId = otpLogin.selectedCredentialId ?? credentials[0]?.id ?? "";

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
              <!--
                The selection is carried by the hidden input, not by the radios themselves.
                Unlike the text fields, a slotted native <input> is no use here: Vaadin's
                radio-group rewrites the name of every radio it owns to one generated group
                name and RadioButton resets the value to "on", so a light-DOM
                name="selectedCredentialId" value="<id>" is silently destroyed on upgrade and
                the form posts nothing Keycloak recognizes.
              -->
              <input
                type="hidden"
                name="selectedCredentialId"
                .value=${selectedCredentialId}
              />
              <or-vaadin-radio-group
                class="or-field"
                id="kc-otp-credential-box"
                .value=${selectedCredentialId}
                @value-changed=${syncSelectedCredential}
              >
                <label slot="label">${msgStr("select2faDevice")}</label>
                ${credentials.map(
                  (credential, index) => html`
                    <vaadin-radio-button value=${credential.id}>
                      <!-- userLabel is whatever the user typed as the device name during
                           setup, and Keycloak lets that be blank - which renders a radio with
                           no visible or accessible label at all. Fall back to a position. -->
                      <label slot="label">
                        ${credential.userLabel?.trim() ||
                        msgStr("otpDeviceFallback", String(index + 1))}
                      </label>
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
