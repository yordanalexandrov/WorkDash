import type { ComponentChildren } from "preact";
import type { ColumnHead } from "../column.js";

/** `index` is the column's place on the board, which sets its turn in the entrance cascade. */
type ColumnProps = { column: ColumnHead; index: number; strip: boolean; onToggle(): void; children: ComponentChildren };

/**
 * A board column: a glassy panel that scrolls on its own, or a narrow strip with the title on its side and the count.
 * The hot column breathes a halo and turns a gradient border around itself.
 */
export function Column({ column, index, strip, onToggle, children }: ColumnProps) {
  const { title, accent, count } = column;
  const hot = column.hot && !strip;
  return (
    <section class={`col${strip ? " strip" : ""}${hot ? " hot" : ""}`} data-flip={`col:${column.id}`} style={{ "--accent": accent, "--ci": index }}>
      {hot ? <span class="halo" aria-hidden="true" /> : null}
      {hot ? <span class="ring" aria-hidden="true" /> : null}
      <header
        class="col-head"
        role="button"
        tabIndex={0}
        aria-expanded={!strip}
        title={strip ? "Разгъни" : "Сгъни"}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggle();
        }}
      >
        <h2>{title}</h2>
        <span class="count">{count}</span>
      </header>
      {strip ? null : <div class="cards">{count ? children : <p class="col-empty">Празно</p>}</div>}
    </section>
  );
}
