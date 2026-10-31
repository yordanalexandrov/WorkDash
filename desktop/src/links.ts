/** Where a link followed in the window goes: the window itself, the default browser, or nowhere. */
export type LinkTarget = "window" | "browser" | "blocked";

/** Schemes worth handing to the default browser; anything else (file:, javascript:, data:, ...) is dropped. */
const BROWSER_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** The dashboard's own pages stay in the window; web and mail links anywhere else open in the default browser. */
export function linkTarget(url: string, dashboardUrl: string): LinkTarget {
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return "blocked";
  }
  if (link.origin === new URL(dashboardUrl).origin) return "window";
  return BROWSER_SCHEMES.has(link.protocol) ? "browser" : "blocked";
}
