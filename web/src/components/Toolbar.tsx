import type { ComponentChildren, RefObject } from "preact";
import { type Filter, toggleRepo } from "../filter.js";

/** A repo chip: `name` is shown, `repo` is the full name; `count` is how many open items it has before any filter. */
export type ToolbarRepo = { repo: string; name: string; hue: number; count: number };

type ToolbarProps = {
  repos: ToolbarRepo[];
  filter: Filter;
  onChange(filter: Filter): void;
  /** "само моите" waits until it is known who I am. */
  canFilterMine: boolean;
  /** How many open items the filter keeps, and of how many. */
  shown: number;
  total: number;
  inputRef: RefObject<HTMLInputElement>;
  /** "Пусни деня": whether it runs, whether it can (not before the first snapshot), and starting or stopping it. */
  replay: { on: boolean; disabled: boolean; onToggle(): void };
};

/**
 * The toolbar over both views: the text filter, the repo chips that double as the colour legend, "само моите", and on the right
 * "Пусни деня".
 */
export function Toolbar({ repos, filter, onChange, canFilterMine, shown, total, inputRef, replay }: ToolbarProps) {
  const { query } = filter;
  return (
    <div class="toolbar">
      <label class={`filter${query ? " has" : ""}`}>
        <span class="mag" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          placeholder="Филтър: PR, автор, branch, Jira…"
          aria-label="Филтър"
          value={query}
          onInput={(event) => onChange({ ...filter, query: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onChange({ ...filter, query: "" });
            event.currentTarget.blur();
          }}
        />
        <kbd aria-hidden="true">{query ? "esc" : "/"}</kbd>
      </label>
      {query.trim() ? (
        <span class="shown" key={shown}>
          {shown} от {total}
        </span>
      ) : null}
      <span class="sep" aria-hidden="true" />
      <Chip on={filter.repos.length === 0} onClick={() => onChange({ ...filter, repos: [] })}>
        Всички repo-та
      </Chip>
      {repos.map(({ repo, name, hue, count }) => (
        <Chip key={repo} on={filter.repos.includes(repo)} title={repo} onClick={() => onChange(toggleRepo(filter, repo))}>
          <span class="dot" style={{ "--rh": hue }} aria-hidden="true" />
          {name}
          <span class="n">{count}</span>
        </Chip>
      ))}
      <span class="sep" aria-hidden="true" />
      <Chip on={filter.mine} disabled={!canFilterMine} onClick={() => onChange({ ...filter, mine: !filter.mine })}>
        само моите
      </Chip>
      <button
        type="button"
        class={`chip play${replay.on ? " on" : ""}`}
        aria-pressed={replay.on}
        title="Повтори активността от последните 48ч"
        disabled={replay.disabled}
        onClick={replay.onToggle}
      >
        <span>{replay.on ? "■ Спри" : "▶ Пусни деня"}</span>
      </button>
    </div>
  );
}

type ChipProps = { on: boolean; onClick(): void; title?: string; disabled?: boolean; children: ComponentChildren };

/** A toggle pill; `on` shows it pressed. */
function Chip({ on, onClick, title, disabled, children }: ChipProps) {
  return (
    <button type="button" class={`chip${on ? " on" : ""}`} aria-pressed={on} title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
