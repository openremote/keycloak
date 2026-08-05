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
 */
import { kcContextMocks } from "keycloakify/login/KcContext/kcContextMocks";
import { implementedPageIds } from "../page-registry";

const byName = (a: string, b: string) => a.localeCompare(b);

const ALL_PAGE_IDS: string[] = kcContextMocks.map(mock => mock.pageId).sort(byName);
const IMPLEMENTED = [...implementedPageIds].sort(byName);
const NOT_IMPLEMENTED = ALL_PAGE_IDS.filter(id => !implementedPageIds.includes(id));

/**
 * Below this the rail would start overlapping the centred card, so it collapses to a tab.
 * Shared with the matchMedia listener below so the breakpoint is defined once.
 */
/* Below this the rail covers too much of the card to leave open by default. */
const COLLAPSE_QUERY = "(max-width: 939.98px)";

/*
 * A fixed left rail. It overlays rather than displacing the page, so the layout being
 * previewed is the real one - the card stays centred in the true viewport.
 */
const STYLES = `
.dev-nav {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 13rem;
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
.dev-nav__toggle.is-open { inset-inline-start: 13rem; }

.dev-nav__control { display: flex; flex-direction: column; gap: 3px; }
.dev-nav__control > span { color: rgba(255, 255, 255, 0.45); font-size: 10px; }
.dev-nav input[type="color"],
.dev-nav input[type="file"] {
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
`;

export type PageNavOptions = {
  current: string;
  isDark: () => boolean;
  /** Called with the new query string; main.ts pushes state and re-renders in place. */
  navigate: (search: string) => void;
};

export type PageNav = {
  setCurrent: (pageId: string) => void;
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

/*
 * What a custom project would set in manager_config.json - the realm's primary colour and
 * its own logo - without needing a manager running. branding.ts applies the real thing at
 * runtime; this is the same two knobs, driven by hand.
 */
let logoObjectUrl: string | null = null;

function applyLogoOverride(): void {
  if (logoObjectUrl === null) {
    return;
  }
  document.querySelectorAll<HTMLImageElement>("#or-logo").forEach(img => {
    img.src = logoObjectUrl as string;
  });
}

function brandingControls(): HTMLElement {
  const section = document.createElement("div");
  section.className = "dev-nav__group";

  const heading = document.createElement("span");
  heading.className = "dev-nav__heading";
  heading.textContent = "branding";
  section.appendChild(heading);

  /*
   * Both selectors, because :root[theme~="dark"] outranks a plain :root override - branding
   * applied only to :root is silently ignored in dark mode.
   */
  const style = document.createElement("style");
  document.head.appendChild(style);

  const setBrand = (colour: string): void => {
    style.textContent = colour
      ? `:root, :root[theme~="dark"] {
           --or-color-primary: ${colour};
           --or-color-primary-50pct: color-mix(in srgb, ${colour} 76%, transparent);
           --or-color-primary-10pct: color-mix(in srgb, ${colour} 13%, transparent);
           --or-color-text-primary: ${colour};
         }`
      : "";
  };

  const colourLabel = document.createElement("label");
  colourLabel.className = "dev-nav__control";
  colourLabel.innerHTML = "<span>Primary colour</span>";
  const colour = document.createElement("input");
  colour.type = "color";
  colour.value = "#43a047";
  colour.addEventListener("input", () => setBrand(colour.value));
  colourLabel.appendChild(colour);
  section.appendChild(colourLabel);

  const logoLabel = document.createElement("label");
  logoLabel.className = "dev-nav__control";
  logoLabel.innerHTML = "<span>Logo</span>";
  const logo = document.createElement("input");
  logo.type = "file";
  logo.accept = "image/*";
  logo.addEventListener("change", () => {
    const file = logo.files?.[0];
    if (!file) {
      return;
    }
    if (logoObjectUrl !== null) {
      URL.revokeObjectURL(logoObjectUrl);
    }
    // Deliberately not persisted in the query string: an object URL is scoped to this
    // document, so it would not survive the reload it would be persisting across.
    logoObjectUrl = URL.createObjectURL(file);
    applyLogoOverride();
  });
  logoLabel.appendChild(logo);
  section.appendChild(logoLabel);

  const reset = document.createElement("button");
  reset.className = "dev-nav__theme";
  reset.type = "button";
  reset.textContent = "Reset branding";
  reset.addEventListener("click", () => {
    if (logoObjectUrl !== null) {
      URL.revokeObjectURL(logoObjectUrl);
      logoObjectUrl = null;
    }
    colour.value = "#43a047";
    logo.value = "";
    setBrand("");
    document.querySelectorAll<HTMLImageElement>("#or-logo").forEach(img => {
      img.src = "logo.svg";
    });
  });
  section.appendChild(reset);

  return section;
}

export function mountPageNav(options: PageNavOptions): PageNav {
  const { isDark, navigate } = options;

  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.appendChild(style);

  const nav = document.createElement("nav");
  nav.className = "dev-nav";

  const openTab = document.createElement("button");
  openTab.className = "dev-nav__toggle";
  openTab.type = "button";
  openTab.setAttribute("aria-controls", "dev-nav");
  nav.id = "dev-nav";

  const setOpen = (open: boolean): void => {
    nav.classList.toggle("is-open", open);
    openTab.classList.toggle("is-open", open);
    openTab.setAttribute("aria-expanded", String(open));
    openTab.textContent = open ? "‹" : "›";
    openTab.title = open ? "Collapse page list" : "Expand page list";
    // Survives the rebuild, so the rail stays where you left it across live reloads.
    history.replaceState(null, "", withParams({ nav: open ? null : "closed" }));
  };

  openTab.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));

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

  const toggle = document.createElement("button");
  toggle.className = "dev-nav__theme";
  toggle.type = "button";

  const syncToggle = () => {
    toggle.textContent = isDark() ? "Switch to light" : "Switch to dark";
  };

  toggle.addEventListener("click", () => {
    // Always an explicit value, so it overrides the OS preference in both directions.
    navigate(withParams({ theme: isDark() ? "light" : "dark" }));
    syncToggle();
  });
  nav.appendChild(toggle);

  const links = new Map<string, HTMLAnchorElement>();

  const group = (heading: string, pageIds: string[], modifier?: string): HTMLElement => {
    const section = document.createElement("div");
    section.className = `dev-nav__group${modifier ? ` dev-nav__group--${modifier}` : ""}`;

    const title = document.createElement("span");
    title.className = "dev-nav__heading";
    title.textContent = heading;
    section.appendChild(title);

    for (const pageId of pageIds) {
      const a = document.createElement("a");
      // A real href so the links are middle-clickable and show a target, but the click is
      // handled in-page: a document navigation would re-parse the bundle and repaint an
      // unstyled frame, which is what made switching pages flash.
      a.href = withParams({ page: pageId });
      a.textContent = pageId.replace(/\.ftl$/, "");
      a.title = pageId;
      a.addEventListener("click", event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        navigate(withParams({ page: pageId }));
        // Deliberately no auto-close: switching pages is the main thing this rail is for,
        // and closing it after every click means reopening it before every next click.
      });
      links.set(pageId, a);
      section.appendChild(a);
    }

    return section;
  };

  // Before the page groups: "not implemented" is 20-odd entries long, and anything after it
  // is scrolled out of sight.
  nav.appendChild(brandingControls());
  nav.appendChild(group("implemented", IMPLEMENTED));
  nav.appendChild(group("not implemented", NOT_IMPLEMENTED, "fallback"));

  document.body.appendChild(nav);
  document.body.appendChild(openTab);

  const setCurrent = (pageId: string): void => {
    // Re-applied after every render: Lit rebuilds the <img>, which drops the override.
    applyLogoOverride();

    for (const [id, a] of links) {
      if (id === pageId) {
        a.setAttribute("aria-current", "page");
      } else {
        a.removeAttribute("aria-current");
      }
      // Keep hrefs in step so theme changes are preserved when middle-clicking.
      a.href = withParams({ page: id });
    }
    syncToggle();
  };

  setCurrent(options.current);

  return { setCurrent };
}
