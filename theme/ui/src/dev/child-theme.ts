/**
 * Applies the child theme the dev server was pointed at, if any, and settles once its stylesheets
 * have loaded or failed to.
 *
 * Appends a <link> per stylesheet after the bundle's styles, so the child theme wins where
 * specificity ties, as in production. Production writes them into the head from index.html, which
 * needs a kcContext the dev server does not have. The harness keeps the page hidden until they have
 * loaded, so it is never shown without them.
 */
export async function applyChildTheme(): Promise<void> {
  let styles: string[];

  try {
    const response = await fetch("/__child-theme");
    styles = ((await response.json()) as { styles?: string[] }).styles ?? [];
  } catch {
    // No dev server route: nothing to apply.
    return;
  }

  await Promise.all(
    styles.map((href) => {
      const link = document.createElement("link");
      // A stylesheet that fails to load is left out, as the browser leaves it out of a real page.
      const settled = new Promise((resolve) => {
        link.onload = link.onerror = resolve;
      });

      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      return settled;
    }),
  );
}
