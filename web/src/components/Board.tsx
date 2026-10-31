import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import { type ColumnHead, isStrip } from "../column.js";
import { useFlip } from "../motion.js";
import { Column } from "./Column.js";

type BoardProps<C extends ColumnHead> = {
  columns: C[];
  /** The cards of one column. */
  children(column: C): ComponentChildren;
  /** Shown in the middle of the board, e.g. when there is nothing to show. */
  message?: string | null;
  /** Whether the page's entrance cascade is over, so the board (shown again, say) enters without its delay. */
  booted: boolean;
  /** The column whose head `run` gets a while after it shows unfolded (`onReveal` of Column). */
  reveal?: { id: string; run(head: HTMLElement): void } | null;
};

/**
 * One column per entry, side by side; a column folded or unfolded by hand stays so while the page is open.
 * Columns and cards glide to their new places after every change (FLIP) and cascade in when the board first shows.
 */
export function Board<C extends ColumnHead>({ columns, children, message, booted, reveal }: BoardProps<C>) {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLElement>(null);
  useFlip(ref);
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
          booted={booted}
          {...(reveal?.id === column.id ? { onReveal: reveal.run } : {})}
        >
          {children(column)}
        </Column>
      ))}
      {message ? <p class="board-message">{message}</p> : null}
    </main>
  );
}
