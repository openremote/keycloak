/*
 * Dev-only: an iframe that can be pointed at a new document without going blank first.
 *
 * Navigating one iframe empties it for as long as the new page takes to arrive, which in the
 * harness is every settings click: the stock page is re-rendered and gets a new URL each time.
 * Two frames are kept stacked instead: the incoming document loads in the hidden one and they
 * swap once it has painted, so the pane always shows a finished page.
 */

import { injectStyles } from "./styles";

const STYLES = `
.dev-frames {
  position: relative;
  background: #fff;
}
.dev-frames iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.dev-frames iframe[data-back] {
  /* Still laid out, so the document paints; simply behind the front one and not clickable. */
  visibility: hidden;
  pointer-events: none;
}
`;

export type FramePair = {
  /** The element to place in the layout. Sized by its container. */
  readonly element: HTMLElement;
  /** Points the pair at `url`, or clears both when given null. */
  readonly show: (url: string | null) => void;
};

export function createFramePair(title: string): FramePair {
  injectStyles(STYLES);

  const element = document.createElement("div");
  element.className = "dev-frames";

  const pair = [document.createElement("iframe"), document.createElement("iframe")];
  pair.forEach((frame, index) => {
    frame.title = title;
    if (index === 1) {
      frame.dataset.back = "";
    }
    element.appendChild(frame);
  });

  let front = pair[0];

  /*
   * The load in flight, abandoned when the next call starts. Both load into the same back frame,
   * so its listeners would otherwise fire on the newer document as well and swap the pair twice,
   * leaving neither frame showing.
   */
  let pending: AbortController | undefined;

  return {
    element,

    show: url => {
      pending?.abort();

      const back = pair[0] === front ? pair[1] : pair[0];

      if (url === null) {
        pair.forEach(frame => frame.removeAttribute("src"));
        return;
      }

      if (front.getAttribute("src") === url) {
        return;
      }

      /*
       * Swapped on error and on a timeout as well as on load: a document that never fires `load`
       * must not leave the pane showing the previous page indefinitely, which would be a worse
       * lie than a flash.
       */
      const loading = new AbortController();
      pending = loading;

      const swap = (): void => {
        loading.abort();
        back.removeAttribute("data-back");
        front.dataset.back = "";
        front = back;
      };

      const timer = setTimeout(swap, 2000);
      loading.signal.addEventListener("abort", () => clearTimeout(timer));
      back.addEventListener("load", swap, { signal: loading.signal });
      back.addEventListener("error", swap, { signal: loading.signal });
      back.src = url;
    }
  };
}
