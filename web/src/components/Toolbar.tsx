import type { RefObject } from "preact";
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
};

/** The toolbar over the board (and later the table): the text filter, the repo chips that double as the colour legend, "само моите". */
export function Toolbar({ repos, filter, onChange, canFilterMine, shown, total, inputRef }: ToolbarProps) {
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
      <button type="button" class={`chip${filter.repos.length === 0 ? " on" : ""}`} aria-pressed={filter.repos.length === 0} onClick={() => onChange({ ...filter, repos: [] })}>
        Всички repo-та
      </button>
      {repos.map(({ repo, name, hue, count }) => {
        const on = filter.repos.includes(repo);
        return (
          <button key={repo} type="button" class={`chip${on ? " on" : ""}`} aria-pressed={on} title={repo} onClick={() => onChange(toggleRepo(filter, repo))}>
            <span class="dot" style={{ "--rh": hue }} aria-hidden="true" />
            {name}
            <span class="n">{count}</span>
          </button>
        );
      })}
      <span class="sep" aria-hidden="true" />
      <button
        type="button"
        class={`chip${filter.mine ? " on" : ""}`}
        aria-pressed={filter.mine}
        disabled={!canFilterMine}
        onClick={() => onChange({ ...filter, mine: !filter.mine })}
      >
        само моите
      </button>
    </div>
  );
}
