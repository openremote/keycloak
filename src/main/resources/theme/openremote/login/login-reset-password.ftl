<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true displayMessage=!messagesPerField.existsError('username'); section>
    <#if section = "title">
        ${msg("emailForgotTitle")}
    <#elseif section = "header">
        ${msg("emailForgotTitle")}
    <#elseif section = "form">
        <form id="kc-reset-password-form"  action="${url.loginAction}" method="post">
            <div class="row">
                <div class="input-field col s12">
                    <#if auth?has_content && auth.showUsername()>
                        <input type="text" id="username" name="username" required value="${auth.attemptedUsername}" class="validate <#if messagesPerField.existsError('username')>invalid</#if>" autofocus aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"/>
                    <#else>
                        <input type="text" id="username" name="username" required class="validate <#if messagesPerField.existsError('username')>invalid</#if>" autofocus aria-invalid="<#if messagesPerField.existsError('username')>true</#if>" />
                    </#if>
                    <label for="username" class="${properties.kcLabelClass!}"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></label>

                    <#if messagesPerField.existsError('username')>
                        <span class="helper-text" data-error="${kcSanitize(messagesPerField.get('username'))?no_esc}"></span>
                    </#if>
                </div>
            </div>
            <div class="row">
                <div class="col s12 center-align">
                    <button class="btn waves-effect waves-light" type="submit" name="login">${msg("doSubmit")}
                        <i class="material-icons right">send</i>
                    </button>
                </div>

                <div class="col s12 center-align">
                    <p><a href="${url.loginUrl}">${msg("backToLogin")}</a></p>
                </div>
            </div>
        </form>
    <#elseif section = "info" >
        <div class="layout horizontal center">
            ${msg("emailInstruction")}
        </div>
    </#if>
</@layout.registrationLayout>
