<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('firstName','lastName','email','username','password','password-confirm')
                            backHref=url.loginUrl backLabel=msg("backToLogin"); section>
    <#if section = "header">
        ${msg("registerTitle",(realm.displayNameHtml!''))}
    <#elseif section = "form">
        <form id="kc-register-form" action="${url.registrationAction}" method="post">
            <#-- Decoys: some password managers autofill the first text/password pair on a
                 page, which would silently populate the registration form. -->
            <input type="text" readonly value="this is not a login form" style="display: none;">
            <input type="password" readonly value="this is not a login form" style="display: none;">

            <#-- Design order: first name, last name, email address. Username comes after
                 them rather than first - it is not in the design at all, and only exists on
                 realms that do not use email as the username. -->
            <@field.input name="firstName" label=msg("firstName")
                          value=(register.formData.firstName!'') autocomplete="given-name"/>

            <@field.input name="lastName" label=msg("lastName")
                          value=(register.formData.lastName!'') autocomplete="family-name"/>

            <@field.input name="email" label=msg("email") tag="or-vaadin-email-field" type="email"
                          value=(register.formData.email!'') autocomplete="email"/>

            <#if !realm.registrationEmailAsUsername>
                <@field.input name="username" label=msg("username")
                              value=(register.formData.username!'') autocomplete="username"/>
            </#if>

            <#if passwordRequired??>
                <@field.password name="password" label=msg("password") autocomplete="new-password"/>
                <@field.password name="password-confirm" label=msg("passwordConfirm")
                                 autocomplete="new-password" errors=["password-confirm"]/>
            </#if>

            <#if recaptchaRequired??>
                <div class="or-recaptcha g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}"></div>
            </#if>

            <@field.submit label=msg("doRegister") name="register"/>
        </form>
    </#if>
</@layout.registrationLayout>
