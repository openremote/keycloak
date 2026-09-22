/*
 * Dev-only side-by-side with a stock Keycloak.
 *
 * The point is to answer "what does Keycloak do here?" without leaving the harness: which
 * page it shows, what it calls things, which controls it offers. That question came up
 * constantly while deciding which pages to implement, and it got sharper once the theme
 * stopped overriding Keycloak's wording (see src/i18n.ts): the copy on the left is now
 * supposed to be the copy on the right.
 *
 * Nothing about stock Keycloak's markup is reproduced here: there is no second set of pages to
 * maintain. The pane shows Keycloak's own FreeMarker templates, rendered by the dev server from
 * this page's mock data, so there is no Keycloak to run and every mocked page is one click away.
 */

import { html, nothing, render } from "lit";
import { createFramePair } from "./frame-pair";
import { injectStyles } from "./styles";
import type { StockRender } from "./stock";

/**
 * Pages Keycloak serves after authentication when the authorization request asks for the
 * action, by the `kc_action` name Keycloak knows each one by.
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

/*
 * Two different class names on purpose: `dev-compare-on` is the switch on <html>, `dev-compare`
 * is the pane. One name for both would mean every rule written for the pane, above all
 * `display: none`, matching the root element as well.
 */
const ENABLED_CLASS = "dev-compare-on";

const STYLES = `
:root.${ENABLED_CLASS} body { display: flex; align-items: flex-start; }
:root.${ENABLED_CLASS} #app { flex: 1 1 50%; min-width: 0; box-sizing: border-box; }

/*
 * The menu overlays the page on purpose, so the preview gets the real viewport, but with this
 * pane open the page has half of it, and the menu then sits on top of the card. Move the page
 * clear of the menu while both are open. The width comes from page-nav.ts.
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

/*
 * State lives in the query string, like the theme override and the menu's open/closed flag,
 * so a live reload does not close the pane you were reading and a URL is shareable.
 */
/*
 * `?compare=1` shows Keycloak's own templates, rendered by the dev server from this page's
 * mock data (dev-server/stock.mjs): no Keycloak running, every mocked page reachable, and the
 * realm settings in the menu applying to both sides.
 */
export type CompareMode = "rendered";

export function compareMode(): CompareMode | null {
  const value = new URLSearchParams(location.search).get("compare");
  return value === "1" || value === "rendered" ? "rendered" : null;
}

export function isCompareEnabled(): boolean {
  return compareMode() !== null;
}

export type CompareOptions = {
  /** Whether the pane is showing, and how, from the query string. */
  mode: () => CompareMode | null;
};

export type Compare = {
  /**
   * Called after every render; reloads the pane only when what it shows actually changes.
   *
   * `stock` renders this page's stock counterpart from the current mock data, used in rendered
   * mode only. Resolves to the settings that would change the stock page, so the menu can offer
   * the ones that matter on either side rather than only on ours.
   */
  setPage: (pageId: string, stock: () => Promise<StockRender>) => Promise<readonly string[]>;
};

export function mountCompare(options: CompareOptions): Compare {
  injectStyles(STYLES);

  /*
   * The pane is a host element kept across renders (it is a sibling of #app, which the layout
   * rules above depend on) and Lit renders its contents from the four values below.
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

  let loaded = "";
  // Bumped on every setPage so a render that resolves late is dropped rather than overwriting
  // whatever replaced it.
  let generation = 0;

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
        // Drop the document so a hidden pane is not holding on to a page, and re-enabling it
        // starts fresh.
        loaded = "";
        showUrl(null);
        return [];
      }

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
  };
}
