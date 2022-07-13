# Keycloak

[![Docker Image](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml/badge.svg)](https://github.com/openremote/keycloak/actions/workflows/keycloak.yml)

Keycloak docker image built for `postgres` with openremote theme embedded and set as default and also sets the request path to `/auth` (like older versions of Keycloak to simplify usage behind a reverse proxy).

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
