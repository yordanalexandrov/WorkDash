import type { View } from "../view.js";

const VIEWS: [View, string][] = [
  ["board", "▦ Дъска"],
  ["table", "☰ Таблица"],
];

/** "▦ Дъска / ☰ Таблица": a segmented control whose thumb glides under the view shown, and the `t` that toggles it. */
export function ViewToggle({ view, onChange }: { view: View; onChange(view: View): void }) {
  return (
    <div class="view-toggle">
      <div class={`views ${view}`} role="radiogroup" aria-label="Изглед">
        <span class="thumb" aria-hidden="true" />
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={view === id} class={view === id ? "on" : ""} title={`${label.slice(2)} (t)`} onClick={() => onChange(id)}>
            {label}
          </button>
        ))}
      </div>
      <kbd title="t превключва изгледа">t</kbd>
    </div>
  );
}
