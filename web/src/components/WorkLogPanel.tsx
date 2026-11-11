import { useMemo, useRef, useState } from "preact/hooks";
import type { WorkLogPr } from "../api.js";
import { useFlip } from "../motion.js";
import { repoHue } from "../palette.js";
import { ESCAPE, useShortcuts } from "../useShortcuts.js";
import type { WorkLogView } from "../useWorkLog.js";
import {
  type Day,
  dayCells,
  dayLabel,
  dayOf,
  relativeDay,
  WORK_GROUPINGS,
  WORK_WINDOWS,
  type WorkGroupBy,
  type WorkRow,
  type WorkShown,
  type WorkWindow,
  weekday,
  windowDays,
  workActions,
  workEntries,
  workGroups,
  workMarkdown,
} from "../workLog.js";

const SHOWN: [WorkShown, string][] = [
  ["all", "всичко"],
  ["author", "Мои PR-и"],
  ["review", "Review-та"],
];

/** What the panel keeps while it is closed, until a reload: the window, the grouping and which PRs it shows. */
export type WorkLogKept = { window: WorkWindow; by: WorkGroupBy; shown: WorkShown };
export const WORK_LOG_KEPT: WorkLogKept = { window: "14", by: "day", shown: "all" };

function Segmented<T extends string>({ options, value, onChange, label }: { options: [T, string][]; value: T; onChange(value: T): void; label: string }) {
  return (
    <div class="wl-seg" role="radiogroup" aria-label={label}>
      {options.map(([id, name]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} class={value === id ? "on" : ""} onClick={() => onChange(id)}>
          {name}
        </button>
      ))}
    </div>
  );
}

function Row({ row, by, group, hue }: { row: WorkRow; by: WorkGroupBy; group: string; hue: number }) {
  const { pr } = row;
  return (
    <div class="wl-row" data-flip={`work:${group}:${pr.repo}#${pr.number}`} style={{ "--rh": hue }}>
      <div class="wl-head">
        {by !== "repo" && (
          <span class="tag" title={pr.repo}>
            {pr.repo.split("/")[1]}
          </span>
        )}
        <a class="num" href={pr.url} target="_blank" rel="noopener">
          #{pr.number}
        </a>
        <span class={`wl-role ${pr.role}`}>{pr.role === "author" ? "автор" : "review"}</span>
        <a class="wl-title" href={pr.url} target="_blank" rel="noopener" title={pr.title}>
          {pr.title}
        </a>
      </div>
      {pr.jira.length > 0 && (
        <div class="jira">
          {pr.jira.map((link) => (
            <a key={link.key} href={link.url} target="_blank" rel="noopener" title={`Jira ${link.key}`}>
              {link.key}
            </a>
          ))}
        </div>
      )}
      <div class="wl-actions">
        {row.days.map(({ day, events }) => (
          <div key={day}>
            {by !== "day" && <span class="wl-day">{dayLabel(day)}</span>}
            {workActions(events).map((action) => (
              <span key={action.kind} class={`wl-act ${action.kind}`}>
                {action.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <button type="button" class="chip wl-copy" onClick={copy} title="Копира периода като markdown: ден → тикет → PR-и">
      {copied ? "✓ Копирано" : "⧉ Копирай"}
    </button>
  );
}

/**
 * The Свършено panel: what I did on PRs of the followed repos over the window, as a strip of days and a list grouped by
 * day, repo or ticket, to copy for logging time. A sidebar on the right over the dashboard; Esc, ✕ or a click on the
 * shade closes it.
 */
export function WorkLogPanel({
  workLog,
  hues,
  kept,
  onKept,
  onClose,
}: {
  workLog: WorkLogView;
  hues: Map<string, number>;
  kept: WorkLogKept;
  onKept(kept: WorkLogKept): void;
  onClose(): void;
}) {
  const { log, loading, failed, refresh } = workLog;
  const { window, by, shown } = kept;
  const [picked, setPicked] = useState<Day | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useFlip(list);
  useShortcuts([{ matches: ESCAPE, run: onClose }], { first: true });

  const today = dayOf(new Date());
  const days = windowDays(window, today);
  const pullRequests: WorkLogPr[] = log?.pullRequests ?? [];
  const entries = useMemo(() => workEntries(pullRequests, days), [pullRequests, window, today]);
  const day = picked !== null && days.includes(picked) ? picked : null;
  const listed = entries.filter((entry) => (shown === "all" || entry.pr.role === shown) && (day === null || entry.day === day));
  const groups = workGroups(listed, day ? [day] : days, by, today);
  const error = failed ? "Свършеното не може да се зареди" : log?.error ? `Търсенето в GitHub не успя: ${log.error.message}` : null;

  return (
    <>
      <div class="wl-shade" onClick={onClose} aria-hidden="true" />
      <div class="wl-panel" role="dialog" aria-label="Свършено">
        <div class="wl-top">
          <h2>Свършено</h2>
          <span class="wl-sub">моята работа по PR-и в следените repos</span>
          <button type="button" class={`chip poll-now${loading ? " busy" : ""}`} onClick={refresh} disabled={loading} title="Търси отново в GitHub">
            <span class="icon" aria-hidden="true">
              ⟳
            </span>
          </button>
          <button type="button" class="wl-x" aria-label="Затвори" title="Затвори (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>
        <div class="wl-controls">
          <Segmented options={WORK_WINDOWS} value={window} onChange={(next) => onKept({ ...kept, window: next })} label="Период" />
          <CopyButton text={workMarkdown(entries, days)} />
        </div>
        <div class="wl-strip" style={{ "--n": days.length }}>
          {dayCells(entries, days).map((cell) => (
            <button
              key={cell.day}
              type="button"
              class={`wl-cell${cell.day === day ? " on" : ""}${cell.hole ? " hole" : ""}${cell.weekend ? " weekend" : ""}`}
              aria-pressed={cell.day === day}
              title={`${dayLabel(cell.day)}: ${cell.author} мои, ${cell.review} review`}
              onClick={() => setPicked(cell.day === day ? null : cell.day)}
            >
              <span class="wd">{weekday(cell.day)}</span>
              <span class="dd">{cell.day.slice(8)}</span>
              <span class="bars" aria-hidden="true">
                <i class="author" style={{ "--h": Math.min(cell.author, 4) }} />
                <i class="review" style={{ "--h": Math.min(cell.review, 4) }} />
              </span>
              {cell.hole && <span class="dash">—</span>}
            </button>
          ))}
        </div>
        <div class="wl-controls">
          <Segmented options={SHOWN} value={shown} onChange={(next) => onKept({ ...kept, shown: next })} label="Кои PR-и" />
          <span class="wl-label">по</span>
          <Segmented options={WORK_GROUPINGS} value={by} onChange={(next) => onKept({ ...kept, by: next })} label="Групирай по" />
          {day && (
            <button type="button" class="chip on" onClick={() => setPicked(null)} title="Покажи целия период">
              {dayLabel(day)} {relativeDay(day, today)} ✕
            </button>
          )}
        </div>
        {error && <p class="wl-error">{error}</p>}
        <div class="wl-list" ref={list} data-flip-root>
          {log === null ? (
            <p class="wl-none">Зарежда…</p>
          ) : groups.length === 0 ? (
            <p class="wl-none">Нищо в този период.</p>
          ) : (
            groups.map((group) => (
              <section key={group.id} class={`wl-group${group.rows.length === 0 ? " empty" : ""}`} data-flip={`work:${group.id}`}>
                <h3>
                  <span>{group.title}</span>
                  <span class="wl-count">{group.rows.length === 0 ? "—" : group.rows.length}</span>
                </h3>
                {group.rows.length === 0 ? (
                  <p class="wl-hole">— нищо в GitHub този работен ден</p>
                ) : (
                  group.rows.map((row) => <Row key={row.key} row={row} by={by} group={group.id} hue={repoHue(hues, row.pr.repo)} />)
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
