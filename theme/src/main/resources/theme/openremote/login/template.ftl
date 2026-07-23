<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}">
<head>
	<meta charset="utf-8">
    <meta http-equiv="content-type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <meta name="robots" content="noindex, nofollow">

    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
	<title>${msg("applicationName")}</title>
    <link rel="icon" type="image/png" href="${url.resourcesPath}/img/favicon.png"/>
    <link type=text/css rel="stylesheet" href="${url.resourcesPath}/css/materialize.min.css" media="screen,projection"/>
    <link rel="stylesheet" href="${url.resourcesPath}/css/styles.css"/>
	<script type="text/javascript" src="${url.resourcesPath}/js/materialize.min.js"></script>
</head>

<body>
<div id="outer-wrapper">
    <div id="wrapper">

        <div class="row">
            <div class="col s10 m6 l4 offset-s1 offset-m3 offset-l4">
                <div class="row">
                    <div class="row valign-wrapper" style="margin-bottom: 20px;">
                        <!-- Header Section (Left Side) -->
                        <div class="col s8">
                            <div id="header-wrapper" style="display: flex; align-items: center;">
                                <a id="logo" href="https://www.openremote.io/" style="width: 50px; margin-right: 15px; flex-shrink: 0;">
                                    <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
                                        <path fill="#C4D600" d="M11.93,21.851c-5.551,0-10.066-4.515-10.066-10.065h2.108c0,4.388,3.57,7.958,7.958,7.958 c4.387,0,7.958-3.57,7.958-7.958c0-4.388-3.57-7.958-7.958-7.958V1.72c5.55,0,10.066,4.517,10.066,10.066 C21.996,17.336,17.48,21.851,11.93,21.851L11.93,21.851z"/>
                                        <path fill="#4E9D2D" d="M10.406,19.088c-1.95-0.406-3.626-1.549-4.717-3.215s-1.469-3.66-1.062-5.61 c0.407-1.951,1.55-3.626,3.217-4.718c1.667-1.092,3.659-1.469,5.61-1.062c4.027,0.84,6.62,4.799,5.779,8.825l-2.063-0.429 c0.603-2.889-1.257-5.73-4.147-6.333c-1.4-0.292-2.829-0.022-4.025,0.762C7.802,8.091,6.982,9.293,6.69,10.693 c-0.291,1.398-0.021,2.828,0.762,4.024c0.783,1.196,1.985,2.016,3.385,2.307L10.406,19.088L10.406,19.088z"/>
                                        <path fill="#1D5632" d="M11.936,16.622c-0.082,0-0.164-0.001-0.245-0.004c-1.29-0.065-2.478-0.628-3.346-1.585 c-0.868-0.958-1.31-2.195-1.246-3.487l2.104,0.105c-0.036,0.728,0.214,1.427,0.704,1.967c0.488,0.54,1.16,0.858,1.888,0.894 c0.725,0.033,1.426-0.213,1.966-0.703c0.541-0.489,0.858-1.159,0.895-1.887c0.075-1.503-1.088-2.787-2.591-2.862l0.105-2.104 c2.664,0.132,4.724,2.406,4.592,5.07c-0.064,1.291-0.628,2.478-1.585,3.345C14.28,16.183,13.137,16.622,11.936,16.622L11.936,16.622 z"/>
                                    </svg>
                                </a>
                                <div class="left-align" style="display: flex; flex-direction: column; justify-content: center;">
                                    <h5 id="header" style="margin: 0 0 5px 0;"><#nested "header"></h5>
                                    <p id="sub-header" style="margin: 0; line-height: 1.2;">${msg("applicationName")}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Locale Dropdown Section (Right Side) -->
                        <#if realm.internationalizationEnabled && locale.supported?size gt 1>
                            <div class="col s4 right-align" id="kc-locale">
                                <div id="kc-locale-wrapper">
                                    <div id="kc-locale-dropdown">

                                        <!-- 1. Materialize Dropdown Trigger -->
                                        <button tabindex="1" id="kc-current-locale-link"
                                                class="dropdown-trigger btn btn-small"
                                                data-target="language-switch1"
                                                aria-label="${msg("languages")}"
                                                style="display: inline-flex; align-items: center; justify-content: center;">
                                            <span>${locale.current}</span>
                                            <!-- Explicitly reset the margin-right from styles.css so it centers properly -->
                                            <i class="material-icons" style="margin: 0 0 0 5px;">arrow_drop_down</i>
                                        </button>

                                        <!-- 2. Materialize Dropdown Content -->
                                        <ul id="language-switch1" class="dropdown-content">
                                            <#assign i = 1>
                                            <#list locale.supported as l>
                                                <li class="${properties.kcLocaleListItemClass!}">
                                                    <a id="language-${i}" class="${properties.kcLocaleItemClass!}" href="${l.url}">
                                                        ${l.label}
                                                    </a>
                                                </li>
                                                <#assign i++>
                                            </#list>
                                        </ul>

                                    </div>
                                </div>
                            </div>
                        </#if>
                    </div>

                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="section">
                            <div class="card-panel">
                                <#if message.type=='success' ><i class="material-icons green-text">check_circle</i><span
                                        class="green-text">${kcSanitize(message.summary)?no_esc}</span></#if>
                                <#if message.type=='warning' ><i class="material-icons orange-text">warning</i><span
                                        class="orange-text">${kcSanitize(message.summary)?no_esc}</span></#if>
                                <#if message.type=='error' ><i class="material-icons red-text">error</i><span
                                        class="red-text">${kcSanitize(message.summary)?no_esc}</span></#if>
                                <#if message.type=='info' ><i class="material-icons blue-text">info</i><span
                                        class="blue-text">${kcSanitize(message.summary)?no_esc}</span></#if>
                            </div>
                        </div>
                    </#if>

                    <div class="col s12">
                        <#nested "socialProviders">
                    </div>
                     <div class="col s12">
                        <#nested "form">
                    </div>
                </div>
                <div class="row">
                    <div class="col s12">
                        <#if displayInfo>
                            <#nested "info">
                        </#if>
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>
<script>
    document.addEventListener('DOMContentLoaded', function() {
        // Find all elements with the 'dropdown-trigger' class
        var dropdownElems = document.querySelectorAll('.dropdown-trigger');

        // Initialize them with Materialize
        var dropdownInstances = M.Dropdown.init(dropdownElems, {
            coverTrigger: false, // Prevents the dropdown from covering the button
            alignment: 'right',  // Aligns the dropdown to the edge of the button
            constrainWidth: false // Allows the dropdown to be wider than the button if needed
        });
    });
</script>
</body>
</html>
</#macro>
