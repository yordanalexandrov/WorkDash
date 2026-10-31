// Project colours: each repo gets a hue of its own, the same between reloads.

// Well-apart hues, handed out in repo name order; each round after the first is shifted by ROUND_SHIFT.
export const PALETTE = [215, 28, 155, 285, 345, 190, 95, 50];
const ROUND_SHIFT = 17;

/** The hue of every repo in the set, by name order. */
export function repoHues(repos: Iterable<string>): Map<string, number> {
  return new Map(
    [...new Set(repos)]
      .sort()
      .map((repo, i) => [repo, PALETTE[i % PALETTE.length]! + Math.floor(i / PALETTE.length) * ROUND_SHIFT]),
  );
}

/** A hue from the text alone; also colours the avatars. */
export function textHue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** The repo's hue in the set, or one from its name when it is outside the set. */
export function repoHue(hues: Map<string, number>, repo: string): number {
  return hues.get(repo) ?? textHue(repo);
}
