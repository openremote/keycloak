/*
 * Dev-only: stylesheets for the harness's own controls.
 *
 * Each dev module keeps the CSS for its own piece of the harness next to the code that renders it,
 * and they all need it in the document exactly once, which is what this is for.
 */
const injected = new Set<string>();

export function injectStyles(css: string): void {
  if (injected.has(css)) {
    return;
  }

  injected.add(css);

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
