// The page's keyboard shortcuts: a keydown listener per layer, and the "not while typing" rule in one place.
// The app shell has the keys of every dashboard (`t`, `i`, `r`); the dashboard shown has its own on top (`first`), which
// run before the shell's and can take a key from it: a key a layer ran, or swallowed, never reaches the next one.

import { useEffect, useRef } from "preact/hooks";

export type Shortcut = { matches(event: KeyboardEvent): boolean; run(): void };

/** `/`, also on a Bulgarian layout, where the key under it types something else. */
export const SLASH = (event: KeyboardEvent) => event.key === "/" || event.code === "Slash";

/** `t`, also on a Bulgarian layout, where the key types "т" or "ь". */
export const T = (event: KeyboardEvent) => event.key === "t" || event.code === "KeyT";

/** `f`, also on a Bulgarian layout, where the key types "ф". */
export const F = (event: KeyboardEvent) => event.key === "f" || event.code === "KeyF";

/** `r`, also on a Bulgarian layout, where the key types "р" or "и". */
export const R = (event: KeyboardEvent) => event.key === "r" || event.code === "KeyR";

/** `i`, also on a Bulgarian layout, where the key types "и" or "ш". */
export const I = (event: KeyboardEvent) => event.key === "i" || event.code === "KeyI";

export const ESCAPE = (event: KeyboardEvent) => event.key === "Escape";

/** Whether the key press is typing into a field rather than a shortcut. */
function isTyping(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]") !== null;
}

/**
 * Runs the first shortcut that matches a key press, unless it is typed into a field, held with Ctrl, Meta or Alt, or
 * already taken by another layer. With `first`, this layer hears the key before the others (it listens in the capture phase).
 */
export function useShortcuts(shortcuts: Shortcut[], { first = false }: { first?: boolean } = {}): void {
  const current = useRef(shortcuts);
  current.current = shortcuts;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
      const shortcut = current.current.find((s) => s.matches(event));
      if (!shortcut) return;
      event.preventDefault();
      shortcut.run();
    };
    addEventListener("keydown", onKey, first);
    return () => removeEventListener("keydown", onKey, first);
  }, [first]);
}
