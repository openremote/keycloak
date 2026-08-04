<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <#if realm.password>
            <#-- Double-submit protection is applied generically by forms.js; doing it here
                 with onsubmit would disable the submitter before its name/value is collected. -->
            <form id="kc-form-login" action="${url.loginAction}" method="post">

                <@field.input name="username"
                              label=(!realm.loginWithEmailAllowed)?then(msg("username"), (!realm.registrationEmailAsUsername)?then(msg("usernameOrEmail"), msg("email")))
                              value=(login.username!'')
                              autofocus=true
                              disabled=usernameEditDisabled??
                              autocomplete="username"
                              errors=["username", "password"]
                              attrs='autocapitalize="off" minlength="1"'/>

                <@field.password name="password" label=msg("password") errors=["username", "password"]/>

                <#if realm.rememberMe && !usernameEditDisabled??>
                    <@field.checkbox name="rememberMe" label=msg("rememberMe") checked=login.rememberMe??/>
                </#if>

                <#-- The design's "Actions" frame: the button and the link are one group
                     16px apart, rather than two blocks on the card's 24px rhythm. -->
                <div class="or-actions">
                    <@field.submit label=msg("doLogIn") name="login" id="kc-login"/>

                    <#if realm.resetPasswordAllowed>
                        <p class="or-card__aside">
                            <@field.link href=url.loginResetCredentialsUrl label=msg("doForgotPassword")/>
                        </p>
                    </#if>
                </div>
            </form>
        </#if>
    <#-- No "New user? Register" block: the design's login card ends at "Forgot password?",
         and registration is reached from the application rather than from here. -->
    <#elseif section = "socialProviders">
        <#if realm.password && social?? && social.providers?has_content>
            <div id="kc-social-providers" class="or-social">
                <div class="or-social__divider"><span>${msg("identityProviderLoginLabel")}</span></div>
                <#list social.providers as p>
                    <form action="${p.loginUrl}" method="post">
                        <@field.submit label=p.displayName theme="secondary"/>
                    </form>
                </#list>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
