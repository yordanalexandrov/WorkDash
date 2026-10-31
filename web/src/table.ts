// The table's sorting and grouping. It knows nothing of PRs, so an issues table uses it as it is: the columns say
// what an item's value is in each of them, and the caller says which group an item falls in.

export type Dir = 1 | -1;

/** The column sorted by and which way: 1 ascending (▲), -1 descending (▼). */
export type Sort = { key: string; dir: Dir };

/**
 * One column of the table. `value` is what it sorts by (none: the column does not sort; undefined for an item: the item
 * has nothing there and goes after every value), `first` the direction a click
 * on it starts from (ascending unless said otherwise). `title` explains a short label; `align` is "r" or "c".
 */
export type TableColumn<T> = {
  key: string;
  label: string;
  title?: string;
  align?: "r" | "c";
  value?: (item: T) => string | number | undefined;
  first?: Dir;
};

/** The sort after a click on `column`: the same column turns the other way, a new one starts in its natural direction. */
export function nextSort<T>(sort: Sort, column: TableColumn<T>): Sort {
  return sort.key === column.key ? { key: sort.key, dir: sort.dir === 1 ? -1 : 1 } : { key: column.key, dir: column.first ?? 1 };
}

function compare(a: string | number | undefined, b: string | number | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
}

/**
 * The items in the order of the sort; on a tie the more recently active one (by `updatedAt`, an ISO time) comes first,
 * and items that tie on that too keep their order. A column that does not sort leaves the order as it is.
 */
export function sortItems<T>(items: T[], columns: TableColumn<T>[], sort: Sort, updatedAt: (item: T) => string): T[] {
  const value = columns.find((column) => column.key === sort.key)?.value;
  if (!value) return [...items];
  return [...items].sort((a, b) => sort.dir * compare(value(a), value(b)) || updatedAt(b).localeCompare(updatedAt(a)));
}

/** What the rows are grouped by: "none" for one flat list, else whatever the caller groups on (section, repo, author…). */
export type GroupBy = string;

/** One group of rows; `id` is `"{by}:{key}"`, which is also how its folding is remembered. */
export type Group<T> = { id: string; key: string; items: T[] };

/**
 * The items in groups by `keyOf`, each keeping the items' order; the groups in `order` of their keys (by name unless
 * said otherwise), and only those with items. Grouping by "none" gives one group of everything.
 */
export function groupItems<T>(
  items: T[],
  by: GroupBy,
  keyOf: (item: T, by: GroupBy) => string,
  order: (a: string, b: string) => number = (a, b) => a.localeCompare(b),
): Group<T>[] {
  if (by === "none") return [{ id: "none:", key: "", items }];
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item, by);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.keys()].sort(order).map((key) => ({ id: `${by}:${key}`, key, items: groups.get(key)! }));
}

/** The folded groups after a click on the head of `id`: folds it if open, opens it if folded. */
export function toggleCollapsed(collapsed: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(collapsed);
  if (!next.delete(id)) next.add(id);
  return next;
}
