/*
 * Dev-only navigation between pages.
 *
 * In production every link and form on these pages goes back to Keycloak, and Keycloak's
 * authentication flow - which runs on the server and appears nowhere in the mocks - decides
 * what comes next. The harness has no server, so every "Sign In", "Review profile" and "Cancel"
 * posted to a URL the dev server does not serve, and the language dropdown navigated to a GitHub
 * gist, which is what the mock happens to put there.
 *
 * How it works:
 *
 *   - `rewriteNavigation` replaces every navigation URL in a page's mock with a marker naming the
 *     field it came from, e.g. `#dev-flow:url.loginAction`. Fields are found by naming convention
 *     rather than by a list, so a URL field a Keycloak upgrade adds is caught as well.
 *   - Following a link, choosing a language or submitting a form resolves that marker - together
 *     with the submit button's name and value, which is how Keycloak itself tells "Review profile"
 *     from "Add to existing account" - against FLOWS below.
 *
 * FLOWS is the one place the harness has to know Keycloak's flow, because that knowledge lives on
 * the server. It is kept honest three ways: every destination is checked against the page ids
 * the mocks actually contain; a control with no entry says so on screen instead of doing nothing;
 * and where Keycloak's answer depends on data or realm configuration the harness offers each
 * outcome rather than pretending there is only one. The transitions were checked against
 * Keycloak 26.7's own authenticators, not guessed - the notable ones are noted where they appear.
 */
import { html, nothing, render } from "lit";
import { kcContextMocks } from "keycloakify/login/KcContext/kcContextMocks";
import type { KcContext } from "../login/KcContext";
import { implementedPageIds } from "../page-registry";
import { KC_ACTION } from "./compare";
import { injectStyles } from "./styles";

const MARKER = "#dev-flow:";

export type Outcome =
  /** Go to another page, optionally with settings that describe the state it arrives in. */
  | { label: string; page: string; settings?: readonly string[] }
  /** Stay on this page and change its state - a mode switch, a language. */
  | { label: string; stay: { add?: readonly string[]; remove?: readonly string[]; lang?: string } }
  /** Keycloak is done and hands over to the application; there is no page left to show. */
  | { label: string; leaves: true };

const leaves = (label: string): Outcome => ({ label, leaves: true });

/*
 * Keys are `<field path>`, optionally followed by `|<submit name>` or `|<submit name>=<value>`.
 * Numeric path segments are written as `*`. Lookup tries the most specific key first, on this
 * page and then under "*", before falling back to a less specific one - so a named button such as
 * "Try Another Way" is never swallowed by a page's entry for its plain Submit.
 */
const FLOWS: Record<string, Record<string, readonly Outcome[] | (() => readonly Outcome[])>> = {
  "*": {
    "url.loginUrl": [{ label: "Log in", page: "login.ftl" }],
    "url.loginRestartFlowUrl": [{ label: "Restart the login", page: "login.ftl" }],
    "url.registrationUrl": [{ label: "Register", page: "register.ftl" }],
    "url.loginResetCredentialsUrl": [{ label: "Reset password", page: "login-reset-password.ftl" }],
    // DefaultAuthenticationFlow: tryAnotherWay -> createSelectAuthenticatorsScreen.
    "url.loginAction|tryAnotherWay": [
      { label: "Choose another way to log in", page: "select-authenticator.ftl" }
    ],
    // DefaultAuthenticationFlow: switchOrganization clears the attempted username and returns
    // to the identity-first username step.
    "url.loginAction|switchOrganization": [
      { label: "Enter a different username", page: "login-username.ftl" }
    ],
    "client.baseUrl": [leaves("Back to the application")],
    pageRedirectUri: [leaves("Back to the application")]
  },

  "login.ftl": {
    /*
     * A wrong password lands on the design's error state. Keycloak itself attaches that message
     * to the credential fields rather than the alert; the harness has no per-field error to set,
     * so the alert is the nearest preview of it.
     */
    "url.loginAction|login": [
      leaves("Correct credentials: signed in, back to the application"),
      { label: "Wrong username or password", page: "login.ftl", settings: ["message.error"] },
      { label: "User has 2FA set up", page: "login-otp.ftl" }
    ],
    // The provider sends the user back into the realm's first broker login flow.
    "social.providers.*.loginUrl": [
      { label: "First sign-in, profile needs review", page: "idp-review-user-profile.ftl" },
      { label: "Email already belongs to a local account", page: "login-idp-link-confirm.ftl" },
      leaves("Already linked: signed in, back to the application")
    ]
  },

  "register.ftl": {
    "url.registrationAction|register": [
      leaves("Account created: signed in, back to the application"),
      { label: "Realm requires email verification", page: "login-verify-email.ftl" }
    ]
  },

  // ResetCredentialEmail: forkWithSuccessMessage(emailSentMessage) - back to the login page with
  // a success message, not to info.ftl.
  "login-reset-password.ftl": {
    "url.loginAction": [
      { label: "Email sent", page: "login.ftl", settings: ["message.success"] }
    ]
  },

  "login-config-totp.ftl": {
    "url.loginAction": [leaves("2FA set up: the login continues to the application")],
    "url.loginAction|cancel-aia": [leaves("Cancelled: back to the application")],
    "totp.manualUrl": [{ label: "Enter the key by hand", stay: { add: ["totp.manual"] } }],
    "totp.qrUrl": [{ label: "Scan the code", stay: { remove: ["totp.manual"] } }]
  },

  "login-otp.ftl": {
    "url.loginAction": [leaves("Code accepted: signed in, back to the application")]
  },

  "login-update-password.ftl": {
    "url.loginAction": [leaves("Password changed: the login continues to the application")],
    "url.loginAction|cancel-aia": [leaves("Cancelled: back to the application")]
  },

  "login-update-profile.ftl": {
    "url.loginAction": [leaves("Profile updated: the login continues to the application")],
    "url.loginAction|cancel-aia": [leaves("Cancelled: back to the application")]
  },

  "idp-review-user-profile.ftl": {
    // Next in the first broker login flow is Create User If Unique.
    "url.loginAction": [
      leaves("No local account with this email: account created, signed in"),
      { label: "Email already belongs to a local account", page: "login-idp-link-confirm.ftl" }
    ]
  },

  "login-idp-link-confirm.ftl": {
    // IdpConfirmLinkAuthenticator: updateProfile resets the flow with ENFORCE_UPDATE_PROFILE,
    // which makes Review Profile show regardless of its own setting.
    "url.loginAction|submitAction=updateProfile": [
      { label: "Review profile", page: "idp-review-user-profile.ftl" }
    ],
    // linkAccount moves on to verifying the existing account. By email when the realm can send
    // mail; otherwise IdpUsernamePasswordForm asks for that account's password on the login page.
    "url.loginAction|submitAction=linkAccount": [
      { label: "Realm verifies by email", page: "login-idp-link-email.ftl" },
      {
        label: "Realm verifies by password (no email configured)",
        page: "login.ftl",
        settings: ["usernameHidden"]
      }
    ]
  },

  "login-idp-link-email.ftl": {
    // Both "Click here" links are the same GET of the login action; the server tells them apart.
    "url.loginAction": [
      { label: "Email sent again", stay: {} },
      leaves("Already verified in another browser: account linked, signed in")
    ]
  },

  "login-page-expired.ftl": {
    "url.loginAction": [{ label: "Continue the login", page: "login.ftl" }]
  },

  "info.ftl": {
    /*
     * "Proceed with action" continues whatever the emailed link asked for, which the page does
     * not know. Offered as every implemented page Keycloak can run as a required action - derived
     * from the compare pane's own table, not repeated here.
     */
    actionUri: () => [
      ...Object.keys(KC_ACTION)
        .filter(pageId => implementedPageIds.includes(pageId))
        .map(pageId => ({ label: `Continue to ${pageId.replace(/\.ftl$/, "")}`, page: pageId })),
      leaves("Nothing left to do: back to the application")
    ]
  }
};

/*
 * Navigation fields in the mocks, by naming convention: anything under `url`, anything ending in
 * Url, Uri or Action, and the `url` of each supported locale.
 *
 * The value check keeps out names that fit the convention but are not addresses - `recaptchaAction`
 * is a reCAPTCHA action name, "login" - and `resources*` is where the theme loads its own assets
 * from, which must keep working.
 */
function isNavigation(key: string, parentKey: string, value: string): boolean {
  if (/resources/i.test(key)) {
    return false;
  }

  const named = parentKey === "url" || key === "url" || /(?:Url|Uri|Action)$/.test(key);

  return named && /^(?:#|\/|\?|https?:)/.test(value);
}

/** Replaces every navigation URL in the mock with a marker naming its field. */
export function rewriteNavigation(kcContext: KcContext): void {
  const seen = new WeakSet<object>();

  const walk = (node: object, path: string, parentKey: string): void => {
    if (seen.has(node)) {
      return;
    }

    seen.add(node);

    for (const [key, value] of Object.entries(node)) {
      const here = path === "" ? key : `${path}.${key}`;

      if (typeof value === "string") {
        if (isNavigation(key, parentKey, value)) {
          (node as Record<string, unknown>)[key] = `${MARKER}${here}`;
        }
      } else if (value !== null && typeof value === "object") {
        walk(value, here, key);
      }
    }
  };

  walk(kcContext, "", "");
}

type Submitter = { name: string; value: string };

function outcomesFor(
  pageId: string,
  path: string,
  submitter: Submitter | undefined,
  kcContext: KcContext | undefined
): readonly Outcome[] | undefined {
  const general = path.replace(/\.\d+(?=\.|$)/g, ".*");

  // A language is data, not flow: the right destination is this page, in that language.
  const locale = /^locale\.supported\.(\d+)\.url$/.exec(path);

  if (locale !== null) {
    const supported = (kcContext as { locale?: { supported: { languageTag: string }[] } })
      ?.locale?.supported;
    const tag = supported?.[Number(locale[1])]?.languageTag;

    return tag === undefined ? undefined : [{ label: tag, stay: { lang: tag } }];
  }

  const keys: string[] = [];

  if (submitter !== undefined && submitter.name !== "") {
    if (submitter.value !== "") {
      keys.push(`${general}|${submitter.name}=${submitter.value}`);
    }
    keys.push(`${general}|${submitter.name}`);
  }

  keys.push(general);

  for (const key of keys) {
    for (const scope of [pageId, "*"]) {
      const entry = FLOWS[scope]?.[key];

      if (entry !== undefined) {
        return typeof entry === "function" ? entry() : entry;
      }
    }
  }

  return undefined;
}

const STYLES = `
/* Closing the panel renders nothing into it, so there is no separate hidden flag to keep in step
   with what is on screen. */
.dev-flow:empty { display: none; }
.dev-flow {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  width: min(26rem, calc(100vw - 2rem));
  box-sizing: border-box;
  padding: 0.8rem;
  border-radius: 6px;
  background: #17181a;
  color: #fff;
  font: 12px/1.5 system-ui, sans-serif;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}
.dev-flow__title { margin: 0 0 0.5rem; color: rgba(255, 255, 255, 0.55); }
.dev-flow__options { display: flex; flex-direction: column; gap: 0.3rem; }
.dev-flow button {
  padding: 0.35rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.dev-flow button:hover { background: rgba(255, 255, 255, 0.14); }
.dev-flow__leaves { margin: 0; padding: 0.35rem 0.5rem; color: rgba(255, 255, 255, 0.7); }
.dev-flow__close { margin-top: 0.5rem; }
`;

export type FlowOptions = {
  pageId: () => string;
  /** The context the page on screen was rendered from; the language switcher needs its locales. */
  kcContext: () => KcContext | undefined;
  /** Pushes the query string and re-renders, like the rail does. */
  navigate: (search: string) => void;
};

/** Checks every destination in FLOWS against the page ids the mocks contain. */
function validateFlows(): void {
  const known = new Set(kcContextMocks.map(mock => mock.pageId as string));
  const unknown = new Set<string>();

  for (const entries of Object.values(FLOWS)) {
    for (const entry of Object.values(entries)) {
      const outcomes = typeof entry === "function" ? entry() : entry;

      for (const outcome of outcomes) {
        if ("page" in outcome && !known.has(outcome.page)) {
          unknown.add(outcome.page);
        }
      }
    }
  }

  if (unknown.size > 0) {
    console.warn(
      `[dev] src/dev/flows.ts points at pages the mocks no longer have: ${[...unknown].join(", ")}`
    );
  }
}

export function installFlows(options: FlowOptions): void {
  validateFlows();

  injectStyles(STYLES);

  /*
   * The panel is a host element kept across renders - it is positioned against the viewport, so it
   * has to be a child of body - and Lit renders its contents.
   */
  const panel = document.createElement("div");
  panel.className = "dev-flow";
  panel.setAttribute("role", "dialog");
  document.body.appendChild(panel);

  const close = (): void => {
    render(nothing, panel);
  };

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && panel.hasChildNodes()) {
      close();
    }
  });

  const go = (outcome: Outcome): void => {
    close();

    if ("leaves" in outcome) {
      return;
    }

    const params = new URLSearchParams(location.search);

    if ("page" in outcome) {
      params.set("page", outcome.page);

      if (outcome.settings !== undefined && outcome.settings.length > 0) {
        params.set("settings", outcome.settings.join(","));
      } else {
        // Settings belong to the page that offered them.
        params.delete("settings");
      }
    } else {
      const current = (params.get("settings") ?? "").split(",").filter(Boolean);
      const next = [
        ...current.filter(id => !(outcome.stay.remove ?? []).includes(id)),
        ...(outcome.stay.add ?? []).filter(id => !current.includes(id))
      ];

      if (next.length > 0) {
        params.set("settings", next.join(","));
      } else {
        params.delete("settings");
      }

      if (outcome.stay.lang !== undefined) {
        params.set("lang", outcome.stay.lang);
      }
    }

    options.navigate(`?${params}`);
  };

  const present = (title: string, outcomes: readonly Outcome[]): void => {
    // One destination is not a question.
    if (outcomes.length === 1 && !("leaves" in outcomes[0])) {
      go(outcomes[0]);
      return;
    }

    render(
      html`
        <p class="dev-flow__title">
          ${outcomes.length === 1
            ? `${title} — Keycloak leaves the login flow here:`
            : `${title} — what Keycloak does next depends on the realm or the data:`}
        </p>
        <div class="dev-flow__options">
          ${outcomes.map(outcome =>
            "leaves" in outcome
              ? html`<p class="dev-flow__leaves">${outcome.label} (no page to show)</p>`
              : html`<button type="button" @click=${() => go(outcome)}>${outcome.label}</button>`
          )}
        </div>
        <button type="button" class="dev-flow__close" @click=${close}>Close</button>
      `,
      panel
    );

    panel.querySelector("button")?.focus();
  };

  const resolve = (title: string, target: string | null, submitter?: Submitter): boolean => {
    if (target === null || !target.startsWith(MARKER)) {
      return false;
    }

    const path = target.slice(MARKER.length);
    const pageId = options.pageId();
    const outcomes = outcomesFor(pageId, path, submitter, options.kcContext());

    if (outcomes === undefined) {
      present(`No dev destination for ${path}${submitter?.name ? ` [${submitter.name}]` : ""} on ${pageId}`, [
        leaves("Add one to src/dev/flows.ts")
      ]);
    } else {
      present(title, outcomes);
    }

    return true;
  };

  /*
   * The text of the link that was just followed, so the panel can name it the way it names a
   * button - "Click here", not "url.loginAction". The hash alone cannot say which link set it.
   */
  let followed: { target: string; text: string } | undefined;

  document.addEventListener(
    "click",
    event => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      const href = anchor?.getAttribute("href") ?? "";

      followed = href.startsWith(MARKER)
        ? { target: href, text: anchor?.textContent?.replace(/\s+/g, " ").trim() ?? "" }
        : undefined;
    },
    true
  );

  /*
   * Links and the language switcher both end up setting the hash to a marker. The hash is cleared
   * straight away, so following the same link twice fires twice.
   */
  window.addEventListener("hashchange", () => {
    const target = decodeURIComponent(location.hash);

    if (!target.startsWith(MARKER)) {
      return;
    }

    history.replaceState(null, "", `${location.pathname}${location.search}`);

    const title = followed?.target === target && followed.text !== "" ? followed.text : target.slice(MARKER.length);
    followed = undefined;
    resolve(title, target);
  });

  /*
   * The same markers from inside a stock Keycloak page - the compare pane, or an unimplemented page
   * - which dev-server/stock.mjs renders from this page's own mock. A bridge it injects hands each
   * link and submit up here, so both sides of the preview move on together, and a form in a frame
   * never posts to a URL the dev server does not serve.
   */
  window.addEventListener("message", event => {
    const data = event.data as {
      devFlow?: unknown;
      submitter?: { name?: string; value?: string; text?: string };
    } | null;

    if (event.origin !== location.origin || typeof data?.devFlow !== "string") {
      return;
    }

    const submitter = data.submitter ?? {};
    resolve(submitter.text || data.devFlow.slice(MARKER.length), data.devFlow, {
      name: submitter.name ?? "",
      value: submitter.value ?? ""
    });
  });

  /*
   * Forms. Captured at the document so it runs before the browser posts, and only after
   * constraint validation has passed - so required fields still block a submit exactly as they
   * would against Keycloak, and formnovalidate still lets Cancel through.
   */
  document.addEventListener(
    "submit",
    event => {
      const form = event.target as HTMLFormElement;
      const button = (event as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
      const submitter = { name: button?.name ?? "", value: button?.value ?? "" };
      const label = button?.textContent?.trim() || button?.value || "Submit";

      if (resolve(label, form.getAttribute("action"), submitter)) {
        event.preventDefault();
      }
    },
    true
  );
}
