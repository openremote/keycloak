import { html, type TemplateResult } from "lit";
import { html as staticHtml, literal } from "lit/static-html.js";
// Imported here rather than by the pages: the locale switcher is page chrome, so it appears on
// every page including ones that render no fields of their own.
import "@openremote/or-vaadin-components/or-vaadin-select";
import type { I18n } from "./i18n";
import type { KcContext } from "./login/KcContext";

export type LayoutOptions = {
  kcContext: KcContext;
  /** Needed for the shared chrome (locale switcher, "try another way"), not just the page. */
  i18n: I18n;
  heading: string;
  /**
   * Content grouped with the heading rather than separated from it: prose on
   * login-reset-password, the numbered steps on the 2FA setup card. Passed in because the
   * design puts these *inside* the title block at 8px, where everything else on the card is
   * 24px apart - see .or-card__title. A string is wrapped as a lead paragraph.
   */
  intro?: string | TemplateResult;
  /** Rendered above the heading, matching the design's "‹ Back to login" affordance. */
  back?: { href: string; label: string };
  /**
   * Drop warning-level messages. Set by pages whose own copy already says what Keycloak's
   * warning says - the 2FA setup page, where it is "You need to set up Mobile Authenticator
   * to activate your account". Errors are always shown.
   */
  suppressWarning?: boolean;
  /**
   * Whether to render kcContext.message as an alert. Defaults to true.
   *
   * This is Keycloak's own `displayMessage` parameter, and it belongs to the page for the same
   * reason it does there: only the page knows which fields it renders, and therefore whether
   * the alert would repeat an error already shown against a field. Keycloak's templates each
   * pass their own expression - login.ftl uses
   * `!messagesPerField.existsError('username','password')`, register.ftl uses
   * `messagesPerField.exists('global')` - so pages here mirror theirs.
   *
   * It used to be a fixed list of four field names here, which silently duplicated every error
   * on a field outside that list, and could not work at all once registration became
   * profile-driven and the field names stopped being knowable in advance.
   */
  displayMessage?: boolean;
  content: TemplateResult;
};

/**
 * Shared card chrome: the brand lockup, the card, the one place kcContext.message is rendered,
 * and the flow-level controls Keycloak's own template puts around every page. Every page goes
 * through it.
 */
export function layout(options: LayoutOptions): TemplateResult {
  const {
    kcContext,
    i18n,
    heading,
    intro,
    back,
    suppressWarning,
    displayMessage = true,
    content
  } = options;
  const suppressed = suppressWarning && kcContext.message?.type === "warning";
  const message = displayMessage && !suppressed ? kcContext.message : undefined;

  return html`
    <main class="or-login">
      <!-- First in the page so it comes first in the tab order; CSS lifts it into the page's
           top corner, out of the flex flow. It belongs to the page rather than the card
           because it is not part of any one step of a flow. -->
      ${localeSwitcher(kcContext, i18n)}

      <div class="or-login__brand">
        <img id="or-logo" src="logo.svg" alt="" />
        <p id="or-app-title">${kcContext.realm?.displayName || "OpenRemote"}</p>
      </div>

      <!-- Flat on purpose: the card is a flex column and its gap does the spacing, so every
           block here is a direct child rather than being wrapped and margined. -->
      <div class="or-card">
        ${back
          ? html`<p class="or-card__back">
              <a class="or-link" href=${back.href}>${back.label}</a>
            </p>`
          : null}

        <div class="or-card__title">
          <h1 id="kc-page-title">${heading}</h1>
          ${typeof intro === "string"
            ? html`<p class="or-card__lead">${intro}</p>`
            : (intro ?? null)}
        </div>

        <div id="kc-content">
          <div id="kc-content-wrapper">
            <!-- The one place kcContext.message is rendered; pages must not render it
                 themselves - error.ftl did, and printed every message twice. -->
            ${message
              ? html`<div class="or-alert or-alert--${message.type}" role="alert">
                  <span>${message.summary}</span>
                </div>`
              : null}
            ${content} ${flowActions(kcContext, i18n)}
          </div>
        </div>
      </div>
    </main>
  `;
}

/**
 * Flow-level actions Keycloak's own template renders around every page.
 *
 * Both are plain POSTs back to the current login action, distinguished only by a parameter
 * Keycloak detects by presence - which is why they are forms rather than links, and why the
 * hidden native button carries the name/value (see submitButton).
 *
 * "Try another way" is the escape hatch out of the authenticator Keycloak picked: without it a
 * user with, say, both OTP and a passkey has no way to reach the other one.
 */
function flowActions(kcContext: KcContext, i18n: I18n): TemplateResult | null {
  const tryAnotherWay = kcContext.auth?.showTryAnotherWayLink === true;
  // Not in Keycloakify's KcContext; declared in src/login/KcContext.ts.
  const switchOrganization = kcContext.switchOrganizationEnabled === true;

  if (!tryAnotherWay && !switchOrganization) {
    return null;
  }

  return html`
    <div class="or-flow-actions">
      ${tryAnotherWay
        ? html`<form id="kc-select-try-another-way-form" action=${kcContext.url.loginAction} method="post">
            ${submitButton(i18n.msgStr("doTryAnotherWay"), "tryAnotherWay", "on", "tertiary")}
          </form>`
        : null}
      ${switchOrganization
        ? html`<form id="kc-switch-organization-form" action=${kcContext.url.loginAction} method="post">
            ${submitButton(i18n.msgStr("doSwitchOrganization"), "switchOrganization", "true", "tertiary")}
          </form>`
        : null}
    </div>
  `;
}

/**
 * Language switcher, shown only when the realm actually offers a choice.
 *
 * A real `or-vaadin-select` in the page's top corner, so the one control here that is not a
 * form field still looks and behaves like the rest of the design system - keyboard handling,
 * the overlay, outside-click and Escape all come from Vaadin. This replaced a hand-rolled menu
 * button plus `<ul role="menu">`, which also meant this file owned two document-level listeners
 * and an aria-expanded dance; all of that is gone.
 *
 * Keycloak models each language as a GET to its own URL, so the select is a navigation control
 * rather than a form input: `change` fires only on a real user choice, and the value is the
 * language tag mapped back to the URL Keycloak gave us.
 */
function localeSwitcher(kcContext: KcContext, i18n: I18n): TemplateResult | null {
  const languages = i18n.enabledLanguages;

  if (!kcContext.realm.internationalizationEnabled || languages.length < 2) {
    return null;
  }

  // Keyed as plain strings: languageTag is a union of the 30 tags Keycloak ships, but what
  // comes back off the select is whatever string it holds.
  const hrefByTag = new Map<string, string>(
    languages.map(language => [language.languageTag, language.href])
  );

  const navigate = (event: Event): void => {
    const href = hrefByTag.get((event.currentTarget as { value?: string }).value ?? "");

    if (href !== undefined) {
      location.href = href;
    }
  };

  return html`
    <or-vaadin-select
      class="or-locale"
      id="kc-locale"
      accessible-name=${i18n.msgStr("languages")}
      .items=${languages.map(language => ({ label: language.label, value: language.languageTag }))}
      .value=${i18n.currentLanguage.languageTag}
      @change=${navigate}
    ></or-vaadin-select>
  `;
}

/**
 * Submits the owning form using the hidden native button as the submitter, so its
 * name/value reach Keycloak. Vaadin's button is role="button" with no form participation,
 * and Keycloak detects several flags purely by presence (cancel-aia, tryAnotherWay).
 */
export function submitOwningForm(event: Event): void {
  const styled = event.currentTarget as HTMLElement;
  const fallback = styled.parentElement?.querySelector<HTMLButtonElement>(
    ".or-submit__fallback"
  );
  const form = fallback?.form;

  if (!form || !fallback) {
    return;
  }

  event.preventDefault();
  form.requestSubmit(fallback);
}

/**
 * Design-system button paired with the native submit button that carries name/value.
 *
 * `theme` is the Vaadin button theme: the design's "Actions" frame pairs one primary button
 * with a tertiary one, so a secondary action like Cancel should not render as a second solid
 * green button. Identity providers use "secondary" - outlined, one per provider.
 */
export function submitButton(
  label: string,
  name?: string,
  value?: string,
  theme: "primary" | "secondary" | "tertiary" = "primary"
): TemplateResult {
  return submit({ label, name, value, theme });
}

/**
 * Cancel, for the pages an application can initiate as a required action.
 *
 * Keycloak detects the cancel by the presence of `cancel-aia`, which is why the native button
 * carries the name/value - see submitOwningForm.
 *
 * `formnovalidate` is what makes it actually cancel. Vaadin delegates `required` from the
 * field down onto the native input it manages (InputConstraintsMixin.delegateAttrs), so the
 * empty form these pages open with is genuinely invalid, and `requestSubmit()` runs interactive
 * validation before submitting: the browser refused the POST and popped a "please fill out this
 * field" bubble on a field the user was trying to walk away from. The constraints belong to the
 * action that submits the data, not to the one that abandons it - which is exactly what
 * formnovalidate says.
 */
export function cancelButton(label: string): TemplateResult {
  return submit({
    label,
    name: "cancel-aia",
    value: "true",
    theme: "tertiary",
    novalidate: true
  });
}

type SubmitOptions = {
  label: string;
  name?: string;
  value?: string;
  theme: "primary" | "secondary" | "tertiary";
  novalidate?: boolean;
};

function submit(options: SubmitOptions): TemplateResult {
  const { label, name, value, theme, novalidate = false } = options;

  return html`
    <div class="or-submit">
      <or-vaadin-button class="or-submit__styled" theme=${theme} @click=${submitOwningForm}>
        ${label}
      </or-vaadin-button>
      <button
        class="or-submit__fallback"
        type="submit"
        name=${name ?? ""}
        value=${value ?? ""}
        ?formnovalidate=${novalidate}
      >
        ${label}
      </button>
    </div>
  `;
}

const TAGS = {
  text: literal`or-vaadin-text-field`,
  password: literal`or-vaadin-password-field`,
  email: literal`or-vaadin-email-field`
};

export type FieldOptions = {
  kcContext: KcContext;
  name: string;
  label: string;
  type?: keyof typeof TAGS;
  value?: string;
  autocomplete?: string;
  required?: boolean;
  autofocus?: boolean;
  /** Extra attributes for one-time-code inputs. */
  numeric?: boolean;
  /** Field names to source the error from; defaults to [name]. */
  errorFields?: [string, ...string[]];
};

/**
 * A labeled input.
 *
 * **`name`, `value`, `required` and `autocomplete` go on the component, not on the input.**
 * The native <input> is still slotted - Vaadin's SlotController reuses an existing
 * slot="input" rather than creating its own - but InputControlMixin then *manages* that
 * element: it replaces the id, drops any name, value, required and autocomplete we set, and
 * re-delegates its own. Setting them on the input therefore looks right in the source and
 * silently produces an unnamed field, so the form posts nothing for it. Only `type`,
 * `inputmode` and `dir` survive on the input itself.
 *
 * **`autofocus` goes on the component too**, for a different reason: it survives on the input,
 * but does nothing there. The browser only honours the attribute for elements present as the page
 * is parsed, and these are rendered by script afterwards. Vaadin reads its own `autofocus` property
 * on the host and focuses the input itself once the component is ready. On the input, no field in
 * this theme ever received focus.
 *
 * The label needs no `for`: Vaadin points it at the id it generated, and adds aria-labelledby.
 */
export function field(options: FieldOptions): TemplateResult {
  const {
    kcContext,
    name,
    label,
    type = "text",
    value = "",
    autocomplete,
    required = true,
    autofocus = false,
    numeric = false,
    errorFields
  } = options;

  const [first, ...rest] = errorFields ?? [name];
  const error = errorOf(kcContext, first, ...rest);
  const tag = TAGS[type];

  return staticHtml`
    <${tag}
      class="or-field"
      name=${name}
      .value=${value}
      ?required=${required}
      autocomplete=${autocomplete ?? "off"}
      ?invalid=${!!error}
      ?autofocus=${autofocus}
    >
      <label slot="label">${label}</label>
      <input
        slot="input"
        type=${type}
        inputmode=${numeric ? "numeric" : "text"}
        dir=${numeric ? "ltr" : "auto"}
      />
      ${error ? html`<div slot="error-message">${error}</div>` : null}
    </${tag}>
  `;
}

/**
 * What to call the field the user types their identity into.
 *
 * Which of the three it is depends on how the realm is configured, and Keycloak's own templates
 * make exactly this choice in `login.ftl` and `login-reset-password.ftl`. Shared so the two pages
 * cannot drift: a realm where the label says "Username" on one and "Email" on the other reads as
 * a bug even though both came from the same rule.
 */
export function usernameLabel(
  realm: { loginWithEmailAllowed?: boolean; registrationEmailAsUsername?: boolean },
  i18n: I18n
): string {
  if (!realm.loginWithEmailAllowed) {
    return i18n.msgStr("username");
  }

  if (!realm.registrationEmailAsUsername) {
    return i18n.msgStr("usernameOrEmail");
  }

  return i18n.msgStr("email");
}

/**
 * Keycloak's `messageHeader`, resolved - or undefined when it cannot be.
 *
 * It is a message *key*, not text: Keycloak's own templates render it as
 * `msg("${messageHeader}")`. Rendering it raw is how the update-password flow ended on a page
 * headed "accountUpdatedTitle".
 *
 * On a real Keycloak the server resolves it: Keycloakify's generated template looks up every
 * key-shaped string in the context with Keycloak's own msg() and passes the result in
 * `x-keycloakify.messages`, which advancedMsgStr checks first - so this works for headers
 * Keycloakify's bundled messages lack, such as accountUpdatedTitle. It only fails for a key the
 * server has no message for either. advancedMsgStr returns such a key unchanged, which is the
 * only signal available - so that becomes undefined here, and each page says what it would
 * rather show than a key.
 */
export function resolvedHeading(
  messageHeader: string | undefined,
  advancedMsgStr: (key: string) => string
): string | undefined {
  if (messageHeader === undefined) {
    return undefined;
  }

  const resolved = advancedMsgStr(messageHeader);

  return resolved === messageHeader ? undefined : resolved;
}

/**
 * First validation error across the given field names, or undefined.
 *
 * The first field is a separate parameter because Keycloakify types existsError as
 * (first: string, ...rest: string[]), so spreading a plain string[] into it does not
 * typecheck.
 */
export function errorOf(
  kcContext: KcContext,
  field: string,
  ...moreFields: string[]
): string | undefined {
  const mpf = kcContext.messagesPerField;
  return mpf.existsError(field, ...moreFields)
    ? mpf.getFirstError(field, ...moreFields)
    : undefined;
}
