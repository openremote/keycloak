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
