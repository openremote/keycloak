#!/usr/bin/env bash
#
# Build the OpenRemote design system assets from a local openremote checkout and install
# them into the login theme's vendor directory.
#
# TEMPORARY BRIDGE. The intended source of these files is npm — see
# theme/build.gradle, which downloads them for the version pinned by orUiVersion in
# login/theme.properties. That path does not work yet because:
#
#   * @openremote/or-vaadin-components declares "main": "build/dist/umd/index.bundle.js"
#     and now has an rspack config and a prepack that builds it, but no release carrying
#     that artifact has been published.
#   * @openremote/theme has an rspack config that points at src/index.ts while the package
#     actually ships src/index.js, so it has never produced a bundle and has no prepack.
#     Until that is fixed upstream the CSS is flattened here with esbuild instead.
#
# Once both packages publish their bundles, delete this script and drop the -PorUiLocal
# flag; nothing else in the repository depends on it.
#
# Usage:
#   theme/dev/build-design-system.sh [path-to-openremote-checkout]
#   ./gradlew installDist -PorUiLocal      # skips the npm download
#
set -euo pipefail

OR_REPO="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/../openremote}"
THEME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$THEME_DIR/src/main/resources/theme/openremote/login/resources/vendor"

if [ ! -d "$OR_REPO/ui/component/or-vaadin-components" ]; then
  echo "error: no openremote checkout at $OR_REPO" >&2
  echo "usage: $0 [path-to-openremote-checkout]" >&2
  exit 1
fi

command -v node >/dev/null || { echo "error: node is not on PATH" >&2; exit 1; }

RSPACK="$OR_REPO/node_modules/@rspack/cli/bin/rspack.js"
ESBUILD="$OR_REPO/node_modules/.bin/esbuild"
[ -f "$RSPACK" ] || { echo "error: $RSPACK not found; run yarn install in $OR_REPO" >&2; exit 1; }

echo "==> Building or-vaadin-components UMD bundle"
cd "$OR_REPO/ui/component/or-vaadin-components"
node "$RSPACK" build >/dev/null

echo "==> Flattening @openremote/theme CSS"
cd "$OR_REPO/ui/component/theme"
mkdir -p "$VENDOR/fonts"
# --alias swaps the 18 static Inter faces (2.1MB) for the variable latin subset (~207KB).
node "$ESBUILD" src/index.css \
  --bundle \
  --outfile="$VENDOR/or-theme.css" \
  --alias:inter-ui/inter.css=inter-ui/inter-variable-latin.css \
  --loader:.woff2=file \
  --asset-names="fonts/[name]" \
  --log-level=error

# default.css asks for the "Inter" family; the variable build registers "InterVariable".
cat >> "$VENDOR/or-theme.css" <<'CSS'

/* Appended by build-design-system.sh: the variable font registers as "InterVariable"
   while default.css requests "Inter". Kept out of the upstream token on purpose. */
:root { --lumo-font-family: "InterVariable", "Inter", -apple-system, BlinkMacSystemFont, "Roboto", "Segoe UI", Helvetica, Arial, sans-serif; }
CSS

cp "$OR_REPO/ui/component/or-vaadin-components/build/dist/umd/index.bundle.js" "$VENDOR/or-vaadin.js"

echo "==> Installed into $VENDOR"
du -ch "$VENDOR"/or-vaadin.js "$VENDOR"/or-theme.css "$VENDOR"/fonts/* | tail -1
