import type { VNode } from "preact";
import { useRef } from "preact/hooks";
import { useFlip } from "../motion.js";
import type { GroupBy, Sort, TableColumn } from "../table.js";
import { GroupHead, type GroupHeadLook } from "./GroupHead.js";

/** A group of rows; without a head its rows stand on their own (grouped by nothing). */
export type TableGroup<R> = { id: string; head?: GroupHeadLook; items: R[] };

type TableProps<R> = {
  /** The header; only key, label, title, alignment and whether it sorts are read here. */
  columns: TableColumn<never>[];
  sort: Sort;
  onSort(column: TableColumn<never>): void;
  /** The "Групирай по" choices: what to group by and its label. */
  groupings: [GroupBy, string][];
  groupBy: GroupBy;
  onGroupBy(by: GroupBy): void;
  /** The groups in order, their rows already sorted. */
  groups: TableGroup<R>[];
  collapsed: ReadonlySet<string>;
  onToggle(id: string): void;
  /** One row; `index` is its place in the table, which sets its turn in the entrance cascade. */
  row(item: R, index: number): VNode;
  /** Shown under the header, before the groups, e.g. when the filter keeps nothing. */
  message?: string | null;
  /** Whether the page's entrance cascade is over, so the table enters without its delay. */
  booted: boolean;
};

/**
 * A glassy panel: "Групирай по", a sticky header that sorts on a click, and one flat list of group heads and rows,
 * so sorting, grouping and folding glide the rows to their new places (FLIP). It knows nothing of PRs.
 */
export function Table<R>(props: TableProps<R>) {
  const { columns, sort, onSort, groupings, groupBy, onGroupBy, groups, collapsed, onToggle, row, message, booted } = props;
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref);
  let index = 0;
  const rows: VNode[] = [];
  for (const group of groups) {
    const shut = collapsed.has(group.id);
    if (group.head) {
      rows.push(
        <GroupHead
          key={`g:${group.id}`}
          id={group.id}
          count={group.items.length}
          shut={shut}
          index={index++}
          onToggle={() => onToggle(group.id)}
          {...group.head}
        />,
      );
    }
    if (!shut) for (const item of group.items) rows.push(row(item, index++));
  }
  return (
    <main class={`tablev${booted ? " booted" : ""}`}>
      <div class="tpanel">
        <div class="tbar">
          <span>Групирай по:</span>
          <div class="seg" role="radiogroup" aria-label="Групирай по">
            {groupings.map(([by, label]) => (
              <button key={by} type="button" role="radio" aria-checked={groupBy === by} class={groupBy === by ? "on" : ""} onClick={() => onGroupBy(by)}>
                {label}
              </button>
            ))}
          </div>
          <span class="hint">клик на колона сортира</span>
        </div>
        <div ref={ref} class="tscroll" data-flip-root>
          <div class="tgrid" role="table">
            <div class="thead" role="row">
              {columns.map((column) => {
                const on = sort.key === column.key;
                const sortable = column.value !== undefined;
                return (
                  <span
                    key={column.key}
                    role="columnheader"
                    class={`th${column.align ? ` ${column.align}` : ""}${sortable ? " sortable" : ""}${on ? " on" : ""}`}
                    title={column.title}
                    aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    {...(sortable ? { onClick: () => onSort(column) } : {})}
                  >
                    {column.label}
                    {sortable ? <span class="arrow">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span> : null}
                  </span>
                );
              })}
            </div>
            {message ? <div class="tempty">{message}</div> : null}
            {rows}
          </div>
        </div>
      </div>
    </main>
  );
}
