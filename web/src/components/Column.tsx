import type { ComponentChildren } from "preact";
import type { ColumnHead } from "../board.js";

type ColumnProps = { column: ColumnHead; strip: boolean; onToggle(): void; children: ComponentChildren };

/** A board column: a glassy panel that scrolls on its own, or a narrow strip with the title on its side and the count. */
export function Column({ column, strip, onToggle, children }: ColumnProps) {
  const { title, accent, count } = column;
  const hot = column.hot && !strip;
  return (
    <section class={`col${strip ? " strip" : ""}${hot ? " hot" : ""}`} style={{ "--accent": accent }}>
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
