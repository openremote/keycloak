/*
 * Keycloakify entrypoint.
 *
 * The contract is simply: if window.kcContext exists we are being served by Keycloak and
 * must render the matching page. That is all Keycloakify requires of a framework, which is
 * why Lit works here despite only React/Angular/Svelte being documented.
 */
import "./styles/index.css";
import type { KcContext } from "./login/KcContext";
import { applyBranding, applyFavicon } from "./branding";
import { applyTheme, renderPage } from "./render";

declare global {
  interface Window {
    kcContext?: KcContext;
  }
}

async function main(): Promise<void> {
  const root = document.getElementById("app");

  if (!root) {
    return;
  }

  const kcContext = window.kcContext;

  /*
   * The dynamic import must sit directly inside this branch. DefinePlugin turns the
   * condition into a constant, which lets rspack drop the branch and the whole dev module
   * graph - the mocks and the page switcher - from production builds. Hoisting the import
   * into a helper called from here silently ships both.
   */
  if (!kcContext && process.env.NODE_ENV === "development") {
    const { runDevMode } = await import("./dev/dev-mode");
    runDevMode(root);
    return;
  }

  applyTheme(null);

  if (!kcContext) {
    root.textContent = "No kcContext: this page is not being served by Keycloak.";
    return;
  }

  applyFavicon(kcContext);
  renderPage(kcContext, root);

  void applyBranding(kcContext);
}

void main();
