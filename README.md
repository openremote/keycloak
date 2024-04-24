# Keycloak

[![Docker Image](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml/badge.svg)](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml)

Keycloak docker image built for `postgres` with:

* Default env variable values to assume running behind a reverse proxy sending `X-Forwarded-*` headers (env variables can be changed see keycloak documentation) 
* Enables metrics and health endpoints by default
* Adds custom functionality to allow token 'issuer' to be fixed by setting `KEYCLOAK_ISSUER_BASE_URI` (e.g. `KEYCLOAK_ISSUER_BASE_URI: https://192.168.1.2/auth`)
this is to allow a private deployment to be accessed over a reverse tunnel, when using this you also need to set the following but precaution should be taken to validate the `Host` header in the reverse proxy:
  * `KC_HOSTNAME: `
  * `KC_HOSTNAME_STRICT: false`
* OpenRemote theme embedded and set as default
* Request path to `/auth` (like older versions of Keycloak to simplify usage behind a reverse proxy)

## Working on the OpenRemote theme
The openremote theme template files are located in `src/main/resources/theme/openremote`; to work on the OpenRemote theme use:

```shell
docker run --rm -p 8081:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=secret -e KEYCLOAK_DEFAULT_THEME=dev -e KC_HOSTNAME_PORT=8081 -e KEYCLOAK_START_COMMAND=start-dev -e KEYCLOAK_START_OPTS="--spi-theme-static-max-age=-1 --spi-theme-cache-themes=false --spi-theme-cache-templates=false" --mount type=bind,src=$PWD/src/main/resources/theme/openremote,dst=/deployment/keycloak/themes/dev openremote/keycloak:latest
```

Then access http://localhost:8081/ and any changes made to the template files can be reloaded in realtime by just refreshing the window.

To get the standard themes for reference use the following (replace `${VERSION}` with actual keycloak version used):
```shell
docker cp ID:/opt/keycloak/lib/lib/main/org.keycloak.keycloak-themes-${VERSION}.jar ./
```
