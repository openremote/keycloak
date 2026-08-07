import { html, type TemplateResult } from "lit";
import { html as staticHtml, literal } from "lit/static-html.js";
import type { KcContext } from "./login/KcContext";

export type LayoutOptions = {
  kcContext: KcContext;
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
  content: TemplateResult;
};

/**
 * Shared card chrome: the brand lockup, the card, and the one place kcContext.message is
 * rendered. Every page goes through it.
 */
export function layout(options: LayoutOptions): TemplateResult {
  const { kcContext, heading, intro, back, suppressWarning, content } = options;
  const hasFieldError = kcContext.messagesPerField.existsError(
    "username",
    "password",
    "totp",
    "email"
  );
  const message =
    suppressWarning && kcContext.message?.type === "warning" ? undefined : kcContext.message;

  return html`
    <main class="or-login">
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
            <!-- The one place kcContext.message is rendered. Suppressed when a field-level
                 error already says the same thing; pages must not render it themselves
                 either - error.ftl did, and printed every message twice. -->
            ${message && !hasFieldError
              ? html`<div class="or-alert or-alert--${message.type}" role="alert">
                  <span>${message.summary}</span>
                </div>`
              : null}
            ${content}
          </div>
        </div>
      </div>
    </main>
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
  return html`
    <div class="or-submit">
      <or-vaadin-button class="or-submit__styled" theme=${theme} @click=${submitOwningForm}>
        ${label}
      </or-vaadin-button>
      <button class="or-submit__fallback" type="submit" name=${name ?? ""} value=${value ?? ""}>
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
 * `autofocus`, `inputmode` and `dir` survive on the input itself.
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
    >
      <label slot="label">${label}</label>
      <input
        slot="input"
        type=${type === "email" ? "email" : type === "password" ? "password" : "text"}
        ?autofocus=${autofocus}
        inputmode=${numeric ? "numeric" : "text"}
        dir=${numeric ? "ltr" : "auto"}
      />
      ${error ? html`<div slot="error-message">${error}</div>` : null}
    </${tag}>
  `;
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
