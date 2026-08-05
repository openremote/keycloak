/*
 * Per-realm branding.
 *
 * Reads the manager's public GET /api/{realm}/configuration/manager and applies the realm's
 * logo, title and brand colour, so a custom project needs no changes to this theme - only
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
    // The tint and hover variants are separate tokens; setting only the base colour would
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

export async function applyBranding(kcContext: KcContext): Promise<void> {
  const realm: string | undefined = kcContext.realm?.name;

  /*
   * Declared in package.json under keycloakify.environmentVariables, which makes the build
   * emit `OR_MANAGER_URL=${env.OR_MANAGER_URL:}` into the theme's theme.properties. Keycloak
   * resolves that against its own process environment when it renders the page, so this is
   * deployment-time configuration: set OR_MANAGER_URL on the container, no rebuild.
   */
  const managerUrl = (kcContext.properties?.OR_MANAGER_URL ?? "").replace(/\/+$/, "");

  if (!realm) {
    return;
  }

  try {
    // credentials:"omit" is required: the manager sets corsAllowCredentials=true while
    // returning Access-Control-Allow-Origin:* in dev mode, which browsers reject for
    // credentialed requests. The endpoint is public.
    const response = await fetch(
      `${managerUrl}/api/${encodeURIComponent(realm)}/configuration/manager`,
      { credentials: "omit" }
    );

    if (!response.ok) {
      return;
    }

    const config = await response.json();
    const realmConfig = config.realms?.[realm] ?? config.realms?.default;

    if (!realmConfig) {
      return;
    }

    // Keycloak has one fixed hostname while the manager may be reached from several, so
    // prefer the canonical URL the config itself reports.
    const base = config.manager?.managerUrl || managerUrl || location.origin;

    if (realmConfig.appTitle) {
      document.title = realmConfig.appTitle;
      const title = document.getElementById("or-app-title");
      if (title) {
        title.textContent = realmConfig.appTitle;
      }
    }

    const logo = resolveAsset(realmConfig.logo, base);
    const logoEl = document.getElementById("or-logo") as HTMLImageElement | null;
    if (logo && logoEl) {
      logoEl.src = logo;
    }

    applyStyles(realmConfig.styles);
  } catch {
    // No manager reachable, or no config for this realm: keep the stock branding.
  }
}
