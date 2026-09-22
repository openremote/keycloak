# OpenRemote login theme

The login half of the `openremote` Keycloak theme: **Lit** pages rendering **`@openremote/or-vaadin-components`**, bundled with **rspack**, wrapped into Keycloak FreeMarker templates by **Keycloakify**.

It is packaged into `openremote-theme-provider.jar` by `../build.gradle`, which is what the Docker image installs. You do not normally build this directory by hand — `./gradlew installDist` from the repo root drives it. See the [repo README](../../README.md) for that and for branding.

Uses yarn 4 with the same `.yarnrc.yml` as the `openremote` monorepo (`nodeLinker: node-modules`, `npmMinimalAgeGate: 1w`, `@openremote/*` preapproved), with the release binary committed under `.yarn/releases` — so nothing beyond `node` needs to be on the PATH.

## Dev loop

```shell
yarn install
yarn start          # http://localhost:5173
```

No Keycloak, no container. Page data comes from Keycloakify's `getKcContextMock`, so every page has realistic values, and rspack live-reloads on save.

Live reload covers `src/` only. `rspack.config.mjs` and the modules it imports — everything under `dev-server/` — are read once at startup, so a change there needs the dev server restarted. Nothing there is part of the built theme, so it never needs a Gradle build.

A rail down the left lists **every login page** in two sections: the ones with an implementation, then the ones a built theme leaves to Keycloak's own (clicking those renders Keycloak's page from the same mock data). It overlays rather than displacing the page, so the layout you are judging is the real one; below 940px it collapses to a tab at the left edge. It also carries brand color and logo overrides, for checking a custom project's branding without a manager running.

Switching pages **does not reload the document** — the click is handled in place, the URL is updated with `pushState` and Lit re-renders. A real navigation re-parsed the bundle and, since rspack injects CSS through JS in development, repainted an unstyled frame each time, which is what made switching flash. Back/forward work via `popstate`, and `index.html` resolves the color scheme inline before first paint so a dark page never flashes light on hard reload.

**Every page opens with the barest realm the theme can be asked to render** — no registration, no password reset, no remember-me, no identity providers, no internationalization. Most of a login page is realm configuration rather than a fixed layout, and that floor is the useful one to start from: anything on screen is unconditional, and everything else is a setting somebody turned on.

A **realm settings** section in the rail then offers one checkbox per feature the current page can be configured with, and they compose — tick registration and identity providers together and you get both. They are mock mutations, not second page modules, so what you are looking at is still the real page rendered by the real code.

**That list is discovered, not written down.** `src/dev/settings.ts` walks the page's own mock for boolean values and turns each into a checkbox, so a Keycloak or Keycloakify upgrade that adds a realm flag grows a control on its own, and one that removes a flag loses it — rather than leaving behind a control that silently sets a key nothing reads. The labels are therefore Keycloak's field names rather than prose. The handful of features that are not a plain boolean — identity providers, the 2FA manual layout, the error alert — are declared in the same file, each guarded by a check that its field still exists.

**Only settings that would change the page are listed.** The mocks share a common base, so discovery alone offered "show username" on the info page, which never reads it. Rather than keep a per-page list, the harness asks the page: it renders it off-screen with each setting ticked and drops any whose markup comes out identical. That is measured against what is already ticked, so a setting that only matters in combination appears when it starts to — tick "login with email allowed" and "registration email as username" shows up beneath it. Ticked boxes always stay, so they can be unticked. Hover the section heading for the list of what was left out.

Pages, settings and color scheme are all addressable directly, `settings` being a comma-separated list of those field paths:

```
http://localhost:5173/?page=login-config-totp.ftl
http://localhost:5173/?page=login-config-totp.ftl&settings=totp.manual
http://localhost:5173/?page=login.ftl&settings=realm.rememberMe,realm.registrationAllowed
http://localhost:5173/?page=login.ftl&settings=social.providers,message.error
http://localhost:5173/?page=login.ftl&lang=de
http://localhost:5173/?page=login.ftl&theme=dark
http://localhost:5173/?page=login.ftl&theme=light
```

**Links and buttons on the pages go where Keycloak would go.** In production every one of them returns to Keycloak, and its authentication flow on the server decides what comes next — so without a server, every submit used to post to a URL the dev server does not serve, and the language dropdown opened a GitHub gist. `src/dev/flows.ts` replaces each navigation URL in the mock with a marker naming its field, and resolves it, together with the submit button's name and value, against a table of Keycloak's transitions: "Review profile" goes to `idp-review-user-profile`, "Forgot password" back to login with the email-sent message, "Try Another Way" to `select-authenticator`, the language dropdown to the same page in that language.

Where Keycloak's answer depends on the realm or the data — does "Sign In" succeed, does the user have 2FA, can the realm send email — a small panel offers each outcome instead of picking one, and a step that ends the login flow says so rather than navigating nowhere. That table is the one place the harness has to know Keycloak's flow, because the mocks do not carry it; every destination in it is checked against the mocks' page ids, and a control with no entry says so on screen instead of silently doing nothing.

`theme` is an explicit override in **both** directions; with no `theme` parameter the page follows `prefers-color-scheme`.

**Nothing in that nav is hardcoded.** Both halves are derived: every pageId comes from `kcContextMocks`, the same data `getKcContextMock` serves, so a Keycloakify upgrade that adds or removes a page updates the list automatically; and the implemented set comes from `src/page-registry.ts`, which scans `src/pages` with rspack's `import.meta.webpackContext`.

## Comparing against stock Keycloak

**Show stock Keycloak** in the rail splits the window: this theme on the left, Keycloak's own page on the right. Useful for deciding whether a page is worth implementing, and more so now that the theme uses Keycloak's own wording — the copy on the left is supposed to be the copy on the right.

The **Source** under it picks where that page comes from.

### Rendered from mock data (default)

No Keycloak, no container. The dev server renders Keycloak's own FreeMarker templates itself, from the same mock data the left side is using — so **the realm settings in the rail apply to both sides**, and every page Keycloakify has a mock for is one click away. It needs two things:

- `./gradlew installDist` to have run once. It downloads the templates for the Keycloak version in the Dockerfile, plus the renderer's classpath — the FreeMarker that Keycloak release uses, and Jackson — into `.keycloak/` (gitignored). `./gradlew :theme:downloadStockKeycloak` does just that part.
- `java` on the PATH — the JDK Gradle already needs. The renderer is one file, `dev-server/StockRenderer.java`, run by the JDK's single-file launcher, so there is nothing to build. If either is missing the pane says which.

The right side is Keycloak's `keycloak.v2` theme, which is what a fresh realm uses. Its links and buttons go through the same dev flows as ours (`src/dev/flows.ts`), so clicking "Forgot Password?" on either side moves both on.

**Pages this theme does not implement render the same way, in place of a placeholder**, in the theme production actually serves them from. The dev server does not name that theme: it reads `parent=` out of the descriptor the build ships, so the preview cannot drift from the image. That is `keycloak.v2` by default, the same theme as the compare pane; `./gradlew installDist -PloginParentTheme=keycloak` switches the inherited pages to Keycloak's older theme, and the preview follows.

The settings list is the union of what changes our page and what changes either stock page, so a setting only Keycloak reacts to is not hidden while you compare. Half of that answer arrives from the dev server a moment after the click, so until it does the list keeps whatever the page offered last time rather than collapsing to what the browser alone can work out and reopening.

What this is not: a running server. The pages are Keycloak's markup with mock data, so behaviour that only exists server-side — real validation, a real redirect — is not there; that is what the live source is for. Two templates need more than their mocks provide (`webauthn-register`, `login-recovery-authn-code-config`); they say so rather than rendering blank.

Keycloakify's mocks follow Keycloak's template data closely but not exactly, so the renderer fills the gap the way Keycloak's own FreeMarker provider does — see `keycloakBehavior()` in `StockRenderer.java`. Each rule there was found as a template failing to render, and none names a page, so an upgrade that changes one shows up as a render error rather than a wrong page.

### Live Keycloak (optional)

A real Keycloak behind the dev-server proxy, for what only a running server does. Run one alongside the dev server and pick **Live Keycloak (container)** as the source:

```shell
docker run --rm -p 8082:8080 keycloak/keycloak:26.7.3 start-dev
```

Point it at another realm with the **Realm** box in the rail, and at another Keycloak with `KC_COMPARE_URL` (default `http://localhost:8082`).

A fresh `start-dev` realm has **User registration** and **Forgot password** switched off, and for those two pages Keycloak then shows its own error page — "Registration not allowed", "Reset Credential not allowed" — which looks like the pane failing and is not. Switch both on under Realm settings → Login (admin console at `http://localhost:8082`, after creating the admin user it asks for), or in one go:

```shell
TOKEN=$(curl -s -d client_id=admin-cli -d username=admin -d password=admin -d grant_type=password \
  http://localhost:8082/realms/master/protocol/openid-connect/token | sed 's/.*"access_token":"\([^"]*\)".*/\1/')
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"registrationAllowed":true,"resetPasswordAllowed":true}' http://localhost:8082/admin/realms/master
```

That assumes the container was started with `-e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin`. The pane's bar says the same thing on those two pages.

**It has to be a separate Keycloak, and it must not be given a hostname.** The dev server proxies `/realms`, `/resources` and `/auth` to it (see `rspack.config.mjs`) so that the framed page is same-origin — Keycloak sends `X-Frame-Options: SAMEORIGIN` on login pages, and a cross-origin iframe is simply blocked. With no `hostname` set, `start-dev` derives its base URL from the request, so every link, form action and redirect it emits points back through the proxy and the flow can be *driven* in the pane, not just looked at.

This is why you cannot point it at the Keycloak from a full OpenRemote stack: that one sets `KC_HOSTNAME`, so it ignores the request and hands out `http://localhost:8080/...` regardless — the pane would be redirected out of the proxy and then blocked by Keycloak's own `X-Frame-Options`. The pane checks the realm's `issuer` against its own origin before loading anything and says exactly that, instead of leaving you with a white rectangle.

The other half of that check is the path: OpenRemote's image serves Keycloak under `/auth` while `start-dev` serves it at the root, so the pane probes both rather than assuming. Getting it wrong otherwise produces a 404 that reads as *"that realm does not exist"*.

Where a page has a URL of its own the pane goes straight there — `register`, `login-reset-password`, `error`. The rest are opened as an authorization request:

- Pages that are part of **authenticating** get `prompt=login`, so Keycloak re-authenticates and renders them every time. Without it the pane worked exactly once per session: an authorization request stops showing login pages as soon as it can, so after the first login every load short-circuited to a redirect into the account console and the pane went blank.
- Pages reached **after** authenticating (`login-config-totp`, `login-update-password`, `login-update-profile`, …) are opened with the matching `kc_action` and *no* prompt, so the session you already have takes you straight there.

For the few that need more than a URL, the bar says what to do. See `src/dev/compare.ts`.

On the **error** page the container logs `type="LOGIN_ERROR" … error="client_not_found"`. That is this pane, not a misconfiguration: Keycloak's error page cannot be requested, only provoked, so the pane asks for a client that does not exist and Keycloak answers with the page. Every other route there logs a `LOGIN_ERROR` too, just a different one.

## Adding a page

Drop a file in `src/pages` exporting `pageId` and `render`. Nothing else — no router entry, no list to update. The dev nav picks it up, and so does the packaging step, which reads the same declaration to decide which generated templates to keep:

```ts
// src/pages/terms.ts
export const pageId = "terms.ftl";
type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  return layout({ kcContext, heading: i18n.msgStr("termsTitle"), content: html`...` });
}
```

Each page narrows `kcContext` to its own variant, so a typo in a `kcContext` field is a compile error rather than a blank spot on the page — `yarn tsc --noEmit` should stay clean.

Strings come from `i18n.msgStr(key)` using Keycloak's own message keys; OpenRemote's departures from Keycloak's wording are in `src/i18n.ts`. Use `advancedMsgStr` when the key itself comes from `kcContext` — authenticator app names, user profile labels, admin-authored messages.

Everything dev-only lives in `src/dev/`, reached solely through a dynamic import inside an `if (process.env.NODE_ENV === "development")` branch in `src/main.ts`. That placement is load-bearing: with the import hoisted into a module-level helper merely *called* from the branch, rspack can no longer eliminate it and the page switcher ships to production. Worth re-checking after changes — the production build should emit a single chunk containing neither the nav nor the mocks.

## Building it standalone

```shell
yarn build-keycloak-theme      # needs Maven + JDK on PATH
```

That leaves `build_keycloak/keycloak-theme-for-kc-all-other-versions.jar`. It is *not* the jar that ships: it declares only the login theme, and it still contains a template for every login page. `../build.gradle` unpacks it, drops the pages we do not implement, merges the message overrides and adds the email theme.

No Maven locally? Build in a container instead:

```shell
docker run --rm -v "$PWD":/w -w /w node:24-bookworm bash -c \
  "apt-get update -qq && apt-get install -y -qq maven && yarn install --immutable && yarn build-keycloak-theme"
```

## Notes

- **`@keycloakify/login-ui` is deliberately unused.** It is a React port of Keycloak's default login UI and its README currently says *"Do not use yet"*. Everything needed comes from the main `keycloakify` package: `keycloakify/login` for the typed kcContext, `keycloakify/login/KcContext/getKcContextMock` for the dev mocks, and `keycloakify/login/i18n/noJsx` for translations. None of them pull in React, and the two files the compiler requires (`src/login/KcContext.ts`, `src/login/KcPage.tsx`) contain no JSX.
- **There is no progressive enhancement.** With JS blocked the page is a blank `<div id="app">`. The pages Keycloak serves from its own theme are unaffected.
- **Keycloakify gates Keycloak upgrades** — it has to support the version you want first.
- **rspack needs no Keycloakify plugin.** The whole integration is the `keycloakify` block in `package.json`; it just consumes the built output in `dist`.
- `keycloakify update-kc-gen` emits `src/kc.gen.tsx` using React `lazy`/`Suspense`/JSX. Nothing imports it, so no React reaches the bundle. It is gitignored.
- The design system bundle must be loaded deferred, which rspack does by default — loading it synchronously in `<head>` throws, because it appends to `document.body` during module evaluation.
- rspack's CSS pipeline duplicates shared `@import`s where esbuild deduped them (`--lumo-primary-color` appears 47 times in the output), which is why the CSS bundle is larger than it needs to be. Not inherent to the approach; worth a look.
