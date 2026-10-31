import type { ComponentChildren } from "preact";

/** What a group head shows: its colour, label, an optional muted `sub` and something before the label (a dot, an avatar). */
export type GroupHeadLook = { color: string; label: string; sub?: string; lead?: ComponentChildren };

type GroupHeadProps = GroupHeadLook & {
  id: string;
  count: number;
  shut: boolean;
  /** Its place in the table, which sets its turn in the entrance cascade. */
  index: number;
  onToggle(): void;
};

/** The head of a group of rows: ▾, the label and the count; a click folds or unfolds the group. */
export function GroupHead({ id, count, shut, index, onToggle, color, label, sub, lead }: GroupHeadProps) {
  return (
    <div
      class={`tgroup${shut ? " shut" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={!shut}
      data-flip={`g:${id}`}
      style={{ "--gc": color, "--ti": index }}
      title={shut ? "Разгъни" : "Сгъни"}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
    >
      <span class="caret" aria-hidden="true">
        ▾
      </span>
      {lead}
      <span>{label}</span>
      {sub ? <span class="sub">{sub}</span> : null}
      <span class="count">{count}</span>
    </div>
  );
}
