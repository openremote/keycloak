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

## Working on the OpenRemote theme
The OpenRemote theme template files are located in `theme/src/main/resources/theme/openremote`; to work on the OpenRemote theme use (ensure you are in the repo root dir first and change port as required):

```shell
docker run --rm -p 8081:8080 -e KC_DB="dev-mem" -e KC_HOSTNAME="localhost" -e KEYCLOAK_START_OPTS="--spi-theme-static-max-age=-1 --spi-theme-cache-themes=false --spi-theme-cache-templates=false" --mount type=bind,src=$PWD/theme/src/main/resources/theme/openremote,dst=/deployment/keycloak/themes/dev openremote/keycloak:develop
```

Then access http://localhost:8081/auth/ then create a new realm and change the template used for the realm to the `dev` template then try and login to that realm via http://localhost:8081/auth/admin/REALM_NAME/console and any changes made to the template files can be reloaded in realtime by just refreshing the window.

To get the standard themes for reference use the following (replace `${VERSION}` with actual keycloak version used):
```shell
docker cp ID:/opt/keycloak/lib/lib/main/org.keycloak.keycloak-themes-${VERSION}.jar ./
```

### Design system

The login theme renders [`@openremote/or-vaadin-components`](https://www.npmjs.com/package/@openremote/or-vaadin-components)
styled by [`@openremote/theme`](https://www.npmjs.com/package/@openremote/theme). Both are consumed as
**prebuilt bundles from npm**, so this repository has no JavaScript toolchain. `./gradlew :theme:downloadDesignSystem`
fetches them into `login/resources/vendor/` (gitignored); it runs automatically as part of the build.

To upgrade the design system, change `orUiVersion` in
`theme/src/main/resources/theme/openremote/login/theme.properties`. That single value pins the
download *and* is used as a cache-busting query string on the asset URLs — which matters because
`url.resourcesPath` only changes between Keycloak releases, so without it browsers, mobile apps and
desktop apps would keep serving the previous theme from cache.

#### Building the design system locally (temporary)

The npm download does not work yet, because neither package publishes a usable bundle:

* `@openremote/or-vaadin-components` declares `"main": "build/dist/umd/index.bundle.js"` and now has
  an rspack config plus a `prepack` that builds it, but no release carrying that artifact has been
  published.
* `@openremote/theme`'s rspack config points at `src/index.ts` while the package ships
  `src/index.js`, so it has never produced a bundle and has no `prepack`.

Until both are fixed upstream, build the assets from a local `openremote` checkout:

```shell
theme/dev/build-design-system.sh ../openremote   # writes into login/resources/vendor
./gradlew installDist -PorUiLocal                # skips the npm download
```

`-PorUiLocal` tells the build to use whatever is already in `resources/vendor`. Once the packages
publish their bundles, delete `theme/dev/build-design-system.sh` and drop the flag.

Note that the script also swaps Inter's 18 static faces (2.1 MB) for the variable latin subset
(~207 KB) and maps `--lumo-font-family` onto `InterVariable`; the upstream bundle should do the same.

### Previewing pages without Keycloak

`theme/dev/serve.js` is a zero-dependency dev server with live reload — no container, no install:

```shell
node theme/dev/serve.js        # http://localhost:8000/dev/preview.html
```

Editing any `.ftl`, `.css` or `.js` under the theme reloads the browser. The preview shows one page
at a time at **true full viewport**, so the centring and the `100vh` layout are representative.
State lives in the URL and survives reloads, so you stay where you were:

```
/dev/preview.html?page=totp-setup&dark=1&brand=e8730a
```

Pages are `login`, `reset`, `register`, `totp-setup`, `otp`. For narrow widths use the browser's
device toolbar rather than a fake frame, so the viewport — and therefore the media queries — are
genuinely narrow. Add `?noreload` when driving the page from screenshot tooling; the live-reload
stream never closes, which stops headless browsers deciding the page is idle.

It must be **served**, not opened as a file. Vaadin applies its Lumo styles by reading
`document.styleSheets[].cssRules`, which throws on `file://` because each file is an opaque origin —
the page still renders, but every component silently falls back to Vaadin's unstyled base look,
which reads as a CSS bug rather than a loading one.

The preview does not execute the FreeMarker templates and its markup is a hand-maintained copy, so
verify real pages against a running Keycloak.

### Testing the real pages without building this image

You do not need to build `openremote/keycloak` to work on the theme — mount it into the stock
Keycloak image instead:

```shell
docker run --rm -p 8081:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -v "$PWD/theme/src/main/resources/theme/openremote:/opt/keycloak/themes/openremote:ro" \
  keycloak/keycloak:26.7.0 start-dev \
  --spi-theme-cache-themes=false --spi-theme-cache-templates=false --spi-theme-static-max-age=-1
```

Then set the realm's **login theme** to `openremote` in the admin console (Realm settings → Themes).
Set only the login theme: `--spi-theme-default=openremote` makes Keycloak look for an *admin* theme
of that name too, which this theme does not provide, and the admin console then fails to load.

With template caching off, `.ftl` edits show up on refresh.

Pages that are awkward to reach by driving a flow can be deep-linked with
[application-initiated actions](https://www.keycloak.org/docs/latest/server_admin/#con-aia_server_administration_guide),
appending `kc_action` to the auth request: `CONFIGURE_TOTP`, `UPDATE_PASSWORD`, `UPDATE_PROFILE`,
`UPDATE_EMAIL`, `VERIFY_EMAIL`.

### Branding

Logo, application title, favicon and brand colour are read at runtime from the manager's
`manager_config.json`, via the public `GET /api/{realm}/configuration/manager` endpoint. A custom
project therefore only needs its own manager config — **no changes to this theme**. Legacy configs
are handled too: `styles` strings written for the Manager's shadow DOM (`:host > *`) are rewritten to
`:root`, and the legacy `--or-app-color4` is mapped onto `--or-color-primary`. An explicit
`--or-color-*` in the config takes precedence.

`managerUrl` in `login/theme.properties` is empty by default, which means a same-origin request.
That is correct in production: Keycloak needs a fixed hostname, and that hostname is also one of the
manager's domains (the proxy serves the manager at `/` and Keycloak at `/auth`), so the login page
always renders somewhere a manager answers. Because branding is keyed on realm rather than domain,
it does not matter which manager domain the user originally came from.

Set `managerUrl` only when Keycloak is served from an origin with no manager behind it — including a
split-origin development setup:

```properties
# theme/src/main/resources/theme/openremote/login/theme.properties
managerUrl=http://127.0.0.1:8080
```

With the bind mount above this takes effect on the next page load, no rebuild required. Such a setup
also needs the Keycloak origin added to `OR_WEBSERVER_ALLOWED_ORIGINS` on the manager, since
production CORS is not `*` (in dev mode the manager already allows all origins).
