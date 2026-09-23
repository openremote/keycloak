/*
 * Dev-only side-by-side with a stock Keycloak.
 *
 * The point is to answer "what does Keycloak do here?" without leaving the harness - which
 * page it shows, what it calls things, which controls it offers. That question came up
 * constantly while deciding which pages to implement, and it got sharper once the theme
 * stopped overriding Keycloak's wording (see src/i18n.ts): the copy on the left is now
 * supposed to be the copy on the right.
 *
 * Nothing about stock Keycloak's markup is reproduced here - no second set of pages to maintain,
 * which is the reasoning that removed the hand-written preview harness this dev server replaced.
 * The pane shows Keycloak's own FreeMarker templates in one of two ways (see CompareMode):
 * rendered by the dev server from this page's mock data, which is the default and needs no
 * Keycloak at all, or served live by a real Keycloak behind a dev-server proxy.
 *
 * The rest of this file is mostly live mode. Why a proxy rather than pointing the iframe straight
 * at localhost:8081:
 *
 *   - Keycloak sends X-Frame-Options: SAMEORIGIN on login pages, so a cross-origin iframe is
 *     blocked outright. Through the proxy the framed document *is* same-origin.
 *   - Keycloak's templates emit root-relative resource paths, and it derives its own base URL
 *     from the Host header. Proxying /realms and /resources under the dev server's own origin
 *     means every link, form action and redirect stays inside the pane, so the flow can
 *     actually be driven - log in, and the pages that need a session are reachable too.
 *
 * See rspack.config.mjs for the proxy and README.md for the container to run.
 */

import { html, nothing, render } from "lit";
import { createFramePair } from "./frame-pair";
import { injectStyles } from "./styles";
import type { StockRender } from "./stock";

/** Keycloak endpoints that render on their own, with no authenticated session. */
const DIRECT_PATH: Record<string, string> = {
  "login-reset-password.ftl": "login-actions/reset-credentials",
  "login-oauth2-device-verify-user-code.ftl": "device"
};

/*
 * Registration is not a plain page: it is an authorization request that starts on the
 * registration form, so it takes the same parameters as one. Opened bare, as it used to be, the
 * endpoint answers "Invalid Request" - which only surfaced once the pane was actually visible.
 */
const REGISTRATION_PAGES = new Set(["register.ftl", "register-user-profile.ftl"]);

/**
 * Pages Keycloak serves after authentication when the authorization request asks for the
 * action. This is the same `kc_action` deep-linking used to reach these pages by hand; here it
 * just means the pane lands on the right page once you have logged in on it.
 */
export const KC_ACTION: Record<string, string> = {
  "login-config-totp.ftl": "CONFIGURE_TOTP",
  "login-update-password.ftl": "UPDATE_PASSWORD",
  "login-update-profile.ftl": "UPDATE_PROFILE",
  "update-user-profile.ftl": "UPDATE_PROFILE",
  "update-email.ftl": "UPDATE_EMAIL",
  "login-verify-email.ftl": "VERIFY_EMAIL",
  "webauthn-register.ftl": "webauthn-register",
  "login-recovery-authn-code-config.ftl": "CONFIGURE_RECOVERY_AUTHN_CODES",
  "delete-account-confirm.ftl": "delete_account"
};

/**
 * What to do in the pane to get to a page the URL cannot reach on its own. Only pages that
 * need an explanation are listed; the rest either load directly or start at the login page,
 * which speaks for itself.
 */
const HINTS: Record<string, string> = {
  /*
   * A fresh start-dev master realm has both of these switched off, and Keycloak then shows its
   * error page - "Registration not allowed", "Reset Credential not allowed" - which reads like the
   * pane being broken rather than the realm being configured.
   */
  "register.ftl": "Needs User registration on the realm (Realm settings → Login).",
  "register-user-profile.ftl": "Needs User registration on the realm (Realm settings → Login).",
  "login-reset-password.ftl": "Needs Forgot password on the realm (Realm settings → Login).",
  "login-otp.ftl": "Set up 2FA first (login-config-totp), then log in again.",
  "login-idp-link-confirm.ftl":
    "Add an identity provider to the realm, then log in through it with an email that already exists locally.",
  "login-idp-link-email.ftl": "Same as login-idp-link-confirm, with “Email” as the link action.",
  "login-page-expired.ftl": "Leave the login page open past the realm's login timeout.",
  "info.ftl": "Shown at the end of flows that finish with a message, e.g. Forgot password.",
  "select-authenticator.ftl": "Log in as a user with more than one second factor.",
  "terms.ftl": "Enable the Terms and Conditions required action on the realm.",
  "login-password.ftl": "Switch the realm's browser flow to the username-then-password variant."
};

const HINT_AUTHENTICATE = "Log in on this pane to reach it.";

/*
 * Two different class names on purpose: `dev-compare-on` is the switch on <html>, `dev-compare`
 * is the pane. They used to be the same name, so every rule written for the pane - above all
 * `display: none` - matched the root element too, and turning the pane on hid the entire
 * document. Keycloak was rendering the whole time, into a frame 0 pixels wide and 0 high.
 */
const ENABLED_CLASS = "dev-compare-on";

const STYLES = `
:root.${ENABLED_CLASS} body { display: flex; align-items: flex-start; }
:root.${ENABLED_CLASS} #app { flex: 1 1 50%; min-width: 0; box-sizing: border-box; }

/*
 * The rail overlays the page on purpose, so the preview gets the real viewport - but with this
 * pane open the page has half of it, and the rail then sits on top of the card. Move the page
 * clear of the rail while both are open. The width comes from page-nav.ts.
 */
:root.${ENABLED_CLASS} body:has(.dev-nav.is-open) > #app {
  padding-inline-start: var(--dev-nav-width, 13rem);
}

.dev-compare {
  position: sticky;
  top: 0;
  flex: 1 1 50%;
  min-width: 0;
  display: none;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
  border-inline-start: 1px solid rgba(128, 128, 128, 0.35);
  background: #fff;
}
:root.${ENABLED_CLASS} .dev-compare { display: flex; }

.dev-compare__bar {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: #17181a;
  color: rgba(255, 255, 255, 0.85);
  font: 12px/1.5 system-ui, sans-serif;
}
.dev-compare__bar strong { font-weight: 600; }
.dev-compare__hint {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.5);
}
.dev-compare__bar a { color: inherit; }

/* Sized here; the stacking that keeps it from flashing belongs to ./frame-pair.ts. */
.dev-compare .dev-frames {
  flex: 1;
  min-height: 0;
}

.dev-compare__problem {
  margin: 0;
  padding: 1rem;
  color: #17181a;
  font: 12px/1.6 system-ui, sans-serif;
}
`;

/**
 * account-console enforces PKCE, and Keycloak rejects an authorization request without it -
 * you get an error page where you wanted the login page. Only the shape is checked here; the
 * challenge is verified at the token endpoint, which this never reaches because nobody
 * exchanges the code. A random 32-byte value is therefore enough.
 */
function codeChallenge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Path prefixes a Keycloak may be served under, in the order they are tried.
 *
 * Keycloak is at the root under `start-dev`, but OpenRemote's own image sets
 * KC_HTTP_RELATIVE_PATH=/auth - so the Keycloak a developer already has running is as likely
 * to be one as the other. Probing beats asking: getting it wrong produces a 404 that reads as
 * "that realm does not exist", which sends you looking in the wrong place entirely.
 */
const BASE_PATHS = ["", "/auth"];

function realmPath(base: string, realm: string, path: string): URL {
  return new URL(`${base}/realms/${encodeURIComponent(realm)}/${path}`, location.origin);
}

function authUrl(
  base: string,
  realm: string,
  params: Record<string, string> = {},
  endpoint = "protocol/openid-connect/auth"
): URL {
  const url = realmPath(base, realm, endpoint);

  // account-console exists in every realm and its registered redirect URI is relative to the
  // realm, so it resolves against whatever base Keycloak thinks it has - the proxy's origin.
  url.searchParams.set("client_id", "account-console");
  url.searchParams.set("redirect_uri", realmPath(base, realm, "account/").href);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", codeChallenge());

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

/** The stock URL for a page, plus what the developer has to do to get the rest of the way. */
function target(pageId: string, realm: string, base: string): { href: string; hint: string } {
  const directPath = DIRECT_PATH[pageId];

  if (directPath !== undefined) {
    return { href: realmPath(base, realm, directPath).href, hint: HINTS[pageId] ?? "" };
  }

  if (REGISTRATION_PAGES.has(pageId)) {
    return {
      href: authUrl(base, realm, { prompt: "login" }, "protocol/openid-connect/registrations").href,
      hint: HINTS[pageId] ?? ""
    };
  }

  const action = KC_ACTION[pageId];

  if (action !== undefined) {
    /*
     * Deliberately no prompt=login here: these pages exist *after* authentication, so reusing
     * the session the developer already has is the whole point - it is what makes them one
     * click away rather than a login away.
     */
    return { href: authUrl(base, realm, { kc_action: action }).href, hint: HINT_AUTHENTICATE };
  }

  if (pageId === "error.ftl") {
    /*
     * Keycloak's error page cannot be requested, only provoked, and an unknown client is the
     * shortest way to provoke it - rejected before the flow starts, so nothing is left behind.
     * Any other route would trade this for a different LOGIN_ERROR, so the log line is
     * inherent rather than a symptom; the hint says so, because on its own it reads like a
     * misconfiguration.
     */
    return {
      href: authUrl(base, realm, { client_id: "no-such-client" }).href,
      hint: "The client_not_found warning in the server log is this pane asking for the error page."
    };
  }

  /*
   * prompt=login is what makes this pane repeatable.
   *
   * The URL is an authorization request, and an authorization request stops showing login
   * pages the moment it can: log in once - which several of the hints below tell you to do -
   * and every later load short-circuits to a code and a redirect to the account console. The
   * pane showed Keycloak's login page exactly once per session and was a blank rectangle from
   * then on, which reads as a broken proxy rather than as "you are already logged in".
   *
   * prompt=login tells Keycloak to re-authenticate regardless, so these pages render every
   * time, which is the only useful behavior for something you are comparing against.
   */
  return {
    href: authUrl(base, realm, { prompt: "login" }).href,
    hint: HINTS[pageId] ?? ""
  };
}

/** Every Keycloak has one, and on a fresh `start-dev` it still uses the stock login theme. */
export const DEFAULT_REALM = "master";

/*
 * State lives in the query string, like the theme override and the rail's open/closed flag,
 * so a live reload does not close the pane you were reading and a URL is shareable.
 */
/*
 * Two ways to show stock Keycloak:
 *
 *   rendered  ?compare=1     Keycloak's own templates, rendered by the dev server from this page's
 *                            mock data (dev-server/stock.mjs). No Keycloak running, every mocked
 *                            page reachable, and the realm settings in the rail apply to both sides.
 *   live      ?compare=live  A real Keycloak behind the dev-server proxy. For what only a running
 *                            server does - real flows, real validation - at the cost of a container
 *                            and of driving the flow by hand to reach most pages.
 */
export type CompareMode = "rendered" | "live";

export function compareMode(): CompareMode | null {
  const value = new URLSearchParams(location.search).get("compare");
  return value === "live" ? "live" : value === "1" || value === "rendered" ? "rendered" : null;
}

export function isCompareEnabled(): boolean {
  return compareMode() !== null;
}

export function compareRealm(): string {
  return new URLSearchParams(location.search).get("kcrealm") || DEFAULT_REALM;
}

/** What the proxied Keycloak said when asked where it is, or why it could not be asked. */
type Probe =
  | { found: true; base: string; issuer: string }
  | { found: false; reachable: boolean };

async function probe(base: string, realm: string): Promise<Probe> {
  try {
    const response = await fetch(
      realmPath(base, realm, ".well-known/openid-configuration").href
    );

    if (!response.ok) {
      /*
       * The dev-server proxy always answers, so a failed connection arrives as a response rather
       * than as a thrown fetch: 504 "Error occurred while trying to proxy". Counting that as
       * "something answered" meant the pane never said the simple thing - no Keycloak is running.
       * A 404 is still the realm or the prefix being wrong.
       */
      return { found: false, reachable: ![502, 503, 504].includes(response.status) };
    }

    return {
      found: true,
      base,
      issuer: ((await response.json()) as { issuer?: string }).issuer ?? ""
    };
  } catch {
    // The proxy could not connect at all: nothing is listening on the other side.
    return { found: false, reachable: false };
  }
}

/**
 * Finds the proxied Keycloak, or says why the pane cannot be used. Resolves to the path prefix
 * it is served under when all is well.
 *
 * Worth the round trip because every failure here looks identical in an iframe - a white
 * rectangle - and they have completely different fixes. The one that is genuinely
 * unfixable-from-here is a Keycloak that has been told its own hostname: it answers the proxied
 * request perfectly well, then redirects the pane to the address it believes it is at, which is
 * outside the proxy and therefore blocked by its own X-Frame-Options. Saying so is the whole
 * value of this function.
 */
async function resolveBase(realm: string): Promise<{ base: string } | { problem: string }> {
  const probes = await Promise.all(BASE_PATHS.map(base => probe(base, realm)));
  const found = probes.find((result): result is Extract<Probe, { found: true }> => result.found);

  if (found === undefined) {
    if (!probes.some(result => !result.found && result.reachable)) {
      return {
        problem: "No Keycloak behind the dev-server proxy — see the compare section of README.md."
      };
    }

    return {
      problem:
        `Something is answering the proxy, but it has no realm "${realm}" at / or /auth. ` +
        "Check the realm name (?kcrealm=) and that KC_COMPARE_URL points at a Keycloak."
    };
  }

  /*
   * The issuer is Keycloak's own answer to "what address do I hand out?", so this compares what
   * it will put in redirects against where the pane actually is. They match only when Keycloak
   * derives its base URL from the request - which is what start-dev with no hostname does, and
   * why the proxy forwards this server's Host header untouched (changeOrigin: false).
   */
  if (!found.issuer.startsWith(`${location.origin}${found.base}/`)) {
    return {
      problem:
        `That Keycloak believes it is at ${found.issuer || "an unknown address"}, not ` +
        `${location.origin}${found.base}, so it would redirect this pane out of the proxy and ` +
        "its own X-Frame-Options would then block it. It needs KC_HOSTNAME unset - a full " +
        "OpenRemote stack sets it, so run a separate Keycloak with start-dev to compare against."
    };
  }

  return { base: found.base };
}

export type CompareOptions = {
  /** Realm on the live Keycloak, from the query string. */
  realm: () => string;
  /** Whether the pane is showing, and how, from the query string. */
  mode: () => CompareMode | null;
};

export type Compare = {
  /**
   * Called after every render; reloads the pane only when what it shows actually changes.
   *
   * `stock` renders this page's stock counterpart from the current mock data - used in rendered
   * mode only. Resolves to the settings that would change the stock page, so the rail can offer
   * the ones that matter on either side rather than only on ours.
   */
  setPage: (pageId: string, stock: () => Promise<StockRender>) => Promise<readonly string[]>;
};

export function mountCompare(options: CompareOptions): Compare {
  injectStyles(STYLES);

  /*
   * The pane is a host element kept across renders - it is a sibling of #app, which the layout
   * rules above depend on - and Lit renders its contents from the four values below.
   */
  const pane = document.createElement("aside");
  pane.className = "dev-compare";
  document.body.appendChild(pane);

  const pair = createFramePair("Stock Keycloak");
  const frames = pair.element;
  const showUrl = pair.show;

  let paneTitle = "Stock Keycloak";
  let paneHint = "";
  let openHref = "";
  /** The message to show in place of the frames, or null while there is nothing wrong. */
  let paneProblem: string | null = null;

  const paint = (): void => {
    // Set here rather than bound, because the frames are a DOM node the template only places.
    frames.hidden = paneProblem !== null;

    render(
      html`
        <div class="dev-compare__bar">
          <strong>${paneTitle}</strong>
          <span class="dev-compare__hint" title=${paneHint}>${paneHint}</span>
          <!-- Escaping the pane is worth one click: the page is easier to read full width, and
               it is the only way to see how Keycloak handles a viewport this pane cannot give
               it. -->
          <a target="_blank" rel="noreferrer" href=${openHref === "" ? nothing : openHref}
            >open ↗</a
          >
        </div>
        <p class="dev-compare__problem" ?hidden=${paneProblem === null}>${paneProblem ?? ""}</p>
        ${frames}
      `,
      pane
    );
  };

  paint();

  /*
   * Report where the frame actually ended up.
   *
   * Being able to look inside it at all is a side effect of the proxy: the framed document is
   * same-origin, so contentDocument is readable. Without this a frame that renders and then
   * navigates itself - Keycloak's own scripts restart the login on a session it does not like,
   * and a redirect can land somewhere with no body - is indistinguishable from a frame that
   * never loaded. Both are just a white rectangle, and the URL bar cannot show you an iframe.
   */
  pair.onLoad(element => {
    // Rendered pages come from the dev server and cannot wander off; these checks are for live mode.
    // Only the frame on screen is worth diagnosing; the other one is mid-swap.
    if (element !== pair.front() || !element.getAttribute("src") || options.mode() !== "live") {
      return;
    }

    let where: string;
    let empty: boolean;

    try {
      const doc = element.contentDocument;

      if (doc === null) {
        throw new Error("no document");
      }

      where = doc.location.href;
      empty = (doc.body?.textContent ?? "").trim() === "";
    } catch {
      // Only reachable if it navigated off this origin, which the proxy is supposed to prevent
      // - so it is worth saying rather than swallowing.
      paneHint = "The pane navigated off this origin; it is no longer proxied.";
      paint();
      return;
    }

    /*
     * The pane asks for a page by making an authorization request, so landing on the redirect
     * URI means the request succeeded - there was nothing left to ask the user. Worth naming,
     * because the account console is a single-page app that renders nothing useful inside a
     * pane this size, so the symptom is a blank rectangle that looks like a failure.
     */
    if (where.includes("/account/")) {
      paneProblem =
        "Keycloak had nothing left to ask and completed the login, so this pane is now sitting " +
        "on the account console. For a kc_action page that means the action is already done or " +
        "was cancelled — switch pages and back to start it again.";
      paint();
      return;
    }

    if (!empty) {
      return;
    }

    paneProblem =
      `Keycloak answered, then left this frame empty at ${where} — so the page loaded and ` +
      "something navigated it. Open it in a tab (open ↗) to see what: if it works there, the " +
      "cause is the framing; if it blanks there too, it is Keycloak's own flow.";
    paint();
  });

  let loaded = "";
  // Bumped on every setPage so a diagnosis that resolves after the realm changed is dropped
  // rather than overwriting the newer one.
  let generation = 0;

  const show = (pageId: string, realm: string, base: string): void => {
    const { href, hint: text } = target(pageId, realm, base);

    paneHint = text;
    openHref = href;
    // Cleared here rather than in the load handler: a reported problem must survive the load
    // that reported it, and only a new target makes it stale.
    paneProblem = null;
    paint();

    /*
     * Keyed on the page and realm, not the URL: authUrl() mints a new code_challenge every
     * call, so comparing hrefs would reload the pane on every render and throw away a session
     * the developer had just logged into.
     */
    const key = `${realm} ${pageId}`;

    if (loaded !== key) {
      loaded = key;
      showUrl(href);
    }
  };

  const fail = (message: string): void => {
    paneProblem = message;
    paint();
    // So that fixing the problem reloads rather than showing an empty frame.
    loaded = "";
    showUrl(null);
  };

  return {
    setPage: async (pageId, stock) => {
      const mode = options.mode();
      document.documentElement.classList.toggle(ENABLED_CLASS, mode !== null);
      generation += 1;
      const mine = generation;

      if (mode === null) {
        // Drop the document so a hidden pane is not holding a Keycloak session alive, and so
        // re-enabling it starts a fresh authorization request rather than a stale one.
        loaded = "";
        showUrl(null);
        return [];
      }

      if (mode === "rendered") {
        paneTitle = "Stock Keycloak";
        const result = await stock();

        if (mine !== generation) {
          return [];
        }

        if ("error" in result) {
          paneHint = "";
          fail(result.error);
          return [];
        }

        const text = `Keycloak ${result.keycloakVersion} · ${result.theme} theme · rendered from this page's mock data`;
        paneHint = text;
        openHref = result.url;
        paneProblem = null;
        paint();

        // The URL is a hash of the rendered page, so an unchanged page keeps it and does not reload.
        if (loaded !== result.url) {
          loaded = result.url;
          showUrl(result.url);
        }

        return result.changed;
      }

      paneTitle = "Live Keycloak";
      const realm = options.realm();
      const result = await resolveBase(realm);

      if (mine !== generation) {
        return [];
      }

      if ("base" in result) {
        paneProblem = null;
        show(pageId, realm, result.base);
      } else {
        fail(result.problem);
      }

      return [];
    }
  };
}
