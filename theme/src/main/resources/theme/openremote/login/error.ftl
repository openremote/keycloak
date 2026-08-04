<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#-- The message is rendered once, by the layout, as an .or-alert carrying message.type - so
     an error reads as one and a warning does not. Rendering it here as well printed the same
     sentence twice, and rendering it here *instead* threw the type away. -->
<@layout.registrationLayout; section>
    <#if section = "header">
        ${msg("errorTitle")}
    <#elseif section = "form">
        <#if client?? && client.baseUrl?has_content>
            <p class="or-card__aside">
                <@field.link href=client.baseUrl label=msg("backToApplication") id="backToApplication"/>
            </p>
        </#if>
    </#if>
</@layout.registrationLayout>
