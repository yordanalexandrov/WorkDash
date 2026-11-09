/** A poll shorter than this never shows the bar. */
export const SHOW_AFTER_MS = 150;
/** Once shown, the bar stays this long, so that it never only blinks. */
export const SHOW_AT_LEAST_MS = 400;

/** What the bar does next: show or hide after `delay` ms, or null to stay as it is. `shownAt` is when it appeared, null while hidden. */
export function barChange(busy: boolean, shownAt: number | null, now: number): { show: boolean; delay: number } | null {
  if (busy && shownAt === null) return { show: true, delay: SHOW_AFTER_MS };
  if (!busy && shownAt !== null) return { show: false, delay: Math.max(0, SHOW_AT_LEAST_MS - (now - shownAt)) };
  return null;
}
