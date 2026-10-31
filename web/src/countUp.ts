// A number that counts to its value, as the counts in the heads of the board's columns do; it knows nothing of what is counted.

/** How long a count runs. */
export const COUNT_MS = 700;

/** The number shown `progress` (0 to 1) of the way from `from` to `to`, eased out (cubic) and rounded. */
export function countFrame(from: number, to: number, progress: number): number {
  const eased = 1 - (1 - progress) ** 3;
  return Math.round(from + (to - from) * eased);
}
