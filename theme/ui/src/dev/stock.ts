/*
 * Dev-only client for the dev server's stock Keycloak renderer (dev-server/stock.mjs).
 *
 * Sends the same shaped kcContext the harness renders our own page from (so the realm settings in
 * the menu apply to the stock page too), and gets back a URL to frame.
 */
import { html, type TemplateResult } from "lit";
import { createFramePair, type FramePair } from "./frame-pair";
import { injectStyles } from "./styles";
import type { KcContext } from "../login/KcContext";
import { languageTag } from "../i18n";

export type StockRender =
  | { url: string; theme: string; keycloakVersion: string; changed: string[] }
  | { error: string };

export type StockVariant = { id: string; kcContext: KcContext };

/*
 * The mock as plain JSON.
 *
 * Functions are the only thing JSON cannot carry. A function taking no arguments is a bean getter
 * the templates may call (`totp.policy.getAlgorithmKey()`), so it is called and its result sent as
 * an ordinary value; the renderer makes every scalar callable, so the call still works. The one bean
 * whose methods take arguments, messagesPerField, is left out entirely: the renderer supplies it.
 */
function toModel(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "function") {
    if (value.length !== 0) {
      return undefined;
    }
    try {
      return toModel((value as () => unknown)(), seen);
    } catch {
      return undefined;
    }
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => toModel(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "messagesPerField")
      .map(([key, item]) => [key, toModel(item, seen)])
      .filter(([, item]) => item !== undefined)
  );
}

/**
 * Renders `kcContext`'s page with a stock theme: "compare" for the theme a fresh realm uses,
 * "fallback" for the one Keycloak serves in place of a page this theme does not implement.
 *
 * Each variant is rendered as well, and the ids of those whose page came out different are
 * returned as `changed`, the stock side of the menu's relevance filter.
 */
export async function renderStock(
  which: "compare" | "fallback",
  kcContext: KcContext,
  variants: readonly StockVariant[] = []
): Promise<StockRender> {
  try {
    const response = await fetch("/__stock/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        theme: which,
        pageId: kcContext.pageId,
        locale: languageTag(kcContext),
        model: toModel(kcContext),
        variants: variants.map(variant => ({ id: variant.id, model: toModel(variant.kcContext) }))
      })
    });

    return (await response.json()) as StockRender;
  } catch (error) {
    return { error: `The dev server did not answer: ${String(error)}` };
  }
}

/**
 * The keys Keycloakify's template has Keycloak resolve from kcContext itself: every string in it
 * that could be one, unwrapped from "${...}", and the ones it builds for required actions and
 * profile options (see addNonAutomaticallyGatherableMessagesToXKeycloakifyMessages there).
 */
export function contextMessageKeys(kcContext: KcContext): string[] {
  const keys = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      keys.add(/^\$\{(.+)\}$/.exec(value)?.[1] ?? value);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(visit);
    }
  };

  // What Keycloak would have sent, without the messages this harness merged in.
  visit({ ...kcContext, "x-keycloakify": undefined });

  const { requiredActions, profile } = kcContext as {
    requiredActions?: string[];
    profile?: { attributesByName: Record<string, Attribute> };
  };

  requiredActions?.forEach(action => keys.add(`requiredAction.${action}`));

  for (const { annotations, validators } of Object.values(profile?.attributesByName ?? {})) {
    const prefix = annotations?.inputOptionLabelsI18nPrefix;

    if (prefix !== undefined) {
      validators?.options?.options?.forEach(option => keys.add(`${prefix}.${option}`));
    }
  }

  return [...keys].filter(key => key.length <= 200 && /^[a-zA-Z0-9-_.]+$/.test(key)).sort();
}

type Attribute = {
  annotations?: { inputOptionLabelsI18nPrefix?: string };
  validators?: { options?: { options?: string[] } };
};

/**
 * What Keycloak resolves for one of our pages, from the stock renderer: the keys the page names,
 * which theme/build.gradle has it look up, and `keys`, the ones Keycloakify's template does. Used as
 * they come: that template escapes each message into the page and decodes it again, so the page
 * gets it unchanged. Undefined when the renderer is not available, and the page then shows its keys.
 */
export async function keycloakMessages(
  pageId: string,
  language: string,
  keys: string[]
): Promise<Record<string, string> | undefined> {
  try {
    const response = await fetch("/__stock/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageId, locale: language, keys })
    });
    const body = (await response.json()) as { messages?: Record<string, string>; error?: string };

    if (body.messages === undefined) {
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }

    return body.messages;
  } catch (error) {
    console.warn(`${pageId} shows its message keys: Keycloak's messages could not be resolved.`, error);
    return undefined;
  }
}

/* ------------------------------------------------------------------ unimplemented pages */

const FALLBACK_STYLES = `
.dev-fallback { display: flex; flex-direction: column; height: 100vh; }
.dev-fallback__bar {
  margin: 0;
  padding: 0.4rem 0.6rem;
  background: #17181a;
  color: rgba(255, 255, 255, 0.75);
  font: 12px/1.5 system-ui, sans-serif;
}
.dev-fallback__bar code { color: #fff; }
/* The menu overlays the page, and this bar starts at its left edge, so it would sit underneath. */
body:has(.dev-nav.is-open) .dev-fallback__bar { padding-inline-start: calc(var(--dev-nav-width, 13rem) + 0.6rem); }
/* Sized here; the stacking that keeps it from flashing belongs to ./frame-pair.ts. */
.dev-fallback .dev-frames { flex: 1; min-height: 0; }
.dev-fallback__problem { margin: 0; padding: 1rem; font: 12px/1.6 system-ui, sans-serif; }
`;

/*
 * One pair for the whole harness rather than one per page: the frames are reused as you move
 * between unimplemented pages, so moving between them swaps a loaded document for a loaded
 * document instead of blanking on each hop.
 */
let fallbackFrames: FramePair | undefined;

export type FallbackState = { status: "loading" } | ({ status: "done" } & StockRender);

/**
 * What an unimplemented page shows in the harness: Keycloak's own page, rendered from the same mock
 * data, in the theme Keycloak actually falls back to, rather than a placeholder saying nothing is
 * here. Rendered into the page root with Lit, so a re-render with the same URL leaves the frame
 * alone instead of reloading it.
 */
export function fallbackView(pageId: string, state: FallbackState): TemplateResult {
  injectStyles(FALLBACK_STYLES);

  const failed = state.status === "done" && "error" in state;
  const loaded = state.status === "done" && "url" in state ? state : undefined;

  fallbackFrames ??= createFramePair("Keycloak's own page");

  /*
   * Only ever pointed somewhere, never cleared: while the next render is in flight the previous
   * page is the best thing to show. A failure replaces the frames with the message below, so
   * nothing stale is left claiming to be the current page.
   */
  if (loaded !== undefined) {
    fallbackFrames.show(loaded.url);
  }

  return html`
    <div class="dev-fallback">
      <p class="dev-fallback__bar">
        <code>${pageId}</code> is not implemented by this theme.
        ${loaded
          ? html`In production Keycloak serves its own <code>${loaded.theme}</code> theme page here
              (Keycloak ${loaded.keycloakVersion}), rendered from this page's mock data.`
          : null}
      </p>
      ${failed
        ? html`<p class="dev-fallback__problem">${(state as { error: string }).error}</p>`
        : fallbackFrames.element}
    </div>
  `;
}
