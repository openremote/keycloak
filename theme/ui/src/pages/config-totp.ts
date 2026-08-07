import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-button";
import "@openremote/or-vaadin-components/or-vaadin-checkbox";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { cancelButton, field, layout, submitButton } from "../layout";

export const pageId = "login-config-totp.ftl";

type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

/*
 * 2FA signup.
 *
 * totp.supportedApplications holds message *keys* ("totpAppFreeOTPName" and friends), as does
 * the policy type ("totp"/"hotp", looked up as "loginTotp.totp"). i18n.advancedMsgStr is the
 * variable-key form: it looks the key up and returns it unchanged when there is no
 * translation, so an application Keycloak adds later degrades to its key rather than
 * disappearing.
 *
 * Careful with comments inside an html`` template: `${...}` in one is a real interpolation,
 * not documentation, and the compiler will try to evaluate it.
 */
export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  const { url, totp, mode, isAppInitiatedAction, messagesPerField } = kcContext;
  const { msgStr, advancedMsgStr } = i18n;

  const installStep = html`
    <li>
      <p>${msgStr("loginTotpStep1")}</p>
      <ul class="or-steps__apps">
        ${totp.supportedApplications.map(app => html`<li>${advancedMsgStr(app)}</li>`)}
      </ul>
    </li>
  `;

  const finishSteps = html`
    <li>
      <p>${msgStr("loginTotpStep3")}</p>
    </li>
    <li>
      <p>${msgStr("loginTotpStep3DeviceName")}</p>
    </li>
  `;

  /*
   * The barcode variant deliberately closes the list, emits the code, then resumes at 3.
   *
   * Nesting the code inside step 2 indented it by the list's own padding, so it lined up
   * with the step text instead of the numbers. Sitting between the lists it starts at the
   * same edge as the markers, as in the design. `start` keeps the numbering continuous.
   */
  const steps =
    mode === "manual"
      ? html`
          <ol class="or-steps">
            ${installStep}
            <li>
              <p>${msgStr("loginTotpManualStep2")}</p>
              <p><code class="or-code">${totp.totpSecretEncoded}</code></p>
              <p><a class="or-link" href=${totp.qrUrl}>${msgStr("loginTotpScanBarcode")}</a></p>
            </li>
            <li>
              <p>${msgStr("loginTotpManualStep3")}</p>
              <ul class="or-steps__meta">
                <li>
                  ${msgStr("loginTotpType")}: ${advancedMsgStr(`loginTotp.${totp.policy.type}`)}
                </li>
                <!-- getAlgorithmKey(), not algorithm: the latter is the JCA name ("HmacSHA1"),
                     the former is what an authenticator app asks for ("SHA1"). Keycloak's own
                     template shows the key, and this is the value the user types in. -->
                <li>${msgStr("loginTotpAlgorithm")}: ${totp.policy.getAlgorithmKey()}</li>
                <li>${msgStr("loginTotpDigits")}: ${totp.policy.digits}</li>
                ${totp.policy.type === "totp"
                  ? html`<li>${msgStr("loginTotpInterval")}: ${totp.policy.period}</li>`
                  : html`<li>${msgStr("loginTotpCounter")}: ${totp.policy.initialCounter}</li>`}
              </ul>
            </li>
            ${finishSteps}
          </ol>
        `
      : html`
          <ol class="or-steps">
            ${installStep}
            <li><p>${msgStr("loginTotpStep2")}</p></li>
          </ol>

          <!-- The design places the fallback link beside the code, not beneath it. -->
          <div class="or-qr-row">
            <!-- The image is oversized inside this box and the box clips it, which is how the
                 quiet zone Keycloak bakes in gets cropped off. See .or-qr in login.css. -->
            <span class="or-qr">
              <img
                class="or-qr__code"
                alt=${msgStr("loginTotpStep2")}
                src=${`data:image/png;base64,${totp.totpSecretQrCode}`}
              />
            </span>
            <a class="or-link" href=${totp.manualUrl}>${msgStr("loginTotpUnableToScan")}</a>
          </div>

          <ol class="or-steps" start="3">${finishSteps}</ol>
        `;

  return layout({
    kcContext,
    i18n,
    heading: msgStr("loginTotpTitle"),
    displayMessage: !messagesPerField.existsError("totp", "userLabel"),
    // Keycloak warns "You need to set up Mobile Authenticator to activate your account",
    // which the heading and steps below already say and the design has no banner for.
    suppressWarning: true,
    /* Grouped with the heading, not placed after it: in the design the steps and the title
       are one frame on an 8px rhythm, while the card's own blocks are 24px apart. The
       wrapper is what keeps the code tight against the steps either side of it. */
    intro: html`<div class="or-steps-block">${steps}</div>`,
    content: html`
      <form id="kc-totp-settings-form" action=${url.loginAction} method="post">
        ${field({
          kcContext,
          name: "totp",
          label: msgStr("authenticatorCode"),
          autocomplete: "one-time-code",
          numeric: true,
          autofocus: true
        })}
        <input type="hidden" id="totpSecret" name="totpSecret" value=${totp.totpSecret} />
        ${mode ? html`<input type="hidden" id="mode" name="mode" value=${mode} />` : null}
        ${field({
          kcContext,
          name: "userLabel",
          label: msgStr("loginTotpDeviceName"),
          /* Keycloak requires a device name only once there is more than one device to tell
             apart: its own template marks the field with an asterisk under exactly this
             condition (`totp.otpCredentials?size gte 1`), and the server validates it the same
             way. Hardcoding false let the form submit something the server would reject. */
          required: totp.otpCredentials.length >= 1,
          errorFields: ["userLabel"]
        })}
        <!-- Keycloak offers this on every credential-setup page - name and checked belong on
             the component, see field(). Left unchecked, as Keycloak's own template has it:
             signing the user out of their other devices is not something to do by default. -->
        <or-vaadin-checkbox class="or-field" name="logout-sessions" value="on">
          <label slot="label">${msgStr("logoutOtherSessions")}</label>
          <input slot="input" type="checkbox" />
        </or-vaadin-checkbox>
        <div class="or-actions">
          ${submitButton(msgStr("doSubmit"))}
          ${isAppInitiatedAction ? cancelButton(msgStr("doCancel")) : null}
        </div>
      </form>
    `
  });
}
