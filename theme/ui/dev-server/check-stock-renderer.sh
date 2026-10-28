#!/usr/bin/env bash
#
# Renders one of Keycloak's own templates through StockRenderer.java, the way the dev server does,
# and fails unless Keycloak's own markup comes back.
#
# What this covers is the toolchain the compare pane stands on: what `./gradlew
# downloadStockKeycloak` fetched, the classpath it assembled, the JDK running the renderer as a
# source file, and FreeMarker finding a template through the theme chain. It does not cover the
# dev server itself, nor keycloakBehavior(), which is what adapts a page's mock data.
#
# The model is the smallest error.ftl accepts, because the template is the instrument here, not
# the subject. Run it from anywhere:
#
#   theme/ui/dev-server/check-stock-renderer.sh
set -euo pipefail

ui=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
downloaded="$ui/.keycloak"

if [ ! -d "$downloaded/lib" ]; then
  echo "Keycloak's themes are not downloaded yet. Run \`./gradlew downloadStockKeycloak\` from the repository root." >&2
  exit 1
fi

# One JSON object per line is the renderer's protocol, so the newlines come back out.
request=$(cat <<'REQUEST' | tr -d '\n'
{"id": 1, "theme": "keycloak.v2", "template": "error.ftl", "locale": "en", "model": {
  "pageId": "", "properties": {}, "scripts": [],
  "realm": { "name": "master", "displayNameHtml": "master", "internationalizationEnabled": false },
  "url": { "resourcesPath": "/r", "resourcesCommonPath": "/rc", "loginAction": "/a", "ssoLoginInOtherTabsUrl": "/sso" },
  "message": { "type": "error", "summary": "Rendered by the stock renderer" },
  "client": { "baseUrl": "" },
  "auth": { "showTryAnotherWayLink": false }
}}
REQUEST
)

response=$(printf '%s\n' "$request" | java -cp "$downloaded/lib/*" "$ui/dev-server/StockRenderer.java" "$downloaded/theme")

# login-pf is Keycloak's own class, from its template.ftl, so it is there only if a template of
# theirs actually rendered. A failure answers with "error" instead and is printed in full.
if [[ $response != *login-pf* ]]; then
  echo "The stock renderer did not render Keycloak's page:" >&2
  echo "$response" >&2
  exit 1
fi

echo "Rendered keycloak.v2/error.ftl, ${#response} bytes of response."
