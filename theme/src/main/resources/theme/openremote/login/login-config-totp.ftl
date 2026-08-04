<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#-- Warnings are suppressed here: on this page Keycloak's is "You need to set up Mobile
     Authenticator to activate your account", which the heading and the steps below already
     say, and the design has no banner. Errors still show. -->
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp','userLabel')
                                          && !(message?? && message.type == 'warning')
                            backHref=url.loginUrl backLabel=msg("backToLogin"); section>
    <#if section = "header">
        ${msg("loginTotpTitle")}
    <#elseif section = "title">
        <#--
          Grouped with the heading rather than placed after it: the design has the steps and
          the title in one frame on an 8px rhythm, where the card's own blocks are 24px
          apart. .or-steps-block owns that rhythm, which is also what keeps the code tight
          against the steps either side of it.
        -->
        <div class="or-steps-block">
            <#assign installStep>
                <li>
                    <p>${msg("loginTotpStep1")}</p>
                    <ul id="kc-totp-supported-apps" class="or-steps__apps">
                        <#list totp.supportedApplications as app>
                            <li>${msg(app)}</li>
                        </#list>
                    </ul>
                </li>
            </#assign>
            <#assign finishSteps>
                <li><p>${msg("loginTotpStep3")}</p></li>
                <li><p>${msg("loginTotpStep3DeviceName")}</p></li>
            </#assign>

            <#if mode?? && mode = "manual">
                <ol id="kc-totp-settings" class="or-steps">
                    ${installStep?no_esc}
                    <li>
                        <p>${msg("loginTotpManualStep2")}</p>
                        <p><code id="kc-totp-secret-key" class="or-code">${totp.totpSecretEncoded}</code></p>
                        <p><@field.link href=totp.qrUrl label=msg("loginTotpScanBarcode") id="mode-barcode"/></p>
                    </li>
                    <li>
                        <p>${msg("loginTotpManualStep3")}</p>
                        <ul class="or-steps__meta">
                            <li id="kc-totp-type">${msg("loginTotpType")}: ${msg("loginTotp." + totp.policy.type)}</li>
                            <li id="kc-totp-algorithm">${msg("loginTotpAlgorithm")}: ${totp.policy.getAlgorithmKey()}</li>
                            <li id="kc-totp-digits">${msg("loginTotpDigits")}: ${totp.policy.digits}</li>
                            <#if totp.policy.type = "totp">
                                <li id="kc-totp-period">${msg("loginTotpInterval")}: ${totp.policy.period}</li>
                            <#elseif totp.policy.type = "hotp">
                                <li id="kc-totp-counter">${msg("loginTotpCounter")}: ${totp.policy.initialCounter}</li>
                            </#if>
                        </ul>
                    </li>
                    ${finishSteps?no_esc}
                </ol>
            <#else>
                <#--
                  The barcode variant deliberately closes the list, emits the code, then
                  resumes at 3. Nested inside step 2 the code is indented by the list's own
                  padding and lines up with the step text; between the lists it starts at the
                  same edge as the numbers, as in the design. `start` keeps the numbering
                  continuous.
                -->
                <ol id="kc-totp-settings" class="or-steps">
                    ${installStep?no_esc}
                    <li><p>${msg("loginTotpStep2")}</p></li>
                </ol>

                <#-- The design places the fallback link beside the code, not beneath it. -->
                <div class="or-qr-row">
                    <img id="kc-totp-secret-qr-code" class="or-qr"
                         src="data:image/png;base64, ${totp.totpSecretQrCode}"
                         alt="${msg("loginTotpStep2")}"/>
                    <@field.link href=totp.manualUrl label=msg("loginTotpUnableToScan") id="mode-manual"/>
                </div>

                <ol class="or-steps" start="3">${finishSteps?no_esc}</ol>
            </#if>
        </div>
    <#elseif section = "form">
        <form action="${url.loginAction}" id="kc-totp-settings-form" method="post">
            <@field.otp name="totp" label=msg("authenticatorCode") autofocus=true/>

            <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}"/>
            <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>

            <@field.input name="userLabel" label=msg("loginTotpDeviceName") required=false
                          autocomplete="off" attrs='dir="ltr"'/>

            <div class="or-actions">
                <@field.submit label=msg("doSubmit") id="saveTOTPBtn"/>

                <#if isAppInitiatedAction??>
                    <@field.submit label=msg("doCancel") name="cancel-aia" value="true"
                                   theme="tertiary" id="cancelTOTPBtn"/>
                </#if>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
