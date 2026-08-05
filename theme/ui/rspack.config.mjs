import { CopyRspackPlugin, HtmlRspackPlugin } from "@rspack/core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

export default {
  mode: isDev ? "development" : "production",
  entry: "./src/main.ts",
  output: {
    path: path.resolve(dirname, "dist"),
    filename: "assets/[name].[contenthash].js",
    cssFilename: "assets/[name].[contenthash].css",
    assetModuleFilename: "assets/[name].[contenthash][ext]",
    clean: true
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // @openremote/theme pulls in 18 static Inter faces (~2.1MB). The variable latin
      // subset is 2 files / ~207KB and covers every weight; src/styles/login.css maps
      // --lumo-font-family onto the "InterVariable" family it registers.
      "inter-ui/inter.css": "inter-ui/inter-variable-latin.css"
    }
  },
  // Native CSS handling: this is what lets us import @openremote/theme straight from npm,
  // bare @imports and font url()s included, with no vendoring step at all.
  experiments: { css: true },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "builtin:swc-loader",
        options: { jsc: { parser: { syntax: "typescript" }, target: "es2022" } },
        type: "javascript/auto"
      }
    ]
  },
  plugins: [
    new HtmlRspackPlugin({ template: "./index.html" }),
    // public/ is served directly by the dev server but must be copied for the real build,
    // otherwise the default logo 404s inside Keycloak.
    //
    // keycloakify-dev-resources is generated into public/ by `keycloakify update-kc-gen`
    // for Storybook, and `keycloakify build` hard-fails if it ends up in the build output.
    new CopyRspackPlugin({
      patterns: [
        {
          from: "public",
          to: ".",
          globOptions: { ignore: ["**/keycloakify-dev-resources/**"] }
        }
      ]
    })
  ],
  devServer: {
    port: 5173,
    host: "0.0.0.0",
    /*
     * Live reload rather than HMR.
     *
     * Nothing here registers an import.meta.webpackHot accept handler, so with hot: true the
     * server would push an update, find no module willing to take it, and leave the open page
     * showing the previous render. Edits recompiled but the browser never changed - which is
     * exactly the "did it actually reload?" symptom.
     *
     * A full reload is also the right semantics for this app: main() renders once from
     * kcContext on load, so re-running it from the top is what applying a change means.
     */
    hot: false,
    liveReload: true,
    open: false,
    static: {
      directory: path.resolve(dirname, "public"),
      // public/ holds the default logo; changing it should reload too.
      watch: true
    },
    // Templates and styles are reached through the import graph, but list them explicitly so
    // a file that is only referenced (not imported) still triggers a rebuild.
    watchFiles: ["src/**/*", "index.html"]
  }
};
