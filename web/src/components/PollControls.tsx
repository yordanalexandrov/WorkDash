import type { PollMode } from "../api.js";

type PollControlsProps = {
  mode: PollMode;
  /** The poll interval as the toggle names it, e.g. "60s". */
  interval: string;
  /** Whether a poll is under way. */
  busy: boolean;
  pollNowButton: { label: string; disabled: boolean };
  onMode(mode: PollMode): void;
  onPollNow(): void;
};

/** "⟳ На всеки 60s / ✋ При поискване", a segmented control like the view toggle, and "Обнови" (key `r`), which spins while a poll is under way. */
export function PollControls({ mode, interval, busy, pollNowButton, onMode, onPollNow }: PollControlsProps) {
  const modes: [PollMode, string, string][] = [
    ["periodic", `⟳ На всеки ${interval}`, "Пита GitHub на всеки интервал"],
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
      <button
        type="button"
        class={`chip poll-now${busy ? " busy" : ""}`}
        disabled={pollNowButton.disabled}
        aria-busy={busy}
        title="Пита GitHub сега (r)"
        onClick={onPollNow}
      >
        <span class="icon" aria-hidden="true">
          ⟳
        </span>
        {pollNowButton.label}
      </button>
    </div>
  );
}
