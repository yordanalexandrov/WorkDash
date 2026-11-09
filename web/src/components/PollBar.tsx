import { useEffect, useRef, useState } from "preact/hooks";
import { barChange } from "../pollBar.js";

/** The bar along the top of the window while a poll is under way. Only a picture: "Обнови" carries `aria-busy`. */
export function PollBar({ busy }: { busy: boolean }) {
  const [shown, setShown] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    const change = barChange(busy, shownAt.current, performance.now());
    if (!change) return;
    const timer = setTimeout(() => {
      shownAt.current = change.show ? performance.now() : null;
      setShown(change.show);
    }, change.delay);
    return () => clearTimeout(timer);
  }, [busy]);
  return <div class={`poll-bar${shown ? " on" : ""}`} aria-hidden="true" />;
}
