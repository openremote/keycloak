/*
 * Required only so Keycloakify's compiler registers a login theme; nothing imports it.
 * Rendering happens in src/main.ts with Lit. Despite the .tsx extension this file contains
 * no JSX, so it pulls in no React - the production bundle stays React-free.
 */
export default function KcPage(_props: { kcContext: unknown }) {
  return null;
}
