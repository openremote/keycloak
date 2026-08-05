# OpenRemote login theme

The login half of the `openremote` Keycloak theme: **Lit** pages rendering
**`@openremote/or-vaadin-components`**, bundled with **rspack**, wrapped into Keycloak
FreeMarker templates by **Keycloakify**.

It is packaged into `openremote-theme-provider.jar` by `../build.gradle`, which is what the
Docker image installs. You do not normally build this directory by hand — `./gradlew installDist`
from the repo root drives it. See the [repo README](../../README.md) for that and for branding.

Uses yarn 4 with the same `.yarnrc.yml` as the `openremote` monorepo (`nodeLinker: node-modules`,
`npmMinimalAgeGate: 1w`, `@openremote/*` preapproved), with the release binary committed under
`.yarn/releases` — so nothing beyond `node` needs to be on the PATH.

## Dev loop

```shell
yarn install
yarn start          # http://localhost:5173
```

No Keycloak, no container. Page data comes from Keycloakify's `getKcContextMock`, so every page
has realistic values, and rspack live-reloads on save.

A rail down the left lists **all 38 login pages** in two sections: the ones with an
implementation, then the ones a built theme leaves to Keycloak's own (clicking those shows a
placeholder). It overlays rather than displacing the page, so the layout you are judging is the
real one; below 940px it collapses to a tab at the left edge. It also carries brand colour and
logo overrides, for checking a custom project's branding without a manager running.

Switching pages **does not reload the document** — the click is handled in place, the URL is
updated with `pushState` and Lit re-renders. A real navigation re-parsed the bundle and, since
rspack injects CSS through JS in development, repainted an unstyled frame each time, which is
what made switching flash. Back/forward work via `popstate`, and `index.html` resolves the colour
scheme inline before first paint so a dark page never flashes light on hard reload.

Pages and colour scheme are addressable directly:

```
http://localhost:5173/?page=login-config-totp.ftl
http://localhost:5173/?page=login.ftl&theme=dark
http://localhost:5173/?page=login.ftl&theme=light
```

`theme` is an explicit override in **both** directions; with no `theme` parameter the page
follows `prefers-color-scheme`.

**Nothing in that nav is hardcoded.** Both halves are derived: every pageId comes from
`kcContextMocks`, the same data `getKcContextMock` serves, so a Keycloakify upgrade that adds or
removes a page updates the list automatically; and the implemented set comes from
`src/page-registry.ts`, which scans `src/pages` with rspack's `import.meta.webpackContext`.

## Adding a page

Drop a file in `src/pages` exporting `pageId` and `render`. Nothing else — no router entry, no
list to update. The dev nav picks it up, and so does the packaging step, which reads the same
declaration to decide which generated templates to keep:

```ts
// src/pages/terms.ts
export const pageId = "terms.ftl";
type PageContext = Extract<KcContext, { pageId: typeof pageId }>;

export function render(kcContext: PageContext, i18n: I18n): TemplateResult {
  return layout({ kcContext, heading: i18n.msgStr("termsTitle"), content: html`...` });
}
```

Each page narrows `kcContext` to its own variant, so a typo in a `kcContext` field is a compile
error rather than a blank spot on the page — `yarn tsc --noEmit` should stay clean.

Strings come from `i18n.msgStr(key)` using Keycloak's own message keys; OpenRemote's departures
from Keycloak's wording are in `src/i18n.ts`. Use `advancedMsgStr` when the key itself comes from
`kcContext` — authenticator app names, user profile labels, admin-authored messages.

Everything dev-only lives in `src/dev/`, reached solely through a dynamic import inside an
`if (process.env.NODE_ENV === "development")` branch in `src/main.ts`. That placement is
load-bearing: with the import hoisted into a module-level helper merely *called* from the branch,
rspack can no longer eliminate it and the page switcher ships to production. Worth re-checking
after changes — the production build should emit a single chunk containing neither the nav nor
the mocks.

## Building it standalone

```shell
yarn build-keycloak-theme      # needs Maven + JDK on PATH
```

That leaves `build_keycloak/keycloak-theme-for-kc-all-other-versions.jar`. It is *not* the jar
that ships: it declares only the login theme, and it still contains a template for every login
page. `../build.gradle` unpacks it, drops the pages we do not implement, merges the message
overrides and adds the email theme.

No Maven locally? Build in a container instead:

```shell
docker run --rm -v "$PWD":/w -w /w node:24-bookworm bash -c \
  "apt-get update -qq && apt-get install -y -qq maven && yarn install --immutable && yarn build-keycloak-theme"
```

## Notes

- **`@keycloakify/login-ui` is deliberately unused.** It is a React port of Keycloak's default
  login UI and its README currently says *"Do not use yet"*. Everything needed comes from the
  main `keycloakify` package: `keycloakify/login` for the typed kcContext,
  `keycloakify/login/KcContext/getKcContextMock` for the dev mocks, and
  `keycloakify/login/i18n/noJsx` for translations. None of them pull in React, and the two files
  the compiler requires (`src/login/KcContext.ts`, `src/login/KcPage.tsx`) contain no JSX.
- **There is no progressive enhancement.** With JS blocked the page is a blank `<div id="app">`.
  The pages Keycloak serves from its own theme are unaffected.
- **Keycloakify gates Keycloak upgrades** — it has to support the version you want first.
- **rspack needs no Keycloakify plugin.** The whole integration is the `keycloakify` block in
  `package.json`; it just consumes the built output in `dist`.
- `keycloakify update-kc-gen` emits `src/kc.gen.tsx` using React `lazy`/`Suspense`/JSX. Nothing
  imports it, so no React reaches the bundle. It is gitignored.
- The design system bundle must be loaded deferred, which rspack does by default — loading it
  synchronously in `<head>` throws, because it appends to `document.body` during module
  evaluation.
- rspack's CSS pipeline duplicates shared `@import`s where esbuild deduped them
  (`--lumo-primary-color` appears 47 times in the output), which is why the CSS bundle is larger
  than it needs to be. Not inherent to the approach; worth a look.
