<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm'); section>
    <#if section = "header">
        ${msg("updatePasswordTitle")}
    <#elseif section = "form">
        <form id="kc-passwd-update-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <div class="row">
                <input type="text" id="username" name="username" value="${username}" autocomplete="username"
                       readonly="readonly" style="display:none;"/>
                <input type="password" id="password" name="password" autocomplete="current-password" style="display:none;"/>

                <div class="input-field col s12">
                    <input type="password" id="password-new" name="password-new"
                           class="validate <#if messagesPerField.existsError('password','password-confirm')>invalid</#if>"
                           required
                           autofocus autocomplete="new-password"
                           aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"
                    />
                    <label for="password-new" class="${properties.kcLabelClass!}">${msg("passwordNew")}</label>
                    <#if messagesPerField.existsError('password-confirm','password-confirm')>
                        <span class="helper-text" data-error="${kcSanitize(messagesPerField.getFirstError('password','password-confirm'))?no_esc}"></span>
                    </#if>
                </div>

                <div class="input-field col s12">
                    <input type="password" id="password-confirm" name="password-confirm"
                           required
                           class="validate <#if messagesPerField.existsError('password-confirm')>invalid</#if>"
                           autocomplete="new-password"
                           aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
                    />
                    <label for="password-confirm" class="${properties.kcLabelClass!}">${msg("passwordConfirm")}</label>
                    <#if messagesPerField.existsError('password-confirm','password-confirm')>
                        <span class="helper-text" data-error="${kcSanitize(messagesPerField.getFirstError('password','password-confirm'))?no_esc}"></span>
                    </#if>
                </div>
            </div>

            <div class="row">
                <div class="${properties.kcFormGroupClass!}">
                    <div id="kc-form-options" class="${properties.kcFormOptionsClass!}">
                        <div class="${properties.kcFormOptionsWrapperClass!}">
                            <#if isAppInitiatedAction??>
                                <div class="checkbox">
                                    <label><input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" checked> ${msg("logoutOtherSessions")}</label>
                                </div>
                            </#if>
                        </div>
                    </div>

                    <div class="col s12 center-align">
                        <#if isAppInitiatedAction??>

                            <button class="btn waves-effect waves-light" type="submit" name="login">${msg("doSubmit")}
                                <i class="material-icons right">send</i>
                            </button>

                            <button class="btn waves-effect waves-light" type="submit">${msg("doSubmit")}
                                <i class="material-icons right">send</i>
                            </button>
                            <button class="btn waves-effect waves-light" type="submit" name="cancel-aia" value="true" />${msg("doCancel")}</button>
                        <#else>
                            <button class="btn waves-effect waves-light" type="submit">${msg("doSubmit")}
                                <i class="material-icons right">send</i>
                            </button>
                        </#if>
                    </div>
                </div>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
