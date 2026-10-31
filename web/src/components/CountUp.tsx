import { useLayoutEffect, useRef } from "preact/hooks";
import { COUNT_MS, countFrame } from "../countUp.js";
import { reducedMotion } from "../motion.js";

/**
 * The last number each count showed, by its `id`, kept outside the view: a board shown again (after the table, or a column
 * folded and unfolded) shows its counts at once and only counts what changed while it was away.
 */
const shown = new Map<string, number>();

type CountUpProps = {
  /** Who the count is, the same each time it shows. */
  id: string;
  value: number;
  /** How long the very first count waits, for its turn in the entrance cascade. */
  delay: number;
};

/**
 * A count (`.count`) that counts to `value` with ease-out over 700ms: from 0 the first time it shows, after `delay`; from the old
 * value at once when it changes. Its width holds the most digits it passes, so what is beside it does not move; under reduced
 * motion it shows the value at once.
 */
export function CountUp({ id, value, delay }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = shown.get(id);
  const from = last ?? 0;
  // Set when the value changes, not on every render: a render in the middle of a count must not narrow it.
  const width = useRef({ value: Number.NaN, digits: 1 });
  if (width.current.value !== value) width.current = { value, digits: String(Math.max(from, value)).length };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = (n: number) => {
      shown.set(id, n);
      el.textContent = String(n);
    };
    if (from === value || reducedMotion()) {
      show(value);
      return;
    }
    show(from);
    const wait = last === undefined ? delay : 0;
    let frame = 0;
    let start: number | null = null;
    const tick = (time: number) => {
      start ??= time + wait;
      const progress = Math.min(1, Math.max(0, (time - start) / COUNT_MS));
      show(countFrame(from, value, progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, value]);
  return <span ref={ref} class="count" style={{ "--digits": width.current.digits }} />;
}
