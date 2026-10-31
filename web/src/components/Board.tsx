import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type ColumnHead, isStrip } from "../column.js";
import { useFlip } from "../motion.js";
import { Column } from "./Column.js";

type BoardProps<C extends ColumnHead> = {
  columns: C[];
  /** The cards of one column. */
  children(column: C): ComponentChildren;
  /** Shown in the middle of the board, e.g. when there is nothing to show. */
  message?: string | null;
};

/** How long the entrance cascade runs; cards that come later enter without its delay. */
const CASCADE_MS = 2200;

/**
 * One column per entry, side by side; a column folded or unfolded by hand stays so while the page is open.
 * Columns and cards glide to their new places after every change (FLIP) and cascade in when the board first shows.
 */
export function Board<C extends ColumnHead>({ columns, children, message }: BoardProps<C>) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [booted, setBooted] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useFlip(ref);
  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), CASCADE_MS);
    return () => clearTimeout(timer);
  }, []);
  const toggle = (column: C) => setFolded((all) => ({ ...all, [column.id]: !isStrip(column.count, all[column.id]) }));
  return (
    <main ref={ref} class={`board${booted ? " booted" : ""}`} data-flip-root>
      {columns.map((column, index) => (
        <Column
          key={column.id}
          column={column}
          index={index}
          strip={isStrip(column.count, folded[column.id])}
          onToggle={() => toggle(column)}
        >
          {children(column)}
        </Column>
      ))}
      {message ? <p class="board-message">{message}</p> : null}
    </main>
  );
}
