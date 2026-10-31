// The fourth colour family of docs/design.md: a GitHub label drawn in its own colour, only on label chips.

import type { IssueLabel } from "./api.js";

/** What a label chip shows: its name, its GitHub colour, and whether dark or light text reads better on that colour. */
export type LabelChip = { name: string; background: string; ink: "dark" | "light" };

/** GitHub's default label colour, for a colour it gave in a form this does not read. */
const FALLBACK = "ededed";

/** The relative luminance of an sRGB colour (WCAG 2), from 0 for black to 1 for white. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A label as its chip draws it: the background is the label's GitHub colour, and the text is black or white, whichever
 * contrasts more with it. Only six hex digits reach the style; anything else is drawn in GitHub's default grey.
 */
export function labelChip({ name, color }: IssueLabel): LabelChip {
  const hex = /^[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : FALLBACK;
  const light = luminance(hex);
  // Contrast with black is (L + 0.05) / 0.05, with white 1.05 / (L + 0.05); they are equal where L is about 0.18.
  const ink = (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) ? "dark" : "light";
  return { name, background: `#${hex}`, ink };
}
