/*
 * Per-realm branding for the OpenRemote Keycloak login theme.
 *
 * Reads the same manager_config.json the Manager UI uses, via the public (unauthenticated)
 * endpoint GET /api/{realm}/configuration/manager, and applies the realm's logo, title,
 * favicon and brand colour. This is what lets a custom project restyle these pages without
 * touching the theme at all.
 *
 * Config comes from window.orKcBranding, populated by template.ftl.
 */
(function () {
  "use strict";

  var cfg = window.orKcBranding || {};
  var realm = cfg.realm || "";
  var configuredManagerUrl = (cfg.managerUrl || "").replace(/\/+$/, "");

  function reveal() {
    document.documentElement.classList.remove("or-booting");
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function addStyle(css) {
    if (!css) {
      return;
    }
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /*
   * Both selectors are always required. @openremote/theme defines its dark palette under
   * :root[theme~="dark"], which outranks a plain :root override, so branding applied only
   * to :root is silently ignored in dark mode. Listing both gives the dark case equal
   * specificity, and this stylesheet is appended after the theme so source order wins.
   */
  var BRAND_SELECTOR = ':root, :root[theme~="dark"]';

  /*
   * manager_config.json predates the Vaadin design system. Its `styles` strings are
   * written for the Manager's shadow DOM (":host > * { --or-app-colorN: ... }"), which
   * matches nothing in a plain document, and they carry the legacy --or-app-color* token
   * names rather than the --or-color-* ones the design system reads.
   *
   * So: rewrite the selector, and derive --or-color-primary from the legacy accent colour.
   * Any explicit --or-color-* in the config is injected afterwards and therefore wins,
   * which keeps projects that have already migrated working correctly.
   */
  function applyStyles(styles) {
    if (!styles) {
      return;
    }

    var accent = /--or-app-color4\s*:\s*([^;}]+)/.exec(styles);
    if (accent) {
      var c = accent[1].trim();
      // The tint and hover variants are separate tokens, so setting only the base colour
      // would leave the button hover and focus rings on the stock green. Percentages match
      // the ones default.css uses for its own palette.
      addStyle(
        BRAND_SELECTOR +
          "{" +
          "--or-color-primary:" + c + ";" +
          "--or-color-primary-50pct: color-mix(in srgb, " + c + " 76%, transparent);" +
          "--or-color-primary-10pct: color-mix(in srgb, " + c + " 13%, transparent);" +
          "--or-color-text-primary:" + c + ";" +
          "}"
      );
    }

    addStyle(
      styles
        .replace(/:host\s*>\s*\*/g, BRAND_SELECTOR)
        .replace(/:host/g, BRAND_SELECTOR)
    );
  }

  // Logo paths in manager_config.json are relative to the manager, which is not
  // necessarily this origin: Keycloak has one fixed hostname while the manager may be
  // reached from several. Prefer the canonical URL the config itself reports.
  function resolveAsset(path, managerBase) {
    if (!path) {
      return null;
    }
    try {
      return new URL(path, managerBase || window.location.origin).href;
    } catch (e) {
      return path;
    }
  }

  function applyRealmConfig(config) {
    var realms = config.realms || {};
    var realmConfig = realms[realm] || realms["default"];

    if (!realmConfig) {
      return;
    }

    var managerBase =
      (config.manager && config.manager.managerUrl) ||
      configuredManagerUrl ||
      window.location.origin;

    if (realmConfig.appTitle) {
      document.title = realmConfig.appTitle;
      var titleEl = document.getElementById("or-app-title");
      if (titleEl) {
        titleEl.textContent = realmConfig.appTitle;
      }
    }

    var logo = resolveAsset(realmConfig.logo, managerBase);
    var logoEl = document.getElementById("or-logo");
    if (logo && logoEl) {
      logoEl.src = logo;
    }

    var favicon = resolveAsset(realmConfig.favicon, managerBase);
    var faviconEl = document.getElementById("or-favicon");
    if (favicon && faviconEl) {
      faviconEl.href = favicon;
      faviconEl.removeAttribute("type");
    }

    applyStyles(realmConfig.styles);
  }

  function load() {
    if (!realm || typeof fetch !== "function") {
      reveal();
      return;
    }

    var url =
      configuredManagerUrl +
      "/api/" +
      encodeURIComponent(realm) +
      "/configuration/manager";

    // credentials:"omit" is required, not incidental: the manager sets
    // corsAllowCredentials=true while returning Access-Control-Allow-Origin:* in dev
    // mode, a combination browsers reject for credentialed requests. The endpoint is
    // public, so there is nothing to send anyway.
    fetch(url, { credentials: "omit" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (config) {
        if (config) {
          applyRealmConfig(config);
        }
      })
      .catch(function () {
        // No manager reachable, or no config for this realm: keep the stock branding.
      })
      .then(reveal);
  }

  // Track OS theme changes so a session left open follows the system switch.
  if (window.matchMedia) {
    var dark = window.matchMedia("(prefers-color-scheme: dark)");
    var sync = function (event) {
      if (event.matches) {
        document.documentElement.setAttribute("theme", "dark");
      } else {
        document.documentElement.removeAttribute("theme");
      }
    };
    if (typeof dark.addEventListener === "function") {
      dark.addEventListener("change", sync);
    }
  }

  ready(load);
})();
