<#import "template.ftl" as layout>

<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp'); section>

  <#if section = "header">
    ${msg("loginTotpTitle")}
  <#elseif section = "form">
    <ol id="kc-totp-settings">

      <li>
        <p>${msg("loginTotpStep1")}</p>
        <ul id="kc-totp-supported-apps">
          <#list totp.supportedApplications as app>
            <li>${msg(app)}</li>
          </#list>
        </ul>
      </li>

      <#if mode?? && mode = "manual">
        <li>
          <p>${msg("loginTotpManualStep2")}</p>
          <p><span id="kc-totp-secret-key">${totp.totpSecretEncoded}</span></p>
          <p><a href="${totp.qrUrl}" id="mode-barcode">${msg("loginTotpScanBarcode")}</a></p>
        </li>
        <li>
          <p>${msg("loginTotpManualStep3")}</p>
          <p>
          <ul>
            <li id="kc-totp-type">${msg("loginTotpType")}: ${msg("loginTotp." + totp.policy.type)}</li>
            <li id="kc-totp-algorithm">${msg("loginTotpAlgorithm")}: ${totp.policy.getAlgorithmKey()}</li>
            <li id="kc-totp-digits">${msg("loginTotpDigits")}: ${totp.policy.digits}</li>
            <#if totp.policy.type = "totp">
              <li id="kc-totp-period">${msg("loginTotpInterval")}: ${totp.policy.period}</li>
            <#elseif totp.policy.type = "hotp">
              <li id="kc-totp-counter">${msg("loginTotpCounter")}: ${totp.policy.initialCounter}</li>
            </#if>
          </ul>
          </p>
        </li>
      <#else>
        <li>
          <p>${msg("loginTotpStep2")}</p>
          <img id="kc-totp-secret-qr-code" src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="Figure: Barcode"><br/>
          <p><a href="${totp.manualUrl}" id="mode-manual">${msg("loginTotpUnableToScan")}</a></p>
        </li>
      </#if>
      <li>
        <p>${msg("loginTotpStep3")}</p>
        <p>${msg("loginTotpStep3DeviceName")}</p>
      </li>
    </ol>

    <form action="${url.loginAction}" class=" ${properties.kcFormClass!}" id="kc-totp-settings-form" method="post">

      <div style="margin-top: 24px;" class="${properties.kcFormGroupClass!}">
        <div class="input-field ${properties.kcLabelWrapperClass!}">
          <input type="text" id="totp" name="totp" autocomplete="one-time-code" class="validate <#if messagesPerField.existsError('totp')>invalid</#if> ${properties.kcInputClass!}" aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>" inputmode="numeric" dir="ltr"/>
          <label for="totp" class="${properties.kcLabelClass!}">${msg("authenticatorCode")}</label>
          <#if messagesPerField.existsError('totp')>
            <span class="helper-text" data-error="${kcSanitize(messagesPerField.getFirstError('totp'))?no_esc}"></span>
          </#if>
        </div>
        <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
        <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>
      </div>

      <div class="${properties.kcFormGroupClass!}">
        <div class="input-field ${properties.kcLabelWrapperClass!}">
          <input type="text" class="validate <#if messagesPerField.existsError('userLabel')>invalid</#if> ${properties.kcInputClass!}" id="userLabel" name="userLabel" autocomplete="off" aria-invalid="<#if messagesPerField.existsError('userLabel')>true</#if>" dir="ltr"/>
          <label for="userLabel" class="${properties.kcLabelClass!}">${msg("loginTotpDeviceName")}</label>
          <#if messagesPerField.existsError('userLabel')>
            <span class="helper-text" data-error="${kcSanitize(messagesPerField.getFirstError('userLabel'))?no_esc}"></span>
          </#if>
        </div>
      </div>

      <div class="${properties.kcFormGroupClass!}">
        <div id="kc-form-buttons" class="col s12 center-align ${properties.kcFormButtonsClass!}">
          <button type="submit" class="btn waves-effect waves-light" id="saveTOTPBtn">${msg("doSubmit")}
            <i class="material-icons right">send</i>
          </button>
          <button type="submit" class="btn waves-effect waves-light" id="cancelTOTPBtn" name="cancel-aia" value="true">${msg("doCancel")}
            <i class="material-icons right">cancel</i>
          </button>
        </div>
      </div>

    </form>
  </#if>
</@layout.registrationLayout>
