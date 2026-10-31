import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { type ColumnHead, isStrip } from "../column.js";
import { Column } from "./Column.js";

type BoardProps<C extends ColumnHead> = {
  columns: C[];
  /** The cards of one column. */
  children(column: C): ComponentChildren;
  /** Shown in the middle of the board, e.g. when there is nothing to show. */
  message?: string | null;
};

/** One column per entry, side by side; a column folded or unfolded by hand stays so while the page is open. */
export function Board<C extends ColumnHead>({ columns, children, message }: BoardProps<C>) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const toggle = (column: C) => setFolded((all) => ({ ...all, [column.id]: !isStrip(column.count, all[column.id]) }));
  return (
    <main class="board">
      {columns.map((column) => (
        <Column key={column.id} column={column} strip={isStrip(column.count, folded[column.id])} onToggle={() => toggle(column)}>
          {children(column)}
        </Column>
      ))}
      {message ? <p class="board-message">{message}</p> : null}
    </main>
  );
}
