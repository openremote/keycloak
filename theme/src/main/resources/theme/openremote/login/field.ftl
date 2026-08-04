<#--
  Field macros wrapping the OpenRemote design system (@openremote/or-vaadin-components).

  Two deliberate patterns run through this file:

  1. The native <input> and <label> are always emitted as light-DOM children with
     slot="input" / slot="label". Vaadin's SlotController reuses an existing slotted
     child instead of creating its own (see SlotController.initSingle), and LabelMixin
     documents the slot as taking precedence over the `label` property. Because that
     input lives in the light DOM it participates in native form submission, so fields
     keep working — labelled and populated, just unstyled — if the vendored bundle
     fails to load.

  2. Vaadin's button is role="button" on a custom element with no `type` and no form
     participation, so it cannot submit a form on its own. The submit macro therefore
     emits both a styled or-vaadin-button and a native fallback, and login.css uses
     :defined to show exactly one of them: the native button is only visible while the
     custom element is unregistered.
-->

<#-- First validation error across the given field names, or "". -->
<#function errorOf fields>
    <#list fields as f>
        <#if messagesPerField.existsError(f)>
            <#return kcSanitize(messagesPerField.getFirstError(f))>
        </#if>
    </#list>
    <#return "">
</#function>

<#--
  A single-line input.

  tag       - or-vaadin-text-field | or-vaadin-password-field | or-vaadin-email-field
  errors    - field names to source validation errors from; defaults to [name]
  attrs     - extra attributes placed on the native <input>
-->
<#macro input name label tag="or-vaadin-text-field" type="text" value="" required=true
              autofocus=false autocomplete="" disabled=false errors=[] attrs="">
    <#local errFields = (errors?size gt 0)?then(errors, [name])>
    <#local err = errorOf(errFields)>
    <${tag} class="or-field"<#if err?has_content> invalid</#if>>
        <label slot="label" for="${name}">${label}</label>
        <input slot="input"
               id="${name}"
               name="${name}"
               type="${type}"
               value="${value}"
               <#if required>required</#if>
               <#if autofocus>autofocus</#if>
               <#if disabled>disabled</#if>
               <#if autocomplete?has_content>autocomplete="${autocomplete}"</#if>
               <#if err?has_content>aria-invalid="true"</#if>
               <#-- ?no_esc because these are raw attribute markup, not text content;
                    Keycloak enables HTML auto-escaping, which would mangle the quotes. -->
               ${attrs?no_esc}/>
        <#if err?has_content>
            <div slot="error-message">${err?no_esc}</div>
        </#if>
    </${tag}>
</#macro>

<#macro password name label value="" required=true autofocus=false autocomplete="current-password" errors=[]>
    <@input name=name label=label tag="or-vaadin-password-field" type="password" value=value
            required=required autofocus=autofocus autocomplete=autocomplete errors=errors/>
</#macro>

<#-- A one-time-code input: numeric keypad, LTR even in RTL locales. -->
<#macro otp name label autofocus=true errors=[]>
    <@input name=name label=label required=true autofocus=autofocus
            autocomplete="one-time-code" errors=errors
            attrs='inputmode="numeric" dir="ltr"'/>
</#macro>

<#macro checkbox name label checked=false>
    <or-vaadin-checkbox class="or-field"<#if checked> checked</#if>>
        <label slot="label" for="${name}">${label}</label>
        <input slot="input" id="${name}" name="${name}" type="checkbox"
               value="on"<#if checked> checked</#if>/>
    </or-vaadin-checkbox>
</#macro>

<#--
  Submit control.

  Renders the design-system button alongside a native <button type="submit"> that carries
  the actual name/value. login.css uses :defined to show exactly one of them, and forms.js
  submits via form.requestSubmit(nativeButton) so the native button acts as the submitter
  and its name/value are included — which matters for flags Keycloak detects by presence,
  such as cancel-aia.

  The native button stays in the DOM even when visually hidden so that it remains the
  form's default button, which is what makes Enter-to-submit work without extra JS.
-->
<#macro submit label name="" value="" theme="primary" id="">
    <div class="or-submit">
        <or-vaadin-button class="or-submit__styled" theme="${theme}"<#if id?has_content> id="${id}"</#if>>
            ${label}
        </or-vaadin-button>
        <button class="or-submit__fallback" type="submit"
                <#if name?has_content>name="${name}"</#if>
                <#if value?has_content>value="${value}"</#if>>${label}</button>
    </div>
</#macro>

<#-- A secondary/tertiary action rendered as a link, e.g. "Back to login". -->
<#macro link href label id="">
    <a class="or-link"<#if id?has_content> id="${id}"</#if> href="${href}">${label}</a>
</#macro>
