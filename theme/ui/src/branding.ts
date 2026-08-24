/*
 * Per-realm branding.
 *
 * Reads the manager's public GET /api/{realm}/configuration/manager and applies the realm's
 * logo, title and brand color, so a custom project needs no changes to this theme - only
 * its own manager_config.json.
 */
import type { KcContext } from "./login/KcContext";

/*
 * Both selectors are required: @openremote/theme defines its dark palette under
 * :root[theme~="dark"], which outranks a plain :root override, so branding applied only to
 * :root is silently ignored in dark mode.
 */
const BRAND_SELECTOR = ':root, :root[theme~="dark"]';

function addStyle(css: string): void {
  if (!css) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
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

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  // rspack's output goes under the theme's resources/dist; public/ is copied in alongside.
  link.href = `${resourcesPath}/dist/favicon.png`;
  document.head.appendChild(link);
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
 * on any failure path, and from a timeout - a manager that is slow or unreachable must cost
 * the user a short delay, never a blank page.
 */
function reveal(): void {
  document.documentElement.classList.remove("or-booting");
}

/** Long enough for a same-origin fetch on a normal connection, short enough not to be felt. */
const REVEAL_TIMEOUT_MS = 400;

/**
 * Points the logo at the realm's own, and waits for it to be ready to paint.
 *
 * The wait is the point. Assigning `src` only *starts* a download, and the browser keeps
 * showing the previous image until the new one decodes - so revealing the page as soon as
 * applyBranding returned put the stock OpenRemote logo on screen next to the realm's title and
 * brand color, and swapped it a moment later. That was the flash that survived hiding the page
 * at all: everything else here (title, color) applies synchronously, and only this did not.
 *
 * decode() rejects on a broken or missing image, in which case the default logo stays - the
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
 * Deliberately not the raw manager config - that carries a lot this theme has no use for, and
 * the logo URL in it is relative to a base only known at fetch time.
 */
type Branding = {
  appTitle?: string;
  logo?: string;
  styles?: string;
};

/*
 * Repeat visits should not wait on the network.
 *
 * Branding is fetched from the manager on every page load, and until it arrives the page is
 * hidden - so every login, every failed login and every step of a 2FA flow paid a round trip
 * of blank screen. It changes about never, so the last known value is kept per realm and
 * applied immediately, with the fetch continuing in the background to pick up changes.
 *
 * The version in the key is the cache-buster for this *shape*: change Branding and old entries
 * are ignored rather than half-read. Changes to the branding itself are picked up by the
 * revalidation below, which compares and re-applies.
 */
const CACHE_VERSION = "v1";

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

/** Applies resolved branding to the page. Everything here is idempotent. */
async function apply(branding: Branding): Promise<void> {
  if (branding.appTitle) {
    document.title = branding.appTitle;
    const title = document.getElementById("or-app-title");

    if (title) {
      title.textContent = branding.appTitle;
    }
  }

  applyStyles(branding.styles);

  const logoEl = document.getElementById("or-logo") as HTMLImageElement | null;

  if (branding.logo && logoEl) {
    await swapLogo(logoEl, branding.logo);
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

  if (!response.ok) {
    return undefined;
  }

  const config = await response.json();
  const realmConfig = config.realms?.[realm] ?? config.realms?.default;

  if (!realmConfig) {
    return undefined;
  }

  // Keycloak has one fixed hostname while the manager may be reached from several, so
  // prefer the canonical URL the config itself reports.
  const base = config.manager?.managerUrl || managerUrl || location.origin;

  return {
    appTitle: realmConfig.appTitle,
    logo: resolveAsset(realmConfig.logo, base) ?? undefined,
    styles: realmConfig.styles
  };
}

export async function applyBranding(kcContext: KcContext): Promise<void> {
  const realm: string | undefined = kcContext.realm?.name;
  const cached = realm === undefined ? undefined : readCache(realm);

  setTimeout(reveal, REVEAL_TIMEOUT_MS);

  /*
   * With a cached value the page can be shown before the network is consulted at all. The
   * logo is still awaited, but it is an HTTP cache hit from the previous visit, so this is
   * effectively instant - and it keeps the one rule that matters: never reveal a page whose
   * logo has not painted yet.
   */
  if (cached) {
    await apply(cached);
    reveal();
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
     */
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(cached)) {
      await apply(fresh);
    }
  } catch {
    // No manager reachable: keep whatever is on screen, cached or stock.
  } finally {
    reveal();
  }
}
