# Keycloak

[![Docker Image](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml/badge.svg)](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml)

Keycloak docker image built for `postgres` with:

* Default env variable values to assume running behind a reverse proxy sending `X-Forwarded-*` headers (env variables can be changed see keycloak documentation)
* Enables metrics and health endpoints by default
* OpenRemote theme embedded and set as default (login and email templates only)
* Request path to `/auth` (like older versions of Keycloak to simplify usage behind a reverse proxy)
* Listener to configure roles of self-registered users. Roles are set using `KEYCLOAK_SELF_REGISTERED_USER_ROLES` environment variable, the JSON structure is
```
{
  "realmRoles" : [ "restricted_user" ],
  "clientRoles" : [
    {
      "client": "openremote",
      "roles": [
        "read:assets",
        "write:attributes"
      ]
    }
  ]
}
```
When assigning to the environment variable, it must be enclosed in double-quotes, properly escaped. This can be done e.g. by piping to `jq -c | sed 's/"/\\"/g'`, which would result in `"{\"realmRoles\":[\"restricted_user\"],\"clientRoles\":[{\"client\":\"openremote\",\"roles\":[\"read:assets\",\"write:attributes\"]}]}"` The listener is not enabled by default. In Keycloak, in the `Realm settings` - `Events` - `Event listeners` admin screen, `self-register-user-configure` should be added to the list.

## The OpenRemote theme

The jar built by `:theme` provides one Keycloak theme named `openremote`, with two types:

* **login** — built from [`theme/ui`](theme/ui), a [Keycloakify](https://keycloakify.dev) project. The pages are TypeScript and [Lit](https://lit.dev), rendering [`@openremote/or-vaadin-components`](https://www.npmjs.com/package/@openremote/or-vaadin-components) styled by [`@openremote/theme`](https://www.npmjs.com/package/@openremote/theme). rspack bundles it and Keycloakify wraps the bundle in the FreeMarker templates Keycloak serves.
* **email** — plain FreeMarker in `theme/src/main/resources/theme/openremote/email`, unaffected by the above.

**The login theme needs Keycloak 26 or newer**, which is what this image's `ARG VERSION` builds. `theme/ui/package.json` says the same thing — Keycloakify's `keycloakVersionTargets` has `"22-to-25": false` — and on an older server it does not degrade, it breaks in ways that look like theme bugs:

* Registration, update-profile and the identity-provider profile review render **no fields at all** beyond the passwords. Keycloak only drives these from the declarative user profile once it is always on, in 26; 22-to-25 keeps it behind a feature flag and, with the flag off, serves a fixed-field `register.ftl` with no `profile` in the model. The theme logs this to the browser console rather than leaving you to guess.
* Before 24, Keycloak fails to load the theme **entirely** and serves its own pages: the theme's `parent=keycloak.v2` (see `theme/build.gradle`) does not exist there.

So deploy the image this repo builds. Dropping the jar into an older `openremote/keycloak` is the one combination to avoid.

Only the pages under `theme/ui/src/pages` are ours. Keycloakify generates a template for every login page, so the packaging step drops the ones we do not implement and Keycloak serves those from its own theme instead (via the built theme's `parent=`) — see `theme/ui/scripts/write-implemented-pages.mjs`.

### Building

```shell
./gradlew installDist        # -> build/image/openremote-theme-provider.jar

# Build the image the way CI does
docker buildx inspect or-builder >/dev/null 2>&1 || docker buildx create --name or-builder --driver docker-container
docker buildx build --builder or-builder --load -t openremote/keycloak:dev .
```

Use the `docker-container` builder rather than a plain `docker build`: with the default builder the same Dockerfile comes out around 200 MB larger, because that builder stores a copy of Keycloak's whole library directory that this one recognises as unchanged. CI uses the same kind of builder (`docker/setup-buildx-action`).

Gradle drives the whole thing, so this needs **Node 20+** on the PATH as well as a JDK. It also needs **Apache Maven**: Keycloakify shells out to it and refuses to start without it, even though the jar it produces that way is discarded in favor of Gradle's.

Upgrading the design system is a version bump in `theme/ui/package.json` — there is no vendoring step and nothing to keep in sync.

### Working on the login pages

The fast loop needs neither Keycloak nor a container:

```shell
cd theme/ui
yarn install
yarn start                   # http://localhost:5173
```

A rail down the left lists every login page — those with an implementation first, then those inherited from Keycloak. Page data comes from Keycloakify's mocks, so every page has realistic values, and rspack live-reloads on save. Page, color scheme and brand overrides all live in the URL, so the state survives a reload:

```
http://localhost:5173/?page=login-config-totp.ftl
http://localhost:5173/?page=login.ftl&theme=dark
```

Adding a page means dropping a file in `theme/ui/src/pages` that exports `pageId` and `render`. Nothing else: the page registry, the dev rail and the packaging step all derive from that.

### Testing the real pages

Build the jar and mount it into a stock Keycloak — no need to build this repo's image:

```shell
./gradlew :theme:jar
docker run --rm -p 8081:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v "$PWD/theme/build/libs/openremote-theme-provider.jar:/opt/keycloak/providers/or-theme.jar:ro" \
  keycloak/keycloak:26.7.3 start-dev --spi-theme-cache-themes=false --spi-theme-static-max-age=-1
```

Then set the realm's **login theme** to `openremote` (Realm settings → Themes). Set only the login theme: `--spi-theme-default=openremote` makes Keycloak look for an *admin* theme of that name too, which this theme does not provide, and the admin console then fails to load.

There is no bind-mount hot reload for the login pages any more, because they are a compiled bundle rather than templates — use the dev server above to iterate and this to verify.

Pages that are awkward to reach by driving a flow can be deep-linked with [application-initiated actions](https://www.keycloak.org/docs/latest/server_admin/#con-aia_server_administration_guide), appending `kc_action` to the auth request: `CONFIGURE_TOTP`, `UPDATE_PASSWORD`, `UPDATE_PROFILE`, `UPDATE_EMAIL`, `VERIFY_EMAIL`.

#### Identity providers

**Publish Keycloak on the port it thinks it is on.** Testing a real provider — GitHub, Google — fails otherwise, with `Unexpected error when authenticating with identity provider` and HTTP 502, which reads like a theme or network problem and is neither.

Keycloak builds the `redirect_uri` it sends the provider from its own frontend URL, not from the request it is answering, and it sends that same string twice: once in the browser redirect, and again server-to-server when it exchanges the code. The provider requires the two to match. So if Keycloak is told it lives on one port (`KC_HOSTNAME_PORT`, or a `hostname` URL) while the browser reaches it on another, one of the two legs is always wrong: register the address that works in the browser and the token exchange is rejected as a `redirect_uri` mismatch; register the address Keycloak advertises and the browser cannot reach it at all. Keycloak reports the first as an unexpected error, because all it sees is a token response it cannot parse.

The `start-dev` command above is safe — with no hostname configured Keycloak derives it from the request. A full OpenRemote stack is not: it sets `KC_HOSTNAME_PORT=8080` and is commonly published on 8081. Check with

```shell
curl -s http://localhost:8081/auth/realms/master/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"'
```

and make the port in `issuer` the port you browse to. When it does go wrong the cause is in the server log, never on the page — `docker logs <container> | grep -A20 'identity provider'`.

To read Keycloak's own templates and message bundle for reference — which is the fastest way to answer "what does Keycloak do here?" — take them from Maven rather than from a container:

```shell
curl -O https://repo1.maven.org/maven2/org/keycloak/keycloak-themes/26.7.3/keycloak-themes-26.7.3.jar
unzip -q keycloak-themes-26.7.3.jar 'theme/base/login/*' 'theme/keycloak.v2/login/*'
```

From a running container it is `docker cp ID:/opt/keycloak/lib/lib/main/org.keycloak.keycloak-themes-${VERSION}.jar ./`, which has the advantage of being unambiguously the version you are running.

### Test cases

What to exercise before shipping a change to the theme. The pages carry no automated tests today; this list is written to be mechanical enough to become a Playwright suite against a throwaway Keycloak, which is the intended next step.

Unless a case says otherwise, every one of them should also be checked for the four things that cut across all of them — see **Cross-cutting** at the end.

**Realm setup.** One realm with: registration on, "Forgot password" on, "Remember me" on, "Email as username" off, "Login with email" on, internationalization on with at least English and one non-Latin-script language, and one identity provider configured. A second realm with all of those *off* is what catches links and controls that render when they should not.

#### Reaching a page

| Page | How |
|---|---|
| `login`, `register`, `login-reset-password` | Their own URLs |
| `login-config-totp`, `login-update-password`, `login-update-profile`, `update-email`, `login-verify-email` | `kc_action=CONFIGURE_TOTP` / `UPDATE_PASSWORD` / `UPDATE_PROFILE` / `UPDATE_EMAIL` / `VERIFY_EMAIL` on the auth request |
| `login-otp`, `select-authenticator` | Set up one (or two) second factors, then log in again |
| `idp-review-user-profile`, `login-idp-link-confirm`, `login-idp-link-email` | See **First broker login** below |
| `login-page-expired` | Open the login page, wait past the realm's login timeout (Realm settings → Sessions), submit |
| `info` | End of the Forgot-password flow |
| `error` | Any auth request naming a client that does not exist |

#### Login

- Valid credentials sign in and land back on the application.
- Wrong password re-renders the page with the error against the field, and the username still filled in.
- Submitting empty is refused by the fields themselves, with no request sent.
- "Forgot password?" and "New user? Register" go to the right pages — and are **absent** on the realm that has those features off.
- The username label reads "Username or email" with login-with-email on, "Username" without it.
- One button per identity provider, and clicking one reaches the provider (see [Identity providers](#identity-providers) above for the port trap that makes this fail).

#### Registration

- A registration that succeeds creates the account and continues the flow.
- Each field renders its own error; a global error appears once, in the alert, and not twice.
- Mismatched passwords are reported on the confirmation field.
- With terms required, the checkbox blocks submission until ticked.
- With reCAPTCHA on, both the visible and the invisible variants submit (the invisible one submits *through* the callback, so it is a different code path).
- Add a custom attribute to the realm's user profile as each of: select, radio group, multiselect, textarea, read-only, and multivalued. Each renders as that control, and the value posted survives a round trip — a multivalued attribute must keep **all** its values.
- With internationalization on, `locale` is a hidden field carrying the current language, not a visible text box.

#### Forgot password

- Submitting a known username returns to the **login page** with the success message "You should receive an email shortly with further instructions." (Keycloak's `ResetCredentialEmail` forks the flow back to login; it does not show `info`.)
- Submitting an unknown one says the same thing (Keycloak does not leak account existence).
- "Back to login" returns without a stray `«`.

#### Two-factor setup (`login-config-totp`)

- The QR code scans with a real authenticator app, and its quiet zone looks the same on a realm whose name is short and one whose name is long.
- "Unable to scan?" shows the secret key and the policy details, and the link back returns to the code. Both say "barcode" where the thing on screen is a QR code — that is Keycloak's own wording, matched by the design, and deliberately not overridden here.
- A wrong code re-renders with the error and the alert is not also shown.
- The device name is optional on the first credential and required once one exists.
- **Cancel, with every field empty, actually cancels.** This is the case that regressed: the fields are `required`, so without `formnovalidate` the browser blocks the submit and pops a validation bubble instead. Same check on `login-update-password` and `login-update-profile`.

#### Two-factor login (`login-otp`)

- A correct code signs in; a wrong one reports the error.
- With two registered devices the picker appears, and the device you choose is the one Keycloak validates against — pick the *second* one and use its code. Getting this wrong is silent: Keycloak falls back to a default credential and the code appears simply to be rejected.

#### First broker login

Configure an identity provider, then:

- **Review profile** — with Review Profile set to "on", the first sign-in through the provider shows `idp-review-user-profile` with the profile fields pre-filled from the provider, and submitting creates the account.
- **Account already exists** — sign in through the provider with an email that already belongs to a local account. `login-idp-link-confirm` appears, with the "User with email … already exists" message in the alert. "Review profile" and "Add to existing account" must each do what they say — they are one form distinguished only by `submitAction`, so a broken button silently does the *other* thing.
- **Verify by email** — with the flow's link action set to Email, `login-idp-link-email` appears naming the provider, the account and the realm, and the two "Click here" links re-send the mail and continue the flow.

#### Page expired

- Leave the login page open past the login timeout and submit. Both links work: "restart" starts a fresh flow, "continue" resumes one completed in another tab.

#### Cross-cutting

Run these against at least `login`, `register` and `login-config-totp` — the short page, the tall one, and the one with a non-text element in it.

- **Branding.** A realm with its own `manager_config.json` shows its logo, application title, brand color **and favicon**, with no flash of stock OpenRemote branding first. A realm with no entry falls back cleanly. A config using the legacy `--or-app-color4` brands correctly.
- **Dark mode.** Every page in `prefers-color-scheme: dark`, including the alert colors and the 2FA QR code, which needs a light backdrop to stay scannable.
- **Translations.** Switch to a non-English language: the whole page changes, including anything this theme adds. Nothing shows a literal `«`. Check one right-to-left language for layout.
- **Narrow screens.** 320px wide: nothing clipped, and the language switcher does not sit on top of the logo.
- **Inherited pages.** Spot-check a page this theme does *not* implement, e.g. `select-authenticator` or `terms` — those come from Keycloak's own theme and must still work.

### Branding

Logo, application title and brand color are read at runtime from the manager's `manager_config.json`, via the public `GET /api/{realm}/configuration/manager` endpoint. A custom project therefore only needs its own manager config — **no changes to this theme**. Legacy configs are handled too: `styles` strings written for the Manager's shadow DOM (`:host > *`) are rewritten to `:root`, and the legacy `--or-app-color4` is mapped onto `--or-color-primary`. An explicit `--or-color-*` in the config takes precedence.

The manager is fetched same-origin by default, which is correct in production: Keycloak needs a fixed hostname, and that hostname is also one of the manager's domains (the proxy serves the manager at `/` and Keycloak at `/auth`), so the login page always renders somewhere a manager answers. Because branding is keyed on realm rather than domain, it does not matter which manager domain the user originally came from.

Set `OR_MANAGER_URL` on the Keycloak container only when Keycloak is served from an origin with no manager behind it — including a split-origin development setup:

```shell
docker run ... -e OR_MANAGER_URL=http://127.0.0.1:8080 openremote/keycloak:develop
```

It is read at render time from the theme's `theme.properties`, so it takes effect on restart with no rebuild. Such a setup also needs the Keycloak origin added to `OR_WEBSERVER_ALLOWED_ORIGINS` on the manager, since production CORS is not `*` (in dev mode the manager already allows all origins).

### Translations

Pages address Keycloak's own message keys, and Keycloakify ships Keycloak's bundle for ~30 languages, so enabling internationalization on a realm translates the theme.

The wording is Keycloak's, including in English. This theme does not keep a house-style copy deck: an override can only be written in one language at a time, so it would show on an English page and nowhere else, and the theme would own auth copy it has no way to translate. A string that reads wrong reads wrong in every language, and the fix belongs in Keycloak.

`theme/ui/src/i18n.ts` therefore holds only two things, both explained there: the handful of keys Keycloak ships no message for in any language, and the stripping of the literal `«` that Keycloak prefixes to its back-links, which the stylesheet already draws as a chevron.
