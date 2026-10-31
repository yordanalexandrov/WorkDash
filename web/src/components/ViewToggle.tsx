import type { View } from "../view.js";

const VIEWS: [View, icon: string, name: string][] = [
  ["board", "▦", "Дъска"],
  ["table", "☰", "Таблица"],
];

/** "▦ Дъска / ☰ Таблица": a segmented control whose thumb glides under the view shown, and the `t` that toggles it. */
export function ViewToggle({ view, onChange }: { view: View; onChange(view: View): void }) {
  return (
    <div class="view-toggle">
      <div class={`views at-${view}`} role="radiogroup" aria-label="Изглед">
        <span class="thumb" aria-hidden="true" />
        {VIEWS.map(([id, icon, name]) => (
          <button key={id} type="button" role="radio" aria-checked={view === id} class={view === id ? "on" : ""} title={`${name} (t)`} onClick={() => onChange(id)}>
            {`${icon} ${name}`}
          </button>
        ))}
      </div>
      <kbd title="t превключва изгледа">t</kbd>
    </div>
  );
}
