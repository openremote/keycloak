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

A rail down the left lists **all 38 login pages** in two sections: the ones with an
implementation, then the ones a built theme leaves to Keycloak's own (clicking those shows a
placeholder). It overlays rather than displacing the page, so the layout you are judging is the
real one; below 940px it collapses to a tab at the left edge. It also carries brand color and
logo overrides, for checking a custom project's branding without a manager running.

Switching pages **does not reload the document** — the click is handled in place, the URL is
updated with `pushState` and Lit re-renders. A real navigation re-parsed the bundle and, since
rspack injects CSS through JS in development, repainted an unstyled frame each time, which is
what made switching flash. Back/forward work via `popstate`, and `index.html` resolves the color
scheme inline before first paint so a dark page never flashes light on hard reload.

Switching pages **does not reload the document** — the click is handled in place, the URL is updated with `pushState` and Lit re-renders. A real navigation re-parsed the bundle and, since rspack injects CSS through JS in development, repainted an unstyled frame each time, which is what made switching flash. Back/forward work via `popstate`, and `index.html` resolves the color scheme inline before first paint so a dark page never flashes light on hard reload.

**Every page opens with the barest realm the theme can be asked to render** — no registration, no password reset, no remember-me, no identity providers, no internationalization. Most of a login page is realm configuration rather than a fixed layout, and that floor is the useful one to start from: anything on screen is unconditional, and everything else is a setting somebody turned on.

A **realm settings** section in the menu then offers one checkbox per feature the current page can be configured with, and they compose — tick registration and identity providers together and you get both. They are mock mutations, not second page modules, so what you are looking at is still the real page rendered by the real code.

**That list is discovered, not written down.** `src/dev/settings.ts` walks the page's own mock for boolean values and turns each into a checkbox, so a Keycloak or Keycloakify upgrade that adds a realm flag grows a control on its own, and one that removes a flag loses it — rather than leaving behind a control that silently sets a key nothing reads. The labels are therefore Keycloak's field names rather than prose. The handful of features that are not a plain boolean — identity providers, the 2FA manual layout, the error alert — are declared in the same file, each guarded by a check that its field still exists.

**Only settings that would change the page are listed.** The mocks share a common base, so discovery alone offered "show username" on the info page, which never reads it. Rather than keep a per-page list, the harness asks the page: it renders it off-screen with each setting ticked and drops any whose markup comes out identical. That is measured against what is already ticked, so a setting that only matters in combination appears when it starts to — tick "login with email allowed" and "registration email as username" shows up beneath it. Ticked boxes always stay, so they can be unticked. Hover the section heading for the list of what was left out.

Pages, settings and color scheme are all addressable directly, `settings` being a comma-separated list of those field paths:

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

**To find the key for a control, read Keycloak's own template for that page** and copy the key it passes to `msg(...)`; that is the rule the whole theme follows, so the wording stays Keycloak's in every language. `yarn check-keycloak` leaves those templates in `.keycloak-cache/<version>/theme/base/login/`. A key that does not exist is a compile error, because `msgStr` only accepts Keycloak's own keys.

Everything dev-only lives in `src/dev/`, reached solely through a dynamic import inside an `if (process.env.NODE_ENV === "development")` branch in `src/main.ts`. That placement is load-bearing: with the import hoisted into a module-level helper merely *called* from the branch, rspack can no longer eliminate it and the page switcher ships to production. Worth re-checking after changes — the production build should emit a single chunk containing neither the nav nor the mocks.

## Keeping up with Keycloak

Most of what this theme depends on lives in Keycloak rather than here: the message key behind every control, the fields a page is handed, which pages exist at all. None of that is checked by compiling, so an upgrade can rename a key or drop a page and everything still builds.

`yarn check-keycloak` is the check that notices, and it is run by `.github/workflows/keycloak-drift.yml` on pushes to `main` and on every pull request that touches `src/`, the `Dockerfile`, the script or the workflow. It keeps no record of its own: a Keycloak version's templates never change, so the published jar for each version is the record, and the `Dockerfile` and git history say which versions those are.

**Four things it fails on**, each true or false against the version `ARG VERSION` pins:

| Checked | Means |
| --- | --- |
| Every page in `src/pages` still exists upstream | A page we replaced is gone, so ours renders where Keycloak has nothing |
| Every message key the theme names is defined by Keycloak | The key was dropped or renamed. It still type-checks, because the types come from Keycloakify's copy, but the server resolves nothing |
| No stand-in in `src/i18n.ts` is redundant | Keycloakify now ships a key we were carrying ourselves, so ours can go and every locale gets Keycloak's own translation |
| No key the script records as never defined upstream is defined now | Keycloak added a message for something we were standing in for, so the exception can go |

**Five things it reports**, when the branch moves the pinned version: the templates behind our pages that changed, with a diff command each; pages added or removed upstream; new macros that a template behind one of our pages imports; message keys Keycloak's own version of our pages has started naming that our theme does not, which is how a relabelled control shows up while the key we still name goes on resolving; and keys we name whose English text changed, since the same key can carry different wording or a parameter it did not have.

One of the five fails, under **Failure: Drift detected**: a key Keycloak's own version of one of our pages has started naming that our theme does not. That is a control it relabelled, and our page is the thing to change, so it uses Keycloak's key for it. Where ours is deliberately worded otherwise, the key goes in `UPSTREAM_ONLY` in the check, with the reason in a comment beside it.

The rest is listed under **Consider checking** and does not fail: there is nothing here to edit to settle whether a template that moved, or wording Keycloak rewrote, matters to our version of a page, so a failure would be a red that no change can clear. Each line is a warning annotation on the run, and the report heads with Keycloak's release notes and upgrading guide for the new version.

Three further failures are about the check rather than the theme. It reads upstream markup with regexes, and one that stops matching makes an upgrade look clean, so each has to prove it still finds something in Keycloak's own versions of our pages.

What it watches is our pages' upstream counterparts closed over `<#import>`, not just the page files: 26.8.0 redesigned the identity provider buttons inside `social-providers.ftl` and left `login.ftl` untouched, which the page files alone would have reported as no change at all.

It needs `unzip` or a JDK, and downloads Keycloak's themes jar once per version into `.keycloak-cache/`.

### What it does not cover

The Vaadin components and the design system have their own versions and their own release notes; nothing here notices a Lumo token or a slot contract changing, which is the most likely way a page breaks silently. Neither does it look at Keycloakify, whose generated templates and `kcContext` types only move when its version in `package.json` does, where `tsc` is the net. And it reads templates, not behavior: a page Keycloak changes without touching its template, by sending a field it did not send before, still has to be found by rendering it.

### When it fails

- **`Keycloak <version> has no <page>.ftl`** — our page has no counterpart any more, so it is dead weight in the jar. Remove it, or repoint it at whatever replaced it.
- **`Message key "x" is not defined by Keycloak <version>`** — find the control in Keycloak's own template for that page and use the key it uses now. If the key never existed upstream and naming it is still right, as with `languages`, which Keycloak's own `template.ftl` names too, add it to `UNDEFINED_UPSTREAM` in the check with the reason.
- **`i18n.ts carries "x" only because ...`** — delete that entry from `withCustomTranslations`.
- **`### Failure: Drift detected`** in the upgrade report: Keycloak relabelled a control we also have. Use its key on our page, or add the key to `UPSTREAM_ONLY` with the reason beside it.
- **`UPSTREAM_ONLY lists "x" ...`**: that entry has outlived itself, because Keycloak does not name the key behind any page we implement, or because this theme names it now. Drop it, or check the spelling.
- **`No <#import> resolves ...`**, **`No page of Keycloak's renders registrationLayout ...`** or **`No msg("...") resolves ...`**: the check's own reading of Keycloak's templates has stopped working, so the upgrade report would be quietly incomplete. Fix the named function; do not silence the check.

### When you bump Keycloak

Change `ARG VERSION` in the `Dockerfile` and run `yarn check-keycloak`. The four checks above run against the new version, and the report is the review list for the upgrade: a control Keycloak relabelled fails it, the rest is for reading. Nothing else in the repo needs the version: the build and this check both read it from there.

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
