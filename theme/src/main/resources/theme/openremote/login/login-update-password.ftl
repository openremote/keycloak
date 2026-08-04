<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm'); section>
    <#if section = "header">
        ${msg("updatePasswordTitle")}
    <#elseif section = "form">
        <form id="kc-passwd-update-form" action="${url.loginAction}" method="post">
            <#-- Hidden username/current-password pair so password managers can associate
                 the change with the right account and offer to update the stored entry. -->
            <input type="text" id="username" name="username" value="${username}"
                   autocomplete="username" readonly="readonly" style="display:none;"/>
            <input type="password" id="password" name="password"
                   autocomplete="current-password" style="display:none;"/>

            <@field.password name="password-new" label=msg("passwordNew")
                             autocomplete="new-password" autofocus=true
                             errors=["password", "password-confirm"]/>

            <@field.password name="password-confirm" label=msg("passwordConfirm")
                             autocomplete="new-password"
                             errors=["password-confirm"]/>

            <#if isAppInitiatedAction??>
                <@field.checkbox name="logout-sessions" label=msg("logoutOtherSessions") checked=true/>
            </#if>

            <div class="or-actions">
                <@field.submit label=msg("doSubmit")/>

                <#if isAppInitiatedAction??>
                    <@field.submit label=msg("doCancel") name="cancel-aia" value="true" theme="tertiary"/>
                </#if>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
