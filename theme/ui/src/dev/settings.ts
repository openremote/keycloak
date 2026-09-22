/*
 * Dev-only feature toggles.
 *
 * Most of what a login page shows is not layout, it is the realm's configuration: registration,
 * password reset, remember-me, identity providers, internationalization. Keycloak's mocks happen
 * to enable one arbitrary mixture, so the harness could only ever show that mixture.
 *
 * Every page therefore starts from the barest state the theme can be asked to render - see
 * `applyMinimal` - and the rail offers one checkbox per feature on top of it. They compose, so
 * any combination is reachable, and the selection lives in `&settings=` as a comma-separated
 * list so it survives a reload and is shareable.
 *
 * **Nothing here hardcodes Keycloak's field names.** The toggles are discovered by walking the
 * mock for boolean values, which means a Keycloak or Keycloakify upgrade that adds a realm flag
 * grows a checkbox on its own, and one that removes a flag loses it - rather than leaving a
 * control that silently sets a key nothing reads. The handful of features that are not a plain
 * boolean are declared below, and each is guarded by a check that its field still exists, so
 * they disappear the same way instead of going quietly dead.
 */
import type { KcContext } from "../login/KcContext";

export type Toggle = {
  /** Dotted path into the mock, which is also the token in the URL. */
  id: string;
  /** Rail label. Derived from the id, so it cannot drift from what it sets. */
  label: string;
  enable: (kcContext: KcContext) => void;
};

type Mock = Record<string, unknown>;

/*
 * The objects a feature flag can live on. Deliberately shallow and explicit rather than a deep
 * walk: `profile.attributesByName.*.required` and `social.displayInfo` are booleans too, and
 * neither is a realm feature - a deep walk would turn every one of them into a checkbox.
 */
const SCOPES = ["", "realm", "auth"] as const;

/**
 * Booleans that must not be forced off, because they are not features.
 *
 * `realm.password` gates the entire login form: with it off there is no form at all, which is a
 * real Keycloak state but not a sensible thing to land on. Anything else that turns out to
 * belong here should arrive with the same kind of reason.
 *
 * Listed by dotted path. An entry that no longer matches anything is simply never applied, so
 * this going stale costs nothing.
 */
const ALWAYS_ON = new Set(["realm.password"]);

function scopeOf(kcContext: KcContext, scope: string): Mock | undefined {
  const root = kcContext as unknown as Mock;
  return scope === "" ? root : (root[scope] as Mock | undefined);
}

function pathOf(scope: string, key: string): string {
  return scope === "" ? key : `${scope}.${key}`;
}

/** "realm.resetPasswordAllowed" -> "reset password allowed". */
function humanize(id: string): string {
  return id
    .slice(id.lastIndexOf(".") + 1)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/** Every boolean the mock exposes for this page, as a path -> current value map. */
function booleanFlags(kcContext: KcContext): Map<string, boolean> {
  const flags = new Map<string, boolean>();

  for (const scope of SCOPES) {
    const target = scopeOf(kcContext, scope);

    if (target === undefined || target === null) {
      continue;
    }

    for (const [key, value] of Object.entries(target)) {
      if (typeof value === "boolean") {
        flags.set(pathOf(scope, key), value);
      }
    }
  }

  return flags;
}

function setPath(kcContext: KcContext, id: string, value: unknown): void {
  const dot = id.lastIndexOf(".");
  const target = scopeOf(kcContext, dot === -1 ? "" : id.slice(0, dot));

  if (target !== undefined && target !== null) {
    target[id.slice(dot + 1)] = value;
  }
}

/*
 * Features that are not a boolean, so they cannot be discovered.
 *
 * `available` is what keeps these honest: it asks the mock whether the field is still there, and
 * a toggle whose field has gone is not offered. That is the difference between "this Keycloak
 * does not have that" and "this harness quietly stopped working".
 */
type Extra = {
  id: string;
  label: string;
  available: (kcContext: KcContext) => boolean;
  enable: (kcContext: KcContext) => void;
};

const EXTRAS: Extra[] = [
  {
    id: "social.providers",
    label: "identity providers",
    available: kcContext => (kcContext as unknown as Mock).social !== undefined,
    enable: kcContext => {
      const social = (kcContext as unknown as Mock).social as Mock;

      social.providers = ["GitHub", "Google"].map(displayName => ({
        // A placeholder like the rest of the mock's URLs; dev-mode turns it into a flow marker.
        loginUrl: "#",
        alias: displayName.toLowerCase(),
        providerId: displayName.toLowerCase(),
        displayName
      }));
    }
  },
  {
    id: "totp.manual",
    // Reached by clicking "Unable to scan?": a different set of steps and the secret in text.
    label: "unable to scan",
    available: kcContext => (kcContext as unknown as Mock).totp !== undefined,
    enable: kcContext => setPath(kcContext, "mode", "manual")
  },
  {
    id: "otpLogin.oneDevice",
    // The mock has two credentials, so the device picker is always up. With one, Keycloak sends
    // no picker at all and the page is just the code field.
    label: "single 2FA device",
    available: kcContext => (kcContext as unknown as Mock).otpLogin !== undefined,
    enable: kcContext => {
      const otpLogin = (kcContext as unknown as Mock).otpLogin as {
        userOtpCredentials: unknown[];
      };

      otpLogin.userOtpCredentials = otpLogin.userOtpCredentials.slice(0, 1);
    }
  },
  {
    id: "message.error",
    /*
     * Deliberately the alert rather than a per-field error: the pages suppress the alert when a
     * field carries its own message - Keycloak's own rule - so setting both would show neither
     * this nor anything new. The design draws this state as "Login fail", node 768:22783.
     */
    label: "error message",
    available: () => true,
    enable: kcContext => {
      (kcContext as unknown as Mock).message = {
        type: "error",
        summary: "Invalid username or password."
      };
    }
  },
  {
    id: "message.success",
    // Where "Forgot password" lands: Keycloak returns to the login page with this message
    // (ResetCredentialEmail, forkWithSuccessMessage). Keycloak's own English wording.
    label: "success message",
    available: () => true,
    enable: kcContext => {
      (kcContext as unknown as Mock).message = {
        type: "success",
        summary: "You should receive an email shortly with further instructions."
      };
    }
  },
  {
    id: "switchOrganizationEnabled",
    /*
     * Keycloak sends it and layout.ts renders the control, but Keycloakify's mocks do not carry
     * the field at all, so it cannot be discovered - and there is no mock field for `available`
     * to check. It is this theme's own declaration (KcContextExtension), which is what makes it
     * safe to offer unconditionally; the relevance filter still drops it where it does nothing.
     */
    label: "switch organization enabled",
    available: () => true,
    enable: kcContext => setPath(kcContext, "switchOrganizationEnabled", true)
  }
];

/**
 * The toggles available on this page, in a stable order: discovered flags first, then the
 * declared extras that still apply.
 */
export function togglesFor(kcContext: KcContext): Toggle[] {
  const discovered = [...booleanFlags(kcContext).keys()]
    .filter(id => !ALWAYS_ON.has(id))
    .sort()
    .map(id => ({
      id,
      label: humanize(id),
      enable: (target: KcContext) => setPath(target, id, true)
    }));

  // If a mock ever starts carrying a field declared here, discovery owns it and the declaration
  // steps aside rather than producing the same checkbox twice.
  const extras = EXTRAS.filter(
    extra => extra.available(kcContext) && !discovered.some(toggle => toggle.id === extra.id)
  ).map(({ id, label, enable }) => ({ id, label, enable }));

  return [...discovered, ...extras];
}

/**
 * Turns every discovered feature off. The floor the previews start from.
 *
 * Derived rather than a list of names, so it cannot fall out of step with Keycloak: whatever the
 * mock says is a boolean feature gets switched off, and `social.providers` is cleared because a
 * toggle sets it and switching pages must not carry it along.
 */
export function applyMinimal(kcContext: KcContext): void {
  for (const id of booleanFlags(kcContext).keys()) {
    if (!ALWAYS_ON.has(id)) {
      setPath(kcContext, id, false);
    }
  }

  const social = (kcContext as unknown as Mock).social as Mock | undefined;

  if (social !== undefined) {
    social.providers = undefined;
  }
}

/**
 * Splits `toggles` into the ones worth offering right now and the ones that would do nothing.
 *
 * Discovery finds every boolean the mock carries, and the mocks share a common base - so the
 * info page offered "show username" and "registration email as username", neither of which it
 * reads. Rather than keep a per-page list of what matters (which is exactly the hardcoding
 * discovery exists to avoid), this asks the page: render it as it is, render it again with the
 * toggle ticked, and keep the toggle only if the markup changed.
 *
 * Measured against the *current* selection, not the bare default, because some features only
 * mean something in combination. `registrationEmailAsUsername` changes nothing on the login page
 * until `loginWithEmailAllowed` is on, so it appears once that is ticked - which is also the
 * clearest possible way of showing that one depends on the other.
 *
 * Toggles already ticked are always shown, whatever they currently do, so they can be unticked.
 *
 * `markupWith` must render the real page for a given selection and return comparable markup.
 * The comparison only sees the rendered DOM - a toggle whose sole effect was a property binding
 * (`.value=`) would read as having none - and no page here has one.
 */
export function effectiveToggles(
  toggles: readonly Toggle[],
  active: readonly string[],
  markupWith: (settings: readonly string[]) => string
): { shown: Toggle[]; hidden: Toggle[] } {
  const current = markupWith(active);

  /*
   * Fail open. If the same selection does not render the same markup twice, every toggle would
   * look relevant or, worse, the comparison would be noise - so show everything and say why,
   * rather than hide a control on the strength of a meaningless diff.
   */
  if (markupWith(active) !== current) {
    console.warn("[dev] page markup is not deterministic; showing every setting unfiltered");
    return { shown: [...toggles], hidden: [] };
  }

  const shown: Toggle[] = [];
  const hidden: Toggle[] = [];

  for (const toggle of toggles) {
    const matters =
      active.includes(toggle.id) || markupWith([...active, toggle.id]) !== current;

    (matters ? shown : hidden).push(toggle);
  }

  return { shown, hidden };
}

/** Parses the URL's `settings` parameter into the ids it names. */
export function readSettings(search: string): string[] {
  const raw = new URLSearchParams(search).get("settings");
  return raw === null || raw === "" ? [] : raw.split(",").map(id => id.trim());
}

/** Applies the named toggles, ignoring any this page does not offer. */
export function applySettings(kcContext: KcContext, ids: readonly string[]): void {
  const available = new Map(togglesFor(kcContext).map(toggle => [toggle.id, toggle]));

  for (const id of ids) {
    available.get(id)?.enable(kcContext);
  }
}
