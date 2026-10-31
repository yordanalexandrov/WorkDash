// The page's keyboard shortcuts: one keydown listener, and the "not while typing" rule in one place.

import { useEffect, useRef } from "preact/hooks";

export type Shortcut = { matches(event: KeyboardEvent): boolean; run(): void };

/** `/`, also on a Bulgarian layout, where the key under it types something else. */
export const SLASH = (event: KeyboardEvent) => event.key === "/" || event.code === "Slash";

/** `t`, also on a Bulgarian layout, where the key types "т" or "ь". */
export const T = (event: KeyboardEvent) => event.key === "t" || event.code === "KeyT";

/** `r`, also on a Bulgarian layout, where the key types "р" or "и". */
export const R = (event: KeyboardEvent) => event.key === "r" || event.code === "KeyR";

export const ESCAPE = (event: KeyboardEvent) => event.key === "Escape";

/** Whether the key press is typing into a field rather than a shortcut. */
function isTyping(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]") !== null;
}

/** Runs the first shortcut that matches a key press, unless it is typed into a field or held with Ctrl, Meta or Alt. */
export function useShortcuts(shortcuts: Shortcut[]): void {
  const current = useRef(shortcuts);
  current.current = shortcuts;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
      const shortcut = current.current.find((s) => s.matches(event));
      if (!shortcut) return;
      event.preventDefault();
      shortcut.run();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}
