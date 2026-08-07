# OpenRemote Keycloak AGENTS.md file

`README.md` covers building, running and testing the image and theme, including the tools the build needs. `theme/ui/README.md` covers the login theme's dev server.

## Design

The login pages follow the Figma design. When asked to match or follow the design, or when you need to compare against it, first check that the Figma MCP server is connected. If it is not, stop and tell the user. If the user has not given you a link to the designs, ask for one rather than searching for it.

Work from the link you were given: node ids change when the file is reorganized, so do not reuse ids recorded elsewhere. The design's values are Lumo tokens that `@openremote/theme` already resolves: reference the token, do not hardcode the value.

`theme/ui/public/logo.svg` is exported from the design, not the older logo in the openremote repo's `ui/component/or-app/images`. It is only the fallback; in production the logo comes from `manager_config.json`.

## Messages

- Keycloak sends message keys for anything a realm can configure (user-profile labels, `totp.supportedApplications`, admin messages). Resolve them with `advancedMsgStr`.

## Vaadin components

- Put form state on the component, not the slotted `<input>`. Vaadin manages the slotted input and drops `name`, `value`, `required`, `autocomplete` and `autofocus` from it; only `type`, `inputmode` and `dir` belong there.
- Where the posted value lives differs per component:

    | component                                | `name` goes on                                       |
    | ---------------------------------------- | ---------------------------------------------------- |
    | text, password and email field, checkbox | the host                                             |
    | text area                                | the slotted `<textarea>`                             |
    | select, radio group                      | a hidden input kept in sync (see `src/pages/otp.ts`) |

- Vaadin buttons do not take part in forms. Use `submitButton()` and `cancelButton()` from `src/layout.ts`; `cancelButton()` also sets `formnovalidate`, without which required fields block cancelling.
- Check any form change with `new FormData(form)` in a real browser. A field that posts nothing looks identical on screen.
- Scope label rules to `label:not([slot])`. Vaadin's own labels are slotted, and an unscoped rule overrides their color.

## Keycloakify

- A page is a module in `src/pages` exporting `pageId` and `render`. The build keeps only those templates; Keycloak serves every other page from the theme's `parent=`.
- `parent=` defaults to `keycloak.v2` (`theme/build.gradle`, `-PloginParentTheme`). A parent that does not resolve makes Keycloak drop the whole theme rather than degrade, and the value is not env-substituted.
- `KcContextExtensionPerPage` must be `{}`, not `Record<string, never>`, which collapses every page's context to `never`.
- Build mocks with `createGetKcContextMock({...})` and take `getKcContextMock` off the result.
- The generated page sets `<base href=".../dist/">`, so links and form actions must use the absolute URLs from `kcContext`.
- `keycloakify build` deletes its resource tree once it has jarred it; the jar is its only output, which is why Gradle unpacks it.

## Keycloak

- OTP errors are reported under the field `totp`, not `otp`.
- `userOtpCredentials[].userLabel` may be blank; give the control a fallback name.
- `Unexpected error when authenticating with identity provider` is raised by the server, not the theme; see the identity providers section of `README.md`.

## CSS

- Space with flexbox `gap`, not margins. The design's frames are flex columns with a single gap.
- Do not put load-bearing layout behind `:has()`; use a class the template sets. Progressive enhancement is fine.
- Prefer `em` and derived values over repeated constants.
- A backtick in a comment inside a Lit `html` template ends the template.

## Gradle

- The jar is assembled from two resource roots, so anything under `src/main/resources/theme/openremote/login` collides with the generated theme.
- The Dockerfile's `ARG VERSION` is the Keycloak the image runs; the version catalog's `keycloak` is what the event listener compiles against.

## Verifying

The dev server renders the real pages from Keycloakify's mocks and is reliable for layout. The mocks are not representative data: make the code handle real data rather than editing a mock until a page looks right. Packaging, meaning which pages fall through to Keycloak, message merging and asset URLs, can only be checked against a real Keycloak container with the jar mounted, as described in `README.md`.
