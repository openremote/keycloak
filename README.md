# Keycloak

[![Docker Image](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml/badge.svg)](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml)

Keycloak docker image built for `postgres` with:

* Default env variable values to assume running behind a reverse proxy sending `X-Forwarded-*` headers (env variables can be changed see keycloak documentation) 
* Enables metrics and health endpoints by default
* OpenRemote theme embedded and set as default (login and email templates only)
* Request path to `/auth` (like older versions of Keycloak to simplify usage behind a reverse proxy)
* Listener to configure roles of self-registered users. Roles are set using `KEYCLOAK_SELF_REGISTERED_USER_ROLES` environment variable,  
the JSON structure is
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
When assigning to the environment variable, it must be enclosed in double-quotes, properly escaped.  
This can be done e.g. by piping to `jq -c | sed 's/"/\\"/g'`, which would result in `"{\"realmRoles\":[\"restricted_user\"],\"clientRoles\":[{\"client\":\"openremote\",\"roles\":[\"read:assets\",\"write:attributes\"]}]}"`  
The listener is not enabled by default. In Keycloak, in the `Realm settings` - `Events` - `Event listeners` admin screen, `self-register-user-configure` should be added to the list.

## The OpenRemote theme

The jar built by `:theme` provides one Keycloak theme named `openremote`, with two types:

* **login** — built from [`theme/ui`](theme/ui), a [Keycloakify](https://keycloakify.dev)
  project. The pages are TypeScript and [Lit](https://lit.dev), rendering
  [`@openremote/or-vaadin-components`](https://www.npmjs.com/package/@openremote/or-vaadin-components)
  styled by [`@openremote/theme`](https://www.npmjs.com/package/@openremote/theme). rspack
  bundles it and Keycloakify wraps the bundle in the FreeMarker templates Keycloak serves.
* **email** — plain FreeMarker in `theme/src/main/resources/theme/openremote/email`, unaffected
  by the above.

Only the pages under `theme/ui/src/pages` are ours. Keycloakify generates a template for all
~39 login pages, so the packaging step drops the ones we do not implement and Keycloak serves
those from its own theme instead (via the generated `parent=keycloak`) — see
`theme/ui/scripts/write-implemented-pages.mjs`.

### Building

```shell
./gradlew installDist        # -> build/image/openremote-theme-provider.jar
docker build -t openremote/keycloak:dev .
```

Gradle drives the whole thing, so this needs **Node 20+** on the PATH as well as a JDK. It also
needs **Apache Maven**: Keycloakify shells out to it and refuses to start without it, even
though the jar it produces that way is discarded in favour of Gradle's.

Upgrading the design system is a version bump in `theme/ui/package.json` — there is no vendoring
step and nothing to keep in sync.

### Working on the login pages

The fast loop needs neither Keycloak nor a container:

```shell
cd theme/ui
yarn install
yarn start                   # http://localhost:5173
```

A rail down the left lists every login page — those with an implementation first, then those
inherited from Keycloak. Page data comes from Keycloakify's mocks, so every page has realistic
values, and rspack live-reloads on save. Page, colour scheme and brand overrides all live in the
URL, so the state survives a reload:

```
http://localhost:5173/?page=login-config-totp.ftl
http://localhost:5173/?page=login.ftl&theme=dark
```

Adding a page means dropping a file in `theme/ui/src/pages` that exports `pageId` and `render`.
Nothing else: the page registry, the dev rail and the packaging step all derive from that.

### Testing the real pages

Build the jar and mount it into a stock Keycloak — no need to build this repo's image:

```shell
./gradlew :theme:jar
docker run --rm -p 8081:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v "$PWD/theme/build/libs/openremote-theme-provider.jar:/opt/keycloak/providers/or-theme.jar:ro" \
  keycloak/keycloak:26.7.0 start-dev --spi-theme-cache-themes=false --spi-theme-static-max-age=-1
```

Then set the realm's **login theme** to `openremote` (Realm settings → Themes). Set only the
login theme: `--spi-theme-default=openremote` makes Keycloak look for an *admin* theme of that
name too, which this theme does not provide, and the admin console then fails to load.

There is no bind-mount hot reload for the login pages any more, because they are a compiled
bundle rather than templates — use the dev server above to iterate and this to verify.

Pages that are awkward to reach by driving a flow can be deep-linked with
[application-initiated actions](https://www.keycloak.org/docs/latest/server_admin/#con-aia_server_administration_guide),
appending `kc_action` to the auth request: `CONFIGURE_TOTP`, `UPDATE_PASSWORD`, `UPDATE_PROFILE`,
`UPDATE_EMAIL`, `VERIFY_EMAIL`.

To get Keycloak's own themes for reference (replace `${VERSION}` with the Keycloak version used):

```shell
docker cp ID:/opt/keycloak/lib/lib/main/org.keycloak.keycloak-themes-${VERSION}.jar ./
```

### Branding

Logo, application title and brand colour are read at runtime from the manager's
`manager_config.json`, via the public `GET /api/{realm}/configuration/manager` endpoint. A custom
project therefore only needs its own manager config — **no changes to this theme**. Legacy
configs are handled too: `styles` strings written for the Manager's shadow DOM (`:host > *`) are
rewritten to `:root`, and the legacy `--or-app-color4` is mapped onto `--or-color-primary`. An
explicit `--or-color-*` in the config takes precedence.

The manager is fetched same-origin by default, which is correct in production: Keycloak needs a
fixed hostname, and that hostname is also one of the manager's domains (the proxy serves the
manager at `/` and Keycloak at `/auth`), so the login page always renders somewhere a manager
answers. Because branding is keyed on realm rather than domain, it does not matter which manager
domain the user originally came from.

Set `OR_MANAGER_URL` on the Keycloak container only when Keycloak is served from an origin with
no manager behind it — including a split-origin development setup:

```shell
docker run ... -e OR_MANAGER_URL=http://127.0.0.1:8080 openremote/keycloak:develop
```

It is read at render time from the theme's `theme.properties`, so it takes effect on restart with
no rebuild. Such a setup also needs the Keycloak origin added to `OR_WEBSERVER_ALLOWED_ORIGINS`
on the manager, since production CORS is not `*` (in dev mode the manager already allows all
origins).

### Translations

Pages address Keycloak's own message keys, and Keycloakify ships Keycloak's bundle for ~30
languages, so enabling internationalisation on a realm translates the theme. OpenRemote's
departures from that wording live in `theme/ui/src/i18n.ts`; a small number of them must also be
in `theme/src/main/messages/messages_en.properties`, which explains why in its header.
