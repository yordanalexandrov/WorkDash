import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { ColumnHead } from "../column.js";
import { CountUp } from "./CountUp.js";

/** How long after a column has entered `onReveal` runs. */
const REVEAL_AFTER_MS = 700;

type ColumnProps = {
  column: ColumnHead;
  /** The column's place on the board, which sets its turn in the entrance cascade. */
  index: number;
  strip: boolean;
  onToggle(): void;
  /** Whether the entrance cascade is over, so the column enters, counts and reveals without waiting for its turn. */
  booted: boolean;
  /** Runs with the column's head a while after it shows unfolded, e.g. for confetti; whoever passes it decides if it runs once. */
  onReveal?: (head: HTMLElement) => void;
  children: ComponentChildren;
};

/**
 * A board column: a glassy panel that scrolls on its own, or a narrow strip with the title on its side and the count.
 * The hot column breathes a halo and turns a gradient border around itself; its count counts up to its value.
 */
export function Column({ column, index, strip, onToggle, booted, onReveal, children }: ColumnProps) {
  const { title, accent, count } = column;
  const hot = column.hot && !strip;
  const head = useRef<HTMLDivElement>(null);
  const reveal = useRef(onReveal);
  reveal.current = onReveal;
  const turn = booted ? 0 : index * 80;
  const revealing = !strip && onReveal !== undefined;
  useEffect(() => {
    if (!revealing) return;
    const timer = setTimeout(() => head.current && reveal.current?.(head.current), REVEAL_AFTER_MS + turn);
    return () => clearTimeout(timer);
  }, [revealing]);
  return (
    <section class={`col${strip ? " strip" : ""}${hot ? " hot" : ""}`} data-flip={`col:${column.id}`} style={{ "--accent": accent, "--ci": index }}>
      {hot ? <span class="halo" aria-hidden="true" /> : null}
      {hot ? <span class="ring" aria-hidden="true" /> : null}
      <div
        ref={head}
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
        <CountUp id={`col:${column.id}`} value={count} delay={strip || booted ? turn : 240 + turn} />
      </div>
      {strip ? null : <div class="cards">{count ? children : <p class="col-empty">Празно</p>}</div>}
    </section>
  );
}
