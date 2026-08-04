<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp')
                            backHref=url.loginRestartFlowUrl backLabel=msg("backToLoginCredentials"); section>
    <#if section = "header">
        <#-- Same heading as the first login step, per the design; doLogIn is the button. -->
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <form id="kc-otp-login-form" action="${url.loginAction}" method="post">

            <#if otpLogin.userOtpCredentials?size gt 1>
                <#-- Replaces the previous hidden-radio-plus-styled-span hack. The native
                     radio inputs stay in the light DOM so the choice still submits if the
                     design system bundle is unavailable. -->
                <or-vaadin-radio-group class="or-field" id="kc-otp-credential-box">
                    <label slot="label">${msg("select2faDevice")}</label>
                    <#list otpLogin.userOtpCredentials as otpCredential>
                        <vaadin-radio-button>
                            <label slot="label" for="kc-otp-credential-${otpCredential?index}">${otpCredential.userLabel}</label>
                            <input slot="input"
                                   id="kc-otp-credential-${otpCredential?index}"
                                   type="radio"
                                   name="selectedCredentialId"
                                   value="${otpCredential.id}"
                                   <#if otpCredential.id == otpLogin.selectedCredentialId>checked</#if>/>
                        </vaadin-radio-button>
                    </#list>
                </or-vaadin-radio-group>
            </#if>

            <@field.otp name="otp" label=msg("loginOtpOneTime") autofocus=true errors=["totp"]/>

            <@field.submit label=msg("doLogIn") id="kc-login"/>
        </form>
    </#if>
</@layout.registrationLayout>
