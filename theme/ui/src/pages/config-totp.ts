import { html, type TemplateResult } from "lit";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-button";
import type { I18n } from "../i18n";
import type { KcContext } from "../login/KcContext";
import { field, layout, submitButton } from "../layout";

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
  const { url, totp, mode, isAppInitiatedAction } = kcContext;
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
                <li>${msgStr("loginTotpAlgorithm")}: ${totp.policy.algorithm}</li>
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
            <img
              class="or-qr"
              alt=${msgStr("loginTotpStep2")}
              src=${`data:image/png;base64,${totp.totpSecretQrCode}`}
            />
            <a class="or-link" href=${totp.manualUrl}>${msgStr("loginTotpUnableToScan")}</a>
          </div>

          <ol class="or-steps" start="3">${finishSteps}</ol>
        `;

  return layout({
    kcContext,
    heading: msgStr("loginTotpTitle"),
    // Keycloak warns "You need to set up Mobile Authenticator to activate your account",
    // which the heading and steps below already say and the design has no banner for.
    suppressWarning: true,
    back: { href: url.loginUrl, label: msgStr("backToLogin") },
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
          required: false,
          errorFields: ["userLabel"]
        })}
        <div class="or-actions">
          ${submitButton(msgStr("doSubmit"))}
          <!-- Only for app-initiated actions: Keycloak detects the cancel by the presence of
               this parameter, which is why the native button carries the name/value. -->
          ${isAppInitiatedAction
            ? submitButton(msgStr("doCancel"), "cancel-aia", "true", "tertiary")
            : null}
        </div>
      </form>
    `
  });
}
