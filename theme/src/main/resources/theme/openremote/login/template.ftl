<#--
  OpenRemote login layout.

  This reproduces the full contract of base/login/template.ftl so that the ~35 Keycloak
  templates we do not override (info.ftl, login-page-expired.ftl, select-authenticator.ftl,
  terms.ftl, webauthn-*.ftl, ...) keep working and render inside our card. Only the markup
  and styling differ; the macro signature, the nested section names and the conditional
  blocks are deliberately kept in step with the parent theme.

  When upgrading Keycloak, diff base/login/template.ftl and mirror any behavioural change.
-->
<#import "footer.ftl" as loginFooter>

<#--
  backHref / backLabel are an OpenRemote addition on top of the base signature: the design
  places the "back" affordance above the heading, which page templates cannot do from the
  form section. Inherited base templates simply omit them and get the default (no link).
-->
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false
                           backHref="" backLabel="">
<!DOCTYPE html>
<html class="or-booting" lang="${lang!'en'}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>

<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">

    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>

    <title>${msg("applicationName")}</title>
    <link id="or-favicon" rel="icon" type="image/png" href="${url.resourcesPath}/img/favicon.png"/>

    <#-- OpenRemote design system: prebuilt bundles vendored from npm at image build time.
         The ?v= query string is what actually busts browser/app caches, because
         url.resourcesPath only changes between Keycloak releases. -->
    <link rel="stylesheet" href="${url.resourcesPath}/vendor/or-theme.css?v=${properties.orUiVersion!''}"/>
    <link rel="stylesheet" href="${url.resourcesPath}/css/login.css?v=${properties.orUiVersion!''}"/>
    <#-- defer is required, not cosmetic: the bundle appends to document.body during module
         evaluation, so loading it synchronously in <head> throws before most components
         register. Verified: without defer only 1 of 7 custom elements is defined. -->
    <script src="${url.resourcesPath}/vendor/or-vaadin.js?v=${properties.orUiVersion!''}" defer></script>

    <#-- Per-realm branding is fetched at runtime; keep the page hidden briefly so the
         default OpenRemote colours do not flash before the realm's own land. -->
    <noscript><style>html.or-booting body { visibility: visible !important; }</style></noscript>
    <#-- Classic (non-module) script: it must run before branding.js, and module scripts
         are deferred. ?c inside a JavaScript outputformat emits a quoted JS literal,
         matching how base/login/template.ftl embeds server values. -->
    <script>
        <#outputformat "JavaScript">
        window.orKcBranding = {
            realm: ${realm.name?c},
            managerUrl: ${(properties.managerUrl!'')?c},
            resourcesPath: ${url.resourcesPath?c}
        };
        </#outputformat>

        // Dark mode reuses the :root[theme~="dark"] block that @openremote/theme already
        // ships, so there is no second palette to maintain here. Set before first paint.
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            document.documentElement.setAttribute("theme", "dark");
        }

        // Fallback in case branding.js fails to load or throws; never leave the page blank.
        setTimeout(function () {
            document.documentElement.classList.remove("or-booting");
        }, 400);
    </script>
    <script src="${url.resourcesPath}/js/branding.js?v=${properties.orUiVersion!''}"></script>
    <script src="${url.resourcesPath}/js/forms.js?v=${properties.orUiVersion!''}" defer></script>

    <#-- Inherited behaviour from base/login/template.ftl below. -->
    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
    <script src="${url.resourcesPath}/js/menu-button-links.js" type="module"></script>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <script type="module">
        <#outputformat "JavaScript">
        import { startSessionPolling } from ${(url.resourcesPath + "/js/authChecker.js")?c};

        startSessionPolling(
            ${url.ssoLoginInOtherTabsUrl?c}
        );
        </#outputformat>
    </script>
    <script type="module">
        document.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-once-link]");

            if (!link) {
                return;
            }

            if (link.getAttribute("aria-disabled") === "true") {
                event.preventDefault();
                return;
            }

            const { disabledClass } = link.dataset;

            if (disabledClass) {
                link.classList.add(...disabledClass.trim().split(/\s+/));
            }

            link.setAttribute("role", "link");
            link.setAttribute("aria-disabled", "true");
        });
    </script>
    <#if authenticationSession??>
        <script type="module">
            <#outputformat "JavaScript">
            import { checkAuthSession } from ${(url.resourcesPath + "/js/authChecker.js")?c};

            checkAuthSession(
                ${authenticationSession.authSessionIdHash?c}
            );
            </#outputformat>
        </script>
    </#if>
</head>

<body class="${bodyClass}" data-page-id="login-${pageId}">
<main class="or-login">

    <div class="or-login__brand">
        <img id="or-logo" src="${url.resourcesPath}/img/logo.svg" alt=""/>
        <p id="or-app-title">${msg("applicationName")}</p>
    </div>

    <div class="or-card">

        <#if realm.internationalizationEnabled && locale.supported?size gt 1>
            <div class="or-locale menu-button-links" id="kc-locale">
                <button tabindex="1" id="kc-current-locale-link" aria-label="${msg("languages")}"
                        aria-haspopup="true" aria-expanded="false" aria-controls="language-switch1">
                    ${locale.current}
                </button>
                <ul role="menu" tabindex="-1" aria-labelledby="kc-current-locale-link"
                    aria-activedescendant="" id="language-switch1" class="or-locale__list">
                    <#assign i = 1>
                    <#list locale.supported as l>
                        <li role="none">
                            <a role="menuitem" id="language-${i}" href="${l.url}">${l.label}</a>
                        </li>
                        <#assign i++>
                    </#list>
                </ul>
            </div>
        </#if>

        <#--
          Flat on purpose: .or-card is a flex column and its gap does the spacing, so the
          back link, the title block and the content are siblings rather than being wrapped
          and margined. #kc-content and #kc-content-wrapper are display:contents for the
          same reason - see login.css.
        -->
        <#if backHref?has_content>
            <p class="or-card__back">
                <a class="or-link" id="backToLogin" href="${backHref}">${backLabel}</a>
            </p>
        </#if>

        <#--
          The section is still emitted so inherited templates that fill it are not broken,
          but the attempted-username row and its "Restart login" link are not: neither is in
          the design, and the back link above already covers restarting the flow.
        -->
        <#if auth?has_content && auth.showUsername() && !auth.showResetCredentials()>
            <#nested "show-username">
        </#if>

        <#-- Heading and any lead prose are one block 8px apart; pages emit their lead into
             the "title" section so it lands inside this wrapper rather than after it. -->
        <div class="or-card__title">
            <h1 id="kc-page-title"><#nested "header"></h1>
            <#nested "title">
        </div>

        <#if displayRequiredFields>
            <p class="or-required-note"><span class="or-required">*</span> ${msg("requiredFields")}</p>
        </#if>

        <div id="kc-content">
            <div id="kc-content-wrapper">

                <#-- App-initiated actions should not see warning messages about the need to
                     complete the action during login. -->
                <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                    <div class="or-alert or-alert--${message.type}" role="alert">
                        <span>${kcSanitize(message.summary)?no_esc}</span>
                    </div>
                </#if>

                <#nested "form">

                <#if auth?has_content && auth.showTryAnotherWayLink()>
                    <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post">
                        <input type="hidden" name="tryAnotherWay" value="on"/>
                        <a href="#" id="try-another-way" class="or-link"
                           onclick="document.forms['kc-select-try-another-way-form'].requestSubmit();return false;">${msg("doTryAnotherWay")}</a>
                    </form>
                </#if>

                <#if switchOrganizationEnabled?? && switchOrganizationEnabled>
                    <form id="kc-switch-organization-form" action="${url.loginAction}" method="post">
                        <input type="hidden" name="switchOrganization" value="true"/>
                        <a href="#" id="switch-organization" class="or-link"
                           onclick="document.forms['kc-switch-organization-form'].requestSubmit();return false;">${msg("doSwitchOrganization")}</a>
                    </form>
                </#if>

                <#nested "socialProviders">

                <#if displayInfo>
                    <div id="kc-info" class="or-card__info">
                        <div id="kc-info-wrapper">
                            <#nested "info">
                        </div>
                    </div>
                </#if>
            </div>
        </div>

        <@loginFooter.content/>
    </div>
</main>
</body>
</html>
</#macro>
