// What a board column needs to know, whatever it holds: PRs now, issues later.

/** What the head of a column shows; `hot` marks the column that needs me now. */
export type ColumnHead = { id: string; title: string; accent: string; count: number; hot: boolean };

/** Whether a column shows as a narrow strip: folded by hand, else when it is empty. */
export function isStrip(count: number, folded: boolean | undefined): boolean {
  return folded ?? count === 0;
}
