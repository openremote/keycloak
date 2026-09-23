/*
 * Dev-only page switcher.
 *
 * Imported dynamically from the NODE_ENV === "development" branch in main.ts, so rspack
 * drops it (and this file's markup) from production builds entirely - the same trick used
 * for getKcContextMock.
 *
 * The pages it links to are the real pages, rendered from real mock data, so there is
 * nothing to keep in sync with what ships. Neither list below is hardcoded:
 *
 *   - every page comes from kcContextMocks, the same data getKcContextMock serves
 *   - implemented pages come from src/pages via the build-time context module
 *
 * so adding a page file, or upgrading Keycloakify, updates this automatically.
 *
 * Rendered with Lit, like the pages themselves. Shorter than building the rail by hand, but the
 * reason is that Lit only writes a binding whose value actually changed. That is what keeps the
 * settings list from being torn down and rebuilt whenever the set of offered settings changes -
 * it used to flash - and what lets the realm box be bound without clobbering what is being typed
 * into it, both of which were hand-written here before.
 */
import { html, nothing, render, type TemplateResult } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import { kcContextMocks } from "keycloakify/login/KcContext/kcContextMocks";
import { implementedPageIds } from "../page-registry";
import { DEFAULT_REALM, compareMode, compareRealm, isCompareEnabled } from "./compare";
import { readSettings, type Toggle } from "./settings";
import { injectStyles } from "./styles";

const byName = (a: string, b: string) => a.localeCompare(b);

const ALL_PAGE_IDS: string[] = kcContextMocks.map(mock => mock.pageId).sort(byName);
const IMPLEMENTED = [...implementedPageIds].sort(byName);
const NOT_IMPLEMENTED = ALL_PAGE_IDS.filter(id => !implementedPageIds.includes(id));

/* Below this the rail covers too much of the card to leave open by default. */
const COLLAPSE_QUERY = "(max-width: 939.98px)";

const DEFAULT_BRAND = "#43a047";

/*
 * A fixed left rail. It overlays rather than displacing the page, so the layout being
 * previewed is the real one - the card stays centered in the true viewport.
 */
const STYLES = `
/* Read by the compare pane too, which moves the page clear of the rail when both are open. */
:root { --dev-nav-width: 13rem; }

/* The rail and its tab share one host so Lit can render both. It must not become a box of its
   own: with the compare pane open, body is a flex container, and a third flex item there would
   take part in the layout being previewed. */
.dev-host { display: contents; }

.dev-nav {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: var(--dev-nav-width);
  padding: 0.7rem;
  box-sizing: border-box;
  overflow-y: auto;
  background: #17181a;
  color: #fff;
  font: 12px/1.5 system-ui, sans-serif;
}

/* A sibling of the rail rather than a child: the rail scrolls, and overflow-y clips an
   absolutely positioned child sitting outside its box, which hid the tab entirely. */
.dev-nav__toggle {
  position: fixed;
  inset-inline-start: 0;
  top: 0.7rem;
  z-index: 2147483647;
  padding: 0.35rem 0.5rem;
  border: 0;
  border-start-end-radius: 4px;
  border-end-end-radius: 4px;
  background: #17181a;
  color: #fff;
  font: 12px/1.5 system-ui, sans-serif;
  cursor: pointer;
  transition: inset-inline-start 0.15s ease;
}

/* Collapsible at every width, not only when the rail would overlap the card: it overlays the
   page, so being able to get it out of the way matters regardless. */
.dev-nav {
  transform: translateX(-100%);
  transition: transform 0.15s ease;
}
.dev-nav.is-open { transform: none; }
.dev-nav__toggle.is-open { inset-inline-start: var(--dev-nav-width); }

.dev-nav__control { display: flex; flex-direction: column; gap: 3px; }
/* The rail's own display rules outrank the hidden attribute's, so a hidden control stayed on screen. */
.dev-nav [hidden] { display: none !important; }
.dev-nav__control > span { color: rgba(255, 255, 255, 0.45); font-size: 10px; }
.dev-nav input[type="color"],
.dev-nav input[type="file"],
.dev-nav input[type="text"] {
  width: 100%;
  box-sizing: border-box;
  padding: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font: inherit;
}
.dev-nav input[type="color"] { padding: 0; height: 1.6rem; }
.dev-nav__theme {
  flex: none;
  padding: 0.3rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.dev-nav__theme:hover { background: rgba(255, 255, 255, 0.14); }
/* The dropdown list is drawn by the OS, often white - so the rail's white text would vanish in it. */
.dev-nav select option { color: #17181a; }
.dev-nav__group { display: flex; flex-direction: column; gap: 2px; }
.dev-nav__heading {
  margin-bottom: 0.15rem;
  color: rgba(255, 255, 255, 0.45);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.dev-nav a {
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
/* The pages Keycloakify would hand us with no implementation. */
.dev-nav__group--fallback a { color: rgba(255, 255, 255, 0.42); }
.dev-nav a:hover { background: rgba(255, 255, 255, 0.16); }
.dev-nav a[aria-current="page"] { background: #4caf50; color: #fff; }

.dev-nav__settings {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.dev-nav__setting {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.2rem;
  border-radius: 3px;
  cursor: pointer;
}

.dev-nav__setting:hover { background: rgba(255, 255, 255, 0.08); }
.dev-nav__setting input { margin: 0; accent-color: #4caf50; }
`;

export type PageNavOptions = {
  current: string;
  isDark: () => boolean;
  /** Called with the new query string; main.ts pushes state and re-renders in place. */
  navigate: (search: string) => void;
};

export type PageNav = {
  /**
   * Called after every render. `toggles` are the features this page turned out to offer, which
   * only the caller knows - they are discovered from the page's own mock. See settings.ts.
   */
  setCurrent: (
    pageId: string,
    toggles?: readonly Toggle[],
    activeSettings?: readonly string[],
    /** Discovered settings left out because they would change nothing here right now. */
    hiddenSettings?: readonly Toggle[]
  ) => void;
};

function withParams(changes: Record<string, string | null>): string {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  return `?${params}`;
}

/* ------------------------------------------------------------------------------ branding */

/*
 * What a custom project would set in manager_config.json - the realm's primary color and its own
 * logo - without needing a manager running. branding.ts applies the real thing at runtime; this is
 * the same two knobs, driven by hand. Neither is in the query string the rest of the rail keeps its
 * state in: the color is applied through a stylesheet rather than the DOM, and an object URL is
 * scoped to this document, so it would not survive the reload it would be persisting across.
 */
let logoObjectUrl: string | null = null;
let brandColor = DEFAULT_BRAND;

const brandStyle = document.createElement("style");
const logoInput = createRef<HTMLInputElement>();

function setBrand(color: string): void {
  /*
   * Both selectors, because :root[theme~="dark"] outranks a plain :root override - branding
   * applied only to :root is silently ignored in dark mode.
   */
  brandStyle.textContent = color
    ? `:root, :root[theme~="dark"] {
         --or-color-primary: ${color};
         --or-color-primary-50pct: color-mix(in srgb, ${color} 76%, transparent);
         --or-color-primary-10pct: color-mix(in srgb, ${color} 13%, transparent);
         --or-color-text-primary: ${color};
       }`
    : "";
}

function setLogo(src: string): void {
  document.querySelectorAll<HTMLImageElement>("#or-logo").forEach(img => {
    img.src = src;
  });
}

function applyLogoOverride(): void {
  if (logoObjectUrl !== null) {
    setLogo(logoObjectUrl);
  }
}

function onLogoPicked(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];

  if (file === undefined) {
    return;
  }

  if (logoObjectUrl !== null) {
    URL.revokeObjectURL(logoObjectUrl);
  }

  logoObjectUrl = URL.createObjectURL(file);
  applyLogoOverride();
}

function resetBranding(): void {
  if (logoObjectUrl !== null) {
    URL.revokeObjectURL(logoObjectUrl);
    logoObjectUrl = null;
  }

  brandColor = DEFAULT_BRAND;
  setBrand("");
  setLogo("logo.svg");

  // A file input's value can only be cleared, never set, so this one needs its element.
  if (logoInput.value !== undefined) {
    logoInput.value.value = "";
  }

  rerender();
}

function brandingGroup(): TemplateResult {
  return html`
    <div class="dev-nav__group">
      <span class="dev-nav__heading">branding</span>
      <label class="dev-nav__control">
        <span>Primary color</span>
        <input
          type="color"
          .value=${brandColor}
          @input=${(event: Event) => {
            brandColor = (event.target as HTMLInputElement).value;
            setBrand(brandColor);
          }}
        />
      </label>
      <label class="dev-nav__control">
        <span>Logo</span>
        <input type="file" accept="image/*" ${ref(logoInput)} @change=${onLogoPicked} />
      </label>
      <button class="dev-nav__theme" type="button" @click=${resetBranding}>Reset branding</button>
    </div>
  `;
}

/* ------------------------------------------------------------------------------- compare */

/*
 * The stock-Keycloak pane. Only two knobs: whether it is showing, and which realm on the
 * proxied Keycloak to point it at - everything else about it is derived from the page you are
 * on. See ./compare.ts.
 */
function compareGroup(): TemplateResult {
  const mode = compareMode();

  return html`
    <div class="dev-nav__group">
      <span class="dev-nav__heading">compare</span>
      <button
        class="dev-nav__theme"
        type="button"
        @click=${() => navigate(withParams({ compare: isCompareEnabled() ? null : "1" }))}
      >
        ${mode !== null ? "Hide stock Keycloak" : "Show stock Keycloak"}
      </button>

      <!-- Rendered is the default: Keycloak's templates, rendered by the dev server from this
           page's mock, with nothing to run. Live is a real Keycloak behind the proxy, for what
           only a running server does. See CompareMode in ./compare.ts. -->
      <label class="dev-nav__control" ?hidden=${mode === null}>
        <span>Source</span>
        <select
          class="dev-nav__theme"
          .value=${mode === "live" ? "live" : "1"}
          @change=${(event: Event) =>
            navigate(withParams({ compare: (event.target as HTMLSelectElement).value }))}
        >
          <option value="1">Rendered from mock data</option>
          <option value="live">Live Keycloak (container)</option>
        </select>
      </label>

      <!-- A realm only means something to a running Keycloak; the rendered pages use the mock's.
           Bound rather than guarded: while it is being typed into, the query string has not
           changed, so Lit leaves the value alone. On change, not input - retargeting the pane
           after every keystroke would reload it into a realm that does not exist yet. -->
      <label class="dev-nav__control" ?hidden=${mode !== "live"}>
        <span>Realm</span>
        <input
          type="text"
          placeholder=${DEFAULT_REALM}
          spellcheck="false"
          .value=${compareRealm()}
          @change=${(event: Event) =>
            navigate(
              withParams({ kcrealm: (event.target as HTMLInputElement).value.trim() || null })
            )}
        />
      </label>
    </div>
  `;
}

/* ------------------------------------------------------------------------------ settings */

/*
 * One checkbox per realm feature the current page can be configured with. Which features exist
 * depends on the page, and the list is discovered from the mock, so this section has no idea what
 * Keycloak calls any of them. See ./settings.ts.
 */
function settingsGroup(): TemplateResult {
  return html`
    <div class="dev-nav__group" ?hidden=${toggles.length === 0}>
      <span
        class="dev-nav__heading"
        title=${hidden.length === 0
          ? ""
          : `No effect on this page as it stands:\n${hidden.map(toggle => toggle.id).join("\n")}`}
        >realm settings</span
      >
      <div class="dev-nav__settings">
        ${repeat(
          toggles,
          toggle => toggle.id,
          toggle => html`
            <label class="dev-nav__setting" title=${toggle.id}>
              <input
                type="checkbox"
                .checked=${active.includes(toggle.id)}
                @change=${() => toggleSetting(toggle.id)}
              />
              ${toggle.label}
            </label>
          `
        )}
      </div>
    </div>
  `;
}

/*
 * The selection is read from the URL at click time rather than closed over: it is the only copy
 * that cannot be stale, which is what makes settings combine instead of replacing each other.
 */
function toggleSetting(id: string): void {
  const current = readSettings(location.search);
  const next = current.includes(id) ? current.filter(other => other !== id) : [...current, id];

  navigate(withParams({ settings: next.length === 0 ? null : next.join(",") }));
}

/* --------------------------------------------------------------------------------- pages */

function pageGroup(heading: string, pageIds: string[], modifier?: string): TemplateResult {
  return html`
    <div class="dev-nav__group${modifier === undefined ? "" : ` dev-nav__group--${modifier}`}">
      <span class="dev-nav__heading">${heading}</span>
      ${pageIds.map(
        pageId => html`
          <!-- A real href so the links are middle-clickable and show a target, but the click is
               handled in-page: a document navigation would re-parse the bundle and repaint an
               unstyled frame, which is what made switching pages flash. Settings are dropped in
               both, because they belong to the page that offered them. -->
          <a
            href=${withParams({ page: pageId, settings: null })}
            title=${pageId}
            aria-current=${current === pageId ? "page" : nothing}
            @click=${(event: MouseEvent) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                return;
              }
              event.preventDefault();
              // Deliberately no auto-close: switching pages is the main thing this rail is for,
              // and closing it after every click means reopening it before every next click.
              navigate(withParams({ page: pageId, settings: null }));
            }}
            >${pageId.replace(/\.ftl$/, "")}</a
          >
        `
      )}
    </div>
  `;
}

/* ---------------------------------------------------------------------------------- rail */

let navigate: (search: string) => void = () => undefined;
let isDark: () => boolean = () => false;
let current = "";
let toggles: readonly Toggle[] = [];
let active: readonly string[] = [];
let hidden: readonly Toggle[] = [];

/*
 * One host in the document, holding both the rail and its tab - the tab is a sibling rather than a
 * child because the rail scrolls, and overflow-y clips an absolutely positioned child sitting
 * outside its box. Both are rendered by Lit, so whether the rail is open is a value rather than
 * five attribute writes.
 */
const host = document.createElement("div");
host.className = "dev-host";

let open = true;

function setOpen(next: boolean): void {
  open = next;
  // Survives the rebuild, so the rail stays where you left it across live reloads.
  history.replaceState(null, "", withParams({ nav: open ? null : "closed" }));
  rerender();
}

function rerender(): void {
  render(
    html`
      <nav id="dev-nav" class="dev-nav ${open ? "is-open" : ""}">
        <button
          class="dev-nav__theme"
          type="button"
          @click=${() => navigate(withParams({ theme: isDark() ? "light" : "dark" }))}
        >
          ${isDark() ? "Switch to light" : "Switch to dark"}
        </button>
        ${brandingGroup()} ${compareGroup()} ${settingsGroup()}
        <!-- Before the page groups: the "not implemented" list is long, and anything after
             it is scrolled out of sight. -->
        ${pageGroup("implemented", IMPLEMENTED)}
        ${pageGroup("not implemented", NOT_IMPLEMENTED, "fallback")}
      </nav>
      <button
        class="dev-nav__toggle ${open ? "is-open" : ""}"
        type="button"
        aria-controls="dev-nav"
        aria-expanded=${String(open)}
        title=${open ? "Collapse page list" : "Expand page list"}
        @click=${() => setOpen(!open)}
      >
        ${open ? "‹" : "›"}
      </button>
    `,
    host
  );
}

export function mountPageNav(options: PageNavOptions): PageNav {
  ({ isDark, navigate } = options);

  injectStyles(STYLES);
  document.head.appendChild(brandStyle);
  document.body.appendChild(host);

  /*
   * Open unless the URL says otherwise, or the viewport is too narrow to spare the room.
   * Only the *crossing* is acted on, so widening the window does not fight a rail the user
   * deliberately closed.
   */
  const narrow = window.matchMedia(COLLAPSE_QUERY);
  narrow.addEventListener("change", event => {
    if (event.matches) {
      setOpen(false);
    }
  });
  setOpen(!narrow.matches && new URLSearchParams(location.search).get("nav") !== "closed");

  const setCurrent: PageNav["setCurrent"] = (
    pageId,
    nextToggles = [],
    nextActive = [],
    nextHidden = []
  ) => {
    current = pageId;
    toggles = nextToggles;
    active = nextActive;
    hidden = nextHidden;

    // Re-applied after every render: Lit rebuilds the <img>, which drops the override.
    applyLogoOverride();
    rerender();
  };

  setCurrent(options.current);

  return { setCurrent };
}
