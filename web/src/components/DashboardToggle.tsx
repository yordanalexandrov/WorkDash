import type { Dashboard } from "../dashboard.js";

const DASHBOARDS: [Dashboard, name: string][] = [
  ["prs", "PR-и"],
  ["issues", "Issues"],
];

/** "PR-и / Issues": a segmented control like the view toggle, whose thumb glides under the dashboard shown, and the `i` that toggles it. */
export function DashboardToggle({ dashboard, onChange }: { dashboard: Dashboard; onChange(dashboard: Dashboard): void }) {
  return (
    <div class="view-toggle">
      <div class={`views at-${dashboard}`} role="radiogroup" aria-label="Табло">
        <span class="thumb" aria-hidden="true" />
        {DASHBOARDS.map(([id, name]) => (
          <button key={id} type="button" role="radio" aria-checked={dashboard === id} class={dashboard === id ? "on" : ""} title={`${name} (i)`} onClick={() => onChange(id)}>
            {name}
          </button>
        ))}
      </div>
      <kbd title="i превключва таблото">i</kbd>
    </div>
  );
}
