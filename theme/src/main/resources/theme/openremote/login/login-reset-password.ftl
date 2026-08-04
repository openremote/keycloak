<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#-- displayInfo is false because emailInstruction is rendered inline as the card lead,
     which is where the design puts it, rather than in the separate info area. -->
<@layout.registrationLayout displayInfo=false displayMessage=!messagesPerField.existsError('username')
                            backHref=url.loginUrl backLabel=msg("backToLogin"); section>
    <#if section = "header">
        ${msg("emailForgotTitle")}
    <#elseif section = "title">
        <#-- Inside the title block, 8px under the heading, as the design groups them. -->
        <p class="or-card__lead">${msg("emailInstruction")}</p>
    <#elseif section = "form">
        <form id="kc-reset-password-form" action="${url.loginAction}" method="post">
            <@field.input name="username"
                          label=(!realm.loginWithEmailAllowed)?then(msg("username"), (!realm.registrationEmailAsUsername)?then(msg("usernameOrEmail"), msg("email")))
                          value=(auth?has_content && auth.showUsername())?then(auth.attemptedUsername!'', '')
                          autofocus=true
                          autocomplete="username"/>

            <@field.submit label=msg("doSubmit")/>
        </form>
    </#if>
</@layout.registrationLayout>
