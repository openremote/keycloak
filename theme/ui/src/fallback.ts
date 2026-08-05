import { html, type TemplateResult } from "lit";
import type { KcContext } from "./login/KcContext";
import { layout } from "./layout";

/**
 * Placeholder for a page this theme does not implement.
 *
 * It should never be reached in production. Keycloakify generates a template for all ~39
 * login pages and routes every one of them here, so the build (see theme/build.gradle)
 * drops the templates for the pages we have not implemented; Keycloak then falls through to
 * its own theme for those, via the generated `parent=keycloak`.
 *
 * What this is actually for is the dev harness, whose page switcher lists the unimplemented
 * pages so you can see at a glance what is being inherited rather than owned.
 */
export function fallbackPage(kcContext: KcContext): TemplateResult {
  return layout({
    kcContext,
    heading: "Not implemented here",
    content: html`
      <div class="or-alert or-alert--warning" role="alert">
        <span> <code>${kcContext.pageId}</code> has no implementation in this theme. </span>
      </div>
      <p class="or-card__lead">
        In a built theme this page is served by Keycloak's own template instead - its
        Keycloakify-generated counterpart is dropped at build time.
      </p>
      ${kcContext.url?.loginUrl
        ? html`<p class="or-card__aside">
            <a class="or-link" href=${kcContext.url.loginUrl}>Back to login</a>
          </p>`
        : null}
    `
  });
}
