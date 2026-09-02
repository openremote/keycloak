import { html, nothing, type TemplateResult } from "lit";
import { html as staticHtml, literal } from "lit/static-html.js";
import "@openremote/or-vaadin-components/or-vaadin-text-field";
import "@openremote/or-vaadin-components/or-vaadin-password-field";
import "@openremote/or-vaadin-components/or-vaadin-email-field";
import "@openremote/or-vaadin-components/or-vaadin-checkbox";
import "@openremote/or-vaadin-components/or-vaadin-radio-group";
import "@openremote/or-vaadin-components/or-vaadin-select";
import type { Attribute } from "keycloakify/login/KcContext";
import type { I18n } from "./i18n";
import type { KcContext } from "./login/KcContext";
import { errorOf } from "./layout";

/*
 * Rendering for Keycloak's declarative user profile.
 *
 * From Keycloak 24 the registration form is whatever the realm's User Profile configuration
 * says it is - not a fixed list of four fields. Each attribute carries the metadata needed to
 * render it, and ignoring that metadata does not degrade gracefully: an attribute configured
 * as a select renders as a free-text box that accepts anything, a read-only one becomes
 * editable, and a multivalued one silently keeps only its first value.
 *
 * This mirrors Keycloak's own user-profile-commons.ftl. What it deliberately does *not* cover
 * is listed in UNSUPPORTED_INPUT_TYPES below.
 */

const TAGS = {
  text: literal`or-vaadin-text-field`,
  password: literal`or-vaadin-password-field`,
  email: literal`or-vaadin-email-field`
};

/** The html5-* input types Keycloak allows, minus the "html5-" prefix. */
function nativeInputType(attribute: Attribute): string {
  const inputType = attribute.annotations.inputType;

  if (inputType?.startsWith("html5-")) {
    return inputType.slice("html5-".length);
  }

  return attribute.name === "email" ? "email" : "text";
}

/** Options come either from the attribute's own annotation or from its options validator. */
function optionsOf(attribute: Attribute): string[] {
  return attribute.validators.options?.options ?? [];
}

/**
 * Label for one option. Keycloak allows an explicit map, a message-key prefix, or neither -
 * in which case the raw option value is the label.
 */
function optionLabel(attribute: Attribute, option: string, i18n: I18n): string {
  const explicit = attribute.annotations.inputOptionLabels?.[option];

  if (explicit !== undefined) {
    return i18n.advancedMsgStr(explicit);
  }

  const prefix = attribute.annotations.inputOptionLabelsI18nPrefix;

  return prefix ? i18n.advancedMsgStr(`${prefix}.${option}`) : option;
}

export type ProfileFieldOptions = {
  kcContext: KcContext;
  i18n: I18n;
  attribute: Attribute;
  autofocus?: boolean;
};

/** One user-profile attribute, rendered according to its metadata. */
export function profileField(options: ProfileFieldOptions): TemplateResult {
  const { kcContext, i18n, attribute, autofocus = false } = options;
  const error = errorOf(kcContext, attribute.name);
  /* displayName is a message key wrapped as ${...} for built-in attributes and free text for
     anything a realm added; advancedMsgStr handles both. */
  const label = i18n.advancedMsgStr(attribute.displayName ?? attribute.name);
  const inputType = attribute.annotations.inputType ?? "";
  const helperAfter = attribute.annotations.inputHelperTextAfter;
  const helperBefore = attribute.annotations.inputHelperTextBefore;

  const control = (() => {
    switch (inputType) {
      case "textarea":
        return textarea(options, label, error);
      case "select":
        return select(options, label, error);
      case "select-radiobuttons":
        return radioGroup(options, label, error);
      case "multiselect":
      case "multiselect-checkboxes":
        return checkboxes(options, label, error);
      default:
        return input(options, label, error);
    }
  })();

  if (helperBefore === undefined && helperAfter === undefined) {
    return control;
  }

  return html`
    <div class="or-profile-field">
      ${helperBefore
        ? html`<p class="or-field-help">${i18n.advancedMsgStr(helperBefore)}</p>`
        : null}
      ${control}
      ${helperAfter ? html`<p class="or-field-help">${i18n.advancedMsgStr(helperAfter)}</p>` : null}
    </div>
  `;
}

/*
 * Every control below sets name/value/required on the *component*, never on the slotted
 * input - Vaadin's InputControlMixin manages that element and drops anything it did not set
 * itself, which produces an unnamed field that posts nothing. See field() in layout.ts.
 */

function input(
  options: ProfileFieldOptions,
  label: string,
  error: string | undefined
): TemplateResult {
  const { attribute, autofocus } = options;
  const type = nativeInputType(attribute);
  const tag = TAGS[type === "password" ? "password" : type === "email" ? "email" : "text"];
  const annotations = attribute.annotations;

  /*
   * A multivalued attribute is several inputs sharing one name; the browser posts each, and
   * Keycloak reads them as a list. Rendering only attribute.value would silently drop the rest.
   */
  const values = attribute.multivalued ? (attribute.values ?? [""]) : [attribute.value ?? ""];

  return html`${values.map(
    (value, index) => staticHtml`
      <${tag}
        class="or-field"
        name=${attribute.name}
        .value=${value}
        ?required=${attribute.required}
        ?readonly=${attribute.readOnly}
        ?invalid=${index === 0 && !!error}
        autocomplete=${attribute.autocomplete ?? "off"}
        placeholder=${annotations.inputTypePlaceholder ?? nothing}
        pattern=${annotations.inputTypePattern ?? nothing}
        minlength=${annotations.inputTypeMinlength ?? nothing}
        maxlength=${annotations.inputTypeMaxlength ?? nothing}
        min=${annotations.inputTypeMin ?? nothing}
        max=${annotations.inputTypeMax ?? nothing}
        step=${annotations.inputTypeStep ?? nothing}
      >
        <label slot="label">${index === 0 ? label : ""}</label>
        <input slot="input" type=${type} ?autofocus=${autofocus && index === 0} />
        ${index === 0 && error ? html`<div slot="error-message">${error}</div>` : null}
      </${tag}>
    `
  )}`;
}

function textarea(
  options: ProfileFieldOptions,
  label: string,
  error: string | undefined
): TemplateResult {
  const { attribute } = options;

  return html`
    <or-vaadin-text-area
      class="or-field"
      ?required=${attribute.required}
      ?readonly=${attribute.readOnly}
      ?invalid=${!!error}
      rows=${attribute.annotations.inputTypeRows ?? nothing}
      maxlength=${attribute.annotations.inputTypeMaxlength ?? nothing}
    >
      <label slot="label">${label}</label>
      <!--
        The opposite rule to the text fields: TextArea reuses the slotted textarea without
        managing it, so the name must go *here* and is ignored on the host. Verified with
        FormData - do not assume the components agree with each other.
      -->
      <textarea slot="textarea" name=${attribute.name} .value=${attribute.value ?? ""}></textarea>
      ${error ? html`<div slot="error-message">${error}</div>` : null}
    </or-vaadin-text-area>
  `;
}

function select(
  options: ProfileFieldOptions,
  label: string,
  error: string | undefined
): TemplateResult {
  const { attribute, i18n } = options;
  const items = optionsOf(attribute).map(option => ({
    value: option,
    label: optionLabel(attribute, option, i18n)
  }));

  /*
   * or-vaadin-select renders a button and an overlay - there is no native form control inside
   * it at all, so `name` on the host posts nothing. As with the radio group, the value is
   * carried by a hidden input kept in step with the component.
   */
  return html`
    <input type="hidden" name=${attribute.name} .value=${attribute.value ?? ""} />
    <or-vaadin-select
      class="or-field"
      .value=${attribute.value ?? ""}
      .items=${items}
      ?required=${attribute.required}
      ?readonly=${attribute.readOnly}
      ?invalid=${!!error}
      @value-changed=${syncHiddenCarrier(attribute.name)}
    >
      <label slot="label">${label}</label>
      ${error ? html`<div slot="error-message">${error}</div>` : null}
    </or-vaadin-select>
  `;
}

/**
 * Mirrors a Vaadin component's value into the hidden input that actually gets posted.
 *
 * Needed wherever the component has no native form control of its own (select) or renames the
 * ones it owns (radio group). Same shape as the OTP device picker in src/pages/otp.ts.
 */
function syncHiddenCarrier(name: string): (event: Event) => void {
  return event => {
    const source = event.currentTarget as HTMLElement & { value?: string };
    const carrier = source
      .closest("form")
      ?.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);

    if (carrier && typeof source.value === "string") {
      carrier.value = source.value;
    }
  };
}

/**
 * Both of Keycloak's multi-value pickers, rendered as a list of checkboxes.
 *
 * A plain list of checkboxes sharing one name is the only shape that posts a *list* correctly:
 * the browser sends one parameter per checked box, which is exactly what Keycloak reads back
 * into a multivalued attribute. Vaadin's own checkbox-group would rename its children, and a
 * hidden carrier input can hold only one value.
 *
 * `multiselect` is a dropdown in Keycloak's theme rather than checkboxes. Rendering it as
 * checkboxes is a deliberate simplification - same semantics, one control to get right.
 */
function checkboxes(
  options: ProfileFieldOptions,
  label: string,
  error: string | undefined
): TemplateResult {
  const { attribute, i18n } = options;
  const selected = new Set(attribute.values ?? (attribute.value ? [attribute.value] : []));

  return html`
    <fieldset class="or-field or-checkboxes" ?disabled=${attribute.readOnly}>
      <legend>${label}</legend>
      ${optionsOf(attribute).map(
        option => html`
          <or-vaadin-checkbox
            class="or-field"
            name=${attribute.name}
            value=${option}
            ?checked=${selected.has(option)}
          >
            <label slot="label">${optionLabel(attribute, option, i18n)}</label>
            <input slot="input" type="checkbox" />
          </or-vaadin-checkbox>
        `
      )}
      ${error ? html`<p class="or-field-error">${error}</p>` : null}
    </fieldset>
  `;
}

function radioGroup(
  options: ProfileFieldOptions,
  label: string,
  error: string | undefined
): TemplateResult {
  const { attribute, i18n } = options;

  /* Same trap as the OTP device picker: the group renames the radios it owns and resets
     their values, so the posted value comes from a hidden input kept in step with it. */
  return html`
    <input type="hidden" name=${attribute.name} .value=${attribute.value ?? ""} />
    <or-vaadin-radio-group
      class="or-field"
      .value=${attribute.value ?? ""}
      ?required=${attribute.required}
      ?readonly=${attribute.readOnly}
      ?invalid=${!!error}
      @value-changed=${syncHiddenCarrier(attribute.name)}
    >
      <label slot="label">${label}</label>
      ${optionsOf(attribute).map(
        option => html`
          <vaadin-radio-button value=${option}>
            <label slot="label">${optionLabel(attribute, option, i18n)}</label>
          </vaadin-radio-button>
        `
      )}
      ${error ? html`<div slot="error-message">${error}</div>` : null}
    </or-vaadin-radio-group>
  `;
}
