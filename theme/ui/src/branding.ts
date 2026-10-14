/*
 * Per-realm branding.
 *
 * Reads the manager's public GET /api/{realm}/configuration/manager and applies the realm's
 * logo, title and brand color, so a custom project only needs its own manager_config.json to
 * change those.
 */
import type { KcContext } from "./login/KcContext";

/*
 * Both selectors are required: @openremote/theme defines its dark palette under
 * :root[theme~="dark"], which outranks a plain :root override, so branding applied only to
 * :root is silently ignored in dark mode.
 */
const BRAND_SELECTOR = ':root, :root[theme~="dark"]';

/*
 * The <style> elements branding has put in the document, so that the next application can
 * take them out again.
 *
 * Branding is applied more than once per page: from the cache first, then again when the
 * manager's answer turns out to differ. A custom property cannot be un-set by adding more
 * CSS, so an override the configuration no longer carries is only gone once the element that
 * declared it is.
 */
let brandStyles: HTMLStyleElement[] = [];

function addStyle(css: string): void {
  if (!css) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  brandStyles.push(style);
}

function clearStyles(): void {
  for (const style of brandStyles) {
    style.remove();
  }

  brandStyles = [];
}

/**
 * Points the tab's icon at `href`, reusing the one link element.
 *
 * Reused rather than appended because this is called twice (the theme's own icon before
 * anything is known, then the realm's once the manager has answered), and two <link rel="icon">
 * elements do not mean "use the second": browsers pick between them by their own rules, so
 * appending would make which icon appears a coin toss.
 *
 * No `type` is set. It would have to be guessed for the manager's icon, which realms configure
 * as .ico, .png or .svg alike, and a wrong type is worse than none: browsers use it to skip
 * candidates they think they cannot decode.
 */
function setFavicon(href: string): void {
  const link =
    document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ??
    document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));

  link.href = href;
}

/**
 * Points the favicon at the copy shipped in the theme.
 *
 * It has to be absolute: the login page lives at URLs like
 * /auth/realms/x/login-actions/authenticate, so a relative href in index.html would resolve
 * against that path rather than against the theme's resources.
 */
export function applyFavicon(kcContext: KcContext): void {
  const resourcesPath = kcContext.url?.resourcesPath;

  if (!resourcesPath) {
    return;
  }

  // rspack's output goes under the theme's resources/dist; public/ is copied in alongside.
  setFavicon(`${resourcesPath}/dist/favicon.png`);
}

/**
 * Whether `link`'s stylesheet is in force.
 *
 * `link.sheet` alone does not say: WebKit attaches an empty sheet to a link that is still
 * loading, so no rules means either that or an empty file. A resource timing entry appears only
 * once the fetch is over, which separates the two.
 */
function settled(link: HTMLLinkElement): boolean {
  try {
    if (link.sheet !== null && link.sheet.cssRules.length > 0) {
      return true;
    }
  } catch {
    // Another origin: the sheet exists but its rules cannot be read.
    return true;
  }

  return performance.getEntriesByType("resource").some(entry => entry.name === link.href);
}

/**
 * How long a stylesheet that failed is given before the page gives up on it.
 *
 * Not a network allowance, the request is over: a failed stylesheet usually means the page is
 * being navigated away from, and a document about to be replaced must not show itself unstyled.
 */
const FAILED_STYLESHEET_GRACE_MS = 400;

/**
 * Resolves once each of `links` is applied to the document, or has failed to load.
 *
 * Failure resolves rather than rejects: a stylesheet that 404s must not hold the page back for
 * good. Links that settled before this ran are not waited for, so an event already missed cannot
 * strand it.
 */
function applied(links: Iterable<HTMLLinkElement>): Promise<unknown> {
  return Promise.all(
    [...links].map(
      link =>
        new Promise<void>(resolve => {
          if (settled(link)) {
            resolve();
            return;
          }

          link.addEventListener("load", () => resolve(), { once: true });
          link.addEventListener(
            "error",
            () => setTimeout(resolve, FAILED_STYLESHEET_GRACE_MS),
            { once: true }
          );
        })
    )
  );
}

/*
 * The stylesheets the page was served with, captured as this module is evaluated.
 *
 * WebKit runs a deferred script without waiting for them, where Blink and Gecko hold it back
 * until they are applied. Only the real build has any to wait for: the dev server injects its
 * CSS from JavaScript.
 */
const documentStyles = applied(
  document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')
);

/**
 * Resolves once the stylesheets the page is meant to have are applied to it.
 *
 * Exported because the page must not be rendered before this either: Vaadin takes the styles it
 * injects into a component from the document's stylesheets when the first component of that tag
 * connects, and caches that per tag.
 */
export function stylesApplied(): Promise<unknown> {
  return documentStyles;
}

function resolveAsset(path: string | undefined, base: string): string | null {
  if (!path) {
    return null;
  }
  try {
    return new URL(path, base || location.origin).href;
  } catch {
    return path;
  }
}

/*
 * manager_config.json predates the Vaadin design system: its `styles` strings target the
 * Manager's shadow DOM (":host > *", which matches nothing in a plain document) and use the
 * legacy --or-app-color* names. Rewrite the selector, derive the modern tokens from the
 * legacy accent, then inject the original so any explicit --or-color-* still wins.
 */
function applyStyles(styles: string | undefined): void {
  // Replaces rather than adds: see brandStyles.
  clearStyles();

  if (!styles) {
    return;
  }

  const accent = /--or-app-color4\s*:\s*([^;}]+)/.exec(styles);

  if (accent) {
    const c = accent[1].trim();
    // The tint and hover variants are separate tokens; setting only the base color would
    // leave button hover and focus rings on the stock green.
    addStyle(
      `${BRAND_SELECTOR}{` +
        `--or-color-primary:${c};` +
        `--or-color-primary-50pct: color-mix(in srgb, ${c} 76%, transparent);` +
        `--or-color-primary-10pct: color-mix(in srgb, ${c} 13%, transparent);` +
        `--or-color-text-primary:${c};` +
        `}`
    );
  }

  addStyle(
    styles.replace(/:host\s*>\s*\*/g, BRAND_SELECTOR).replace(/:host/g, BRAND_SELECTOR)
  );
}

/**
 * Reveals the page, which index.html hid before first paint.
 *
 * Idempotent, and called from three places on purpose: as soon as branding has been applied,
 * on any failure path, and from a timeout: a manager that is slow or unreachable must cost
 * the user a short delay, never a blank page.
 *
 * Exported for the dev harness, which has no manager to ask and so nothing to apply.
 */
export function reveal(): void {
  const { classList } = document.documentElement;

  if (!classList.contains("or-booting")) {
    return;
  }

  classList.remove("or-booting");

  /*
   * The field marked autofocus has already tried to take focus and been refused: Vaadin focuses it
   * as soon as the component is ready, which is while the page is still hidden here, and a browser
   * will not focus anything inside `visibility: hidden`. So it is given focus again now that it
   * can be seen. Only if nothing else has focus: by now the user may have tabbed somewhere.
   */
  if (document.activeElement === document.body) {
    document.querySelector<HTMLElement>("#app [autofocus]")?.focus();
  }
}

/**
 * Reveals the page, once the stylesheets it is meant to have are applied to it.
 *
 * Uncapped, deliberately: Blink and Gecko paint nothing at all until a stylesheet in the markup
 * has loaded, so waiting here is parity with them.
 */
async function revealStyled(): Promise<void> {
  await stylesApplied();

  // A stylesheet reporting itself loaded is not the page having been restyled with it: WebKit
  // updates the document's own properties first and the components' shadow DOM a frame later.
  await new Promise(resolve => requestAnimationFrame(resolve));

  reveal();
}

/** Long enough for a same-origin fetch on a normal connection, short enough not to be felt. */
const REVEAL_TIMEOUT_MS = 400;

/**
 * Starts the clock that reveals the page, whatever else happens.
 *
 * Armed by main() before the page is rendered rather than from applyBranding: a page that
 * throws while rendering would otherwise never reach applyBranding, and index.html has
 * already hidden the body.
 *
 * The deadline is on the manager, not on the stylesheets, so it goes through revealStyled.
 */
export function armReveal(): void {
  setTimeout(() => void revealStyled(), REVEAL_TIMEOUT_MS);
}

/**
 * Points the logo at the realm's own, and waits for it to be ready to paint.
 *
 * The wait is the point. Assigning `src` only *starts* a download, and the browser keeps
 * showing the previous image until the new one decodes, so the page has to stay hidden until
 * this resolves. Everything else here (title, color) applies synchronously; only this does not.
 *
 * decode() rejects on a broken or missing image, in which case the default logo stays, the
 * right outcome, and better than an empty space.
 */
async function swapLogo(image: HTMLImageElement, src: string): Promise<void> {
  image.src = src;

  try {
    await image.decode();
  } catch {
    // Keep whatever is on screen.
  }
}

/**
 * The branding actually applied to a page: resolved, absolute, and small enough to cache.
 *
 * Deliberately not the raw manager config: that carries a lot this theme has no use for, and
 * the logo URL in it is relative to a base only known at fetch time.
 */
type Branding = {
  appTitle?: string;
  logo?: string;
  favicon?: string;
  styles?: string;
};

/*
 * Repeat visits should not wait on the network.
 *
 * Branding is fetched from the manager on every page load, and until it arrives the page is
 * hidden, so every login, every failed login and every step of a 2FA flow paid a round trip
 * of blank screen. It changes about never, so the last known value is kept per realm and
 * applied immediately, with the fetch continuing in the background to pick up changes.
 *
 * The version in the key is the cache-buster for this *shape*: change Branding and old entries
 * are ignored rather than half-read. Changes to the branding itself are picked up by the
 * revalidation below, which compares and re-applies.
 */
const CACHE_VERSION = "v2";

function cacheKey(realm: string): string {
  return `or-branding:${CACHE_VERSION}:${realm}`;
}

function readCache(realm: string): Branding | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(realm));
    return raw === null ? undefined : (JSON.parse(raw) as Branding);
  } catch {
    // Storage disabled, or a value we can no longer parse. Treat as a miss.
    return undefined;
  }
}

function writeCache(realm: string, branding: Branding | undefined): void {
  try {
    if (branding === undefined) {
      localStorage.removeItem(cacheKey(realm));
    } else {
      localStorage.setItem(cacheKey(realm), JSON.stringify(branding));
    }
  } catch {
    // Private mode, quota, storage disabled: caching is an optimisation, not a requirement.
  }
}

/** The page as the theme itself renders it, before any branding has been applied. */
type Stock = {
  title: string;
  appTitle: string;
  logo: string;
  favicon: string;
};

/**
 * Captured on the first apply() and reused when the manager's answer differs from the cache,
 * by which time the DOM holds that cached branding rather than this.
 */
let stock: Stock | undefined;

/**
 * Applies resolved branding to the page.
 *
 * Idempotent, and complete: every property the branding does not carry is put back to what
 * the theme ships, so this is also how branding is withdrawn.
 */
async function apply(branding: Branding): Promise<void> {
  stock ??= {
    title: document.title,
    appTitle: document.getElementById("or-app-title")?.textContent ?? "",
    logo: (document.getElementById("or-logo") as HTMLImageElement | null)?.src ?? "",
    favicon: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? ""
  };

  document.title = branding.appTitle || stock.title;

  const title = document.getElementById("or-app-title");

  if (title) {
    // Not the document title: the layout starts from the realm's display name.
    title.textContent = branding.appTitle || stock.appTitle;
  }

  const favicon = branding.favicon || stock.favicon;

  if (favicon) {
    setFavicon(favicon);
  } else {
    // Nothing to point at: the theme's own icon is missing too, so take the element out
    // rather than leave it on a withdrawn brand's icon.
    document.querySelector('link[rel~="icon"]')?.remove();
  }

  applyStyles(branding.styles);

  const logoEl = document.getElementById("or-logo") as HTMLImageElement | null;
  const logo = branding.logo || stock.logo;

  // Both are absolute, so this compares: assigning the same src again re-decodes the image.
  if (logoEl && logo && logoEl.src !== logo) {
    await swapLogo(logoEl, logo);
  }
}

/** Fetches the realm's branding from the manager, or undefined if there is none to apply. */
async function fetchBranding(kcContext: KcContext): Promise<Branding | undefined> {
  const realm: string | undefined = kcContext.realm?.name;

  /*
   * Declared in package.json under keycloakify.environmentVariables, which makes the build
   * emit `OR_MANAGER_URL=${env.OR_MANAGER_URL:}` into the theme's theme.properties. Keycloak
   * resolves that against its own process environment when it renders the page, so this is
   * deployment-time configuration: set OR_MANAGER_URL on the container, no rebuild.
   */
  const managerUrl = (kcContext.properties?.OR_MANAGER_URL ?? "").replace(/\/+$/, "");

  if (!realm) {
    return undefined;
  }

  // credentials:"omit" is required: the manager sets corsAllowCredentials=true while
  // returning Access-Control-Allow-Origin:* in dev mode, which browsers reject for
  // credentialed requests. The endpoint is public.
  const response = await fetch(
    `${managerUrl}/api/${encodeURIComponent(realm)}/configuration/manager`,
    { credentials: "omit" }
  );

  /*
   * Throws because the manager and keycloak theme branding are no longer the same. An
   * empty reponse withdraws what is on screen and clears the cache, while the manager
   * failing to answer has to leave both alone.
   */
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${response.url}`);
  }

  const config = await response.json();
  const realms = config.realms ?? {};
  const realmConfig = realms[realm] ? { ...realms.default, ...realms[realm] } : realms.default;

  if (!realmConfig) {
    return undefined;
  }

  // Keycloak has one fixed hostname while the manager may be reached from several, so
  // prefer the canonical URL the config itself reports.
  const base = config.manager?.managerUrl || managerUrl || location.origin;

  return {
    appTitle: realmConfig.appTitle,
    logo: resolveAsset(realmConfig.logo, base) ?? undefined,
    // Same treatment as the logo: realms configure it as a manager-relative path such as
    // /images/favicon.ico, which has to resolve against the manager rather than against
    // Keycloak: the two are different origins in every deployment that sets OR_MANAGER_URL.
    favicon: resolveAsset(realmConfig.favicon, base) ?? undefined,
    styles: realmConfig.styles
  };
}

export async function applyBranding(kcContext: KcContext): Promise<void> {
  const realm: string | undefined = kcContext.realm?.name;
  const cached = realm === undefined ? undefined : readCache(realm);

  /*
   * With a cached value the page can be shown before the network is consulted at all. The
   * logo is still awaited, but it is an HTTP cache hit from the previous visit, so this is
   * effectively instant, and it keeps the one rule that matters: never reveal a page whose
   * logo has not painted yet.
   */
  if (cached) {
    await apply(cached);
    await revealStyled();
  }

  try {
    const fresh = await fetchBranding(kcContext);

    if (realm !== undefined) {
      writeCache(realm, fresh);
    }

    /*
     * Only re-apply when something actually changed, so the common case does no DOM work and
     * cannot flicker. When it has changed, this page shows the old branding briefly and then
     * updates; every later load is correct from the first paint.
     *
     * An answer with no branding in it counts as a change, and is applied: a realm that has
     * dropped a property, or its whole entry, goes back to the theme's own. Only the manager
     * not answering at all leaves the page as it is, through the catch below.
     */
    if (JSON.stringify(fresh ?? {}) !== JSON.stringify(cached ?? {})) {
      await apply(fresh ?? {});
    }
  } catch (error) {
    // No manager reachable: keep whatever is on screen, cached or stock.
    console.warn(
      "Branding not applied: no manager configuration available. Set OR_MANAGER_URL on the " +
      "Keycloak container when the manager is not on the origin that serves the login page.",
      error
    );
  } finally {
    await revealStyled();
  }
}
