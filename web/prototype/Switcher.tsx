import { useEffect } from "preact/hooks";
import type { Variant } from "./types.js";

const CSS = `
.proto-switcher { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 99999;
  display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 999px;
  background: #111; color: #fff; font: 13px/1 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.45);
  outline: 2px solid #ffd400; }
.proto-switcher button { all: unset; cursor: pointer; padding: 8px 12px; border-radius: 999px; }
.proto-switcher button:hover { background: #333; }
.proto-switcher span { padding: 0 8px; white-space: nowrap; }
`;

function editing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
}

export function Switcher({ variants, current, onChange }: { variants: Variant[]; current: number; onChange(index: number): void }) {
  const step = (delta: number) => onChange((current + delta + variants.length) % variants.length);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (editing(event.target)) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  const variant = variants[current]!;
  return (
    <div class="proto-switcher">
      <style>{CSS}</style>
      <button type="button" onClick={() => step(-1)} title="← предишен">‹</button>
      <span>{`${variant.key} (${variant.name}) · ${current + 1}/${variants.length}`}</span>
      <button type="button" onClick={() => step(1)} title="следващ →">›</button>
    </div>
  );
}
