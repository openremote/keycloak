<#import "template.ftl" as layout>

<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp'); section>

  <#if section="header">
    ${msg("doLogIn")}
  <#elseif section="form">
    <form id="kc-otp-login-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">

      <#if otpLogin.userOtpCredentials?size gt 1>
        <div class="${properties.kcFormGroupClass!}">
          <div class="${properties.kcInputWrapperClass!}">
            <label>${msg("select2faDevice", "Select your 2FA device")}</label>
            <div id="kc-otp-credential-box">
              <#list otpLogin.userOtpCredentials as otpCredential>
                <div>
                  <input id="kc-otp-credential-${otpCredential?index}" class="${properties.kcLoginOTPListInputClass!}" type="radio" name="selectedCredentialId" value="${otpCredential.id}" <#if otpCredential.id == otpLogin.selectedCredentialId>checked="checked"</#if>>
                  <label for="kc-otp-credential-${otpCredential?index}" class="${properties.kcLoginOTPListClass!}" tabindex="${otpCredential?index}">
                    <span class="${properties.kcLoginOTPListItemHeaderClass!}">
                      <span class="${properties.kcLoginOTPListItemIconBodyClass!}">
                        <i class="${properties.kcLoginOTPListItemIconClass!}" aria-hidden="true"></i>
                      </span>
                      <span class="${properties.kcLoginOTPListItemTitleClass!}">${otpCredential.userLabel}</span>
                    </span>
                  </label>
                </div>
              </#list>
            </div>
          </div>
        </div>
      </#if>

      <div class="${properties.kcFormGroupClass!}" style="margin-top: 24px;">
        <div class="input-field ${properties.kcLabelWrapperClass!}">
          <input id="otp" name="otp" autocomplete="off" type="text" class="${properties.kcInputClass!}" autofocus aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>" dir="ltr" />
          <label for="otp" class="${properties.kcLabelClass!}">${msg("loginOtpOneTime")}</label>
          <#if messagesPerField.existsError('totp')>
            <span id="input-error-otp-code" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
              ${kcSanitize(messagesPerField.get('totp'))?no_esc}
            </span>
          </#if>
        </div>
      </div>

      <div class="${properties.kcFormGroupClass!}">
        <div id="kc-form-buttons" class="col s12 center-align ${properties.kcFormButtonsClass!}">
          <button type="submit" class="btn waves-effect waves-light" id="kc-login">${msg("doLogIn")}
            <i class="material-icons right">send</i>
          </button>
        </div>
      </div>

    </form>
  </#if>

</@layout.registrationLayout>
