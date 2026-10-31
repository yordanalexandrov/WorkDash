import type { PollMode } from "../api.js";

type PollControlsProps = {
  mode: PollMode;
  /** The poll interval as the toggle names it, e.g. "60s". */
  every: string;
  polling: boolean;
  button: { label: string; disabled: boolean };
  onMode(mode: PollMode): void;
  onRefresh(): void;
};

/** "⟳ На всеки 60s / ✋ При поискване", a segmented control like the view toggle, and "Обнови" (key `r`), which spins while a poll is under way. */
export function PollControls({ mode, every, polling, button, onMode, onRefresh }: PollControlsProps) {
  const modes: [PollMode, string, string][] = [
    ["periodic", `⟳ На всеки ${every}`, "Пита GitHub на всеки интервал"],
    ["on_demand", "✋ При поискване", "Пита GitHub, когато се върнеш на таблото или натиснеш „Обнови“"],
  ];
  return (
    <div class="poll-controls">
      <div class={`views at-${mode}`} role="radiogroup" aria-label="Обновяване">
        <span class="thumb" aria-hidden="true" />
        {modes.map(([id, label, title]) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} class={mode === id ? "on" : ""} title={title} onClick={() => onMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" class={`chip refresh${polling ? " busy" : ""}`} disabled={button.disabled} aria-busy={polling} title="Пита GitHub сега (r)" onClick={onRefresh}>
        <span class="icon" aria-hidden="true">
          ⟳
        </span>
        {button.label}
      </button>
    </div>
  );
}
