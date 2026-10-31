// PROTOTYPE: concept C, one dense sortable/filterable table of every PR. Not shipped.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { CiState, MergeStateStatus } from "../../../src/domain/types.js";
import type { DashboardPullRequest, Section } from "../../src/api.js";
import { age, sectionTitle, statusText } from "../../src/format.js";
import type { VariantProps } from "../types.js";

export const name = "Таблица";

const SECTION_ORDER: Section[] = ["waiting_on_me", "free_for_review", "ready_to_merge", "waiting_on_others", "team"];

type Row = DashboardPullRequest & { section: Section };
type Dir = 1 | -1;
type GroupBy = "none" | "section" | "repo" | "author";
type Tone = "ok" | "bad" | "pending" | "muted";

const REASONS: Record<string, [string, Tone]> = {
  ci_failed: ["CI failed", "bad"],
  sonar_failed: ["Sonar failed", "bad"],
  changes_requested: ["changes requested", "bad"],
  conflict: ["конфликт", "bad"],
  unread_comments: ["нови коментари", "bad"],
  needs_rebase: ["needs rebase", "pending"],
  review_requested: ["review requested", "bad"],
  mention: ["mention", "bad"],
  re_review: ["re-review", "bad"],
};

const CHECK: Record<CiState, [string, Tone, number]> = {
  FAILURE: ["✗", "bad", 0],
  ERROR: ["✗", "bad", 0],
  PENDING: ["…", "pending", 1],
  EXPECTED: ["…", "pending", 1],
  SUCCESS: ["✓", "ok", 2],
};

const MERGE: Partial<Record<MergeStateStatus, [string, Tone, number]>> = {
  DIRTY: ["конфликт", "bad", 0],
  BEHIND: ["rebase", "pending", 1],
  BLOCKED: ["blocked", "muted", 2],
  DRAFT: ["draft", "muted", 3],
  UNKNOWN: ["?", "muted", 4],
  UNSTABLE: ["mergeable", "ok", 5],
  HAS_HOOKS: ["mergeable", "ok", 5],
  CLEAN: ["mergeable", "ok", 6],
};

const shortRepo = (repo: string) => repo.slice(repo.indexOf("/") + 1);
const mergeState = (pr: Row): MergeStateStatus => (pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.isDraft ? "DRAFT" : pr.mergeStateStatus);
const checkRank = (state: CiState | null) => (state ? CHECK[state][2] : 3);
const reviewRank = (pr: Row) =>
  pr.reviews.reduce((n, r) => n + (r.state === "APPROVED" ? 10 : r.state === "CHANGES_REQUESTED" ? -10 : 1), 0);

type Column = {
  key: string;
  label: string;
  title?: string;
  cls?: string;
  /** Sort value; strings compare with localeCompare. */
  value?: (pr: Row) => string | number;
  /** Direction on first click: newest/biggest first for numbers and dates. */
  first?: Dir;
};

const COLUMNS: Column[] = [
  { key: "section", label: "", title: "Секция", cls: "c-sec", value: (pr) => SECTION_ORDER.indexOf(pr.section), first: 1 },
  { key: "repo", label: "repo", value: (pr) => shortRepo(pr.repo) },
  { key: "number", label: "#", cls: "num", value: (pr) => pr.number, first: -1 },
  { key: "title", label: "заглавие", cls: "c-title", value: (pr) => pr.title.toLowerCase() },
  { key: "author", label: "автор", value: (pr) => pr.author.toLowerCase() },
  { key: "reason", label: "защо", title: "Защо чака теб", value: (pr) => (pr.reason ? Object.keys(REASONS).indexOf(pr.reason) : 99), first: 1 },
  { key: "ci", label: "CI", cls: "ctr", value: (pr) => checkRank(pr.ci), first: 1 },
  { key: "sonar", label: "Sonar", cls: "ctr", value: (pr) => checkRank(pr.sonar), first: 1 },
  { key: "merge", label: "merge", value: (pr) => MERGE[mergeState(pr)]?.[2] ?? 9, first: 1 },
  { key: "reviews", label: "review-та", value: reviewRank, first: -1 },
  { key: "unread", label: "💬", title: "Непрочетени коментари", cls: "num", value: (pr) => pr.unreadComments ?? 0, first: -1 },
  { key: "jira", label: "Jira", value: (pr) => pr.jira[0]?.key ?? "~" },
  { key: "age", label: "възраст", title: "Отворен преди", cls: "num", value: (pr) => -new Date(pr.createdAt).getTime(), first: -1 },
  { key: "updated", label: "активност", title: "Последна активност (updatedAt)", cls: "num", value: (pr) => new Date(pr.updatedAt).getTime(), first: -1 },
  { key: "action", label: "" },
];

const GROUPS: [GroupBy, string][] = [
  ["none", "нищо"],
  ["section", "секция"],
  ["repo", "repo"],
  ["author", "автор"],
];

function compare(a: string | number, b: string | number): number {
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
}

function groupKey(pr: Row, by: GroupBy): string {
  if (by === "section") return pr.section;
  if (by === "repo") return pr.repo;
  return pr.author;
}

function groupLabel(key: string, by: GroupBy): string {
  if (by === "section") return sectionTitle(key as Section);
  if (by === "repo") return key;
  return key;
}

/** One table, sorted, filtered and optionally split into group header rows. */
export function View({ state, onSeen }: VariantProps) {
  const now = useMemo(() => (state.fetchedAt ? new Date(state.fetchedAt) : new Date()), [state.fetchedAt]);
  const [sort, setSort] = useState<{ key: string; dir: Dir }>({ key: "section", dir: 1 });
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLInputElement>(null);

  // "/" focuses the filter, Esc clears it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = document.activeElement === filterRef.current;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        filterRef.current?.focus();
      } else if (event.key === "Escape" && typing) {
        setQuery("");
        filterRef.current?.blur();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const all: Row[] = useMemo(
    () => state.sections.flatMap((group) => group.pullRequests.map((pr) => ({ ...pr, section: group.section }))),
    [state.sections],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? all.filter((pr) =>
          [pr.title, pr.author, pr.repo, pr.headRefName, String(pr.number), ...pr.jira.map((j) => j.key)].some((text) =>
            text.toLowerCase().includes(needle),
          ),
        )
      : all;
    const column = COLUMNS.find((c) => c.key === sort.key)!;
    const byUpdated = (a: Row, b: Row) => b.updatedAt.localeCompare(a.updatedAt);
    return [...matching].sort((a, b) => sort.dir * compare(column.value!(a), column.value!(b)) || byUpdated(a, b));
  }, [all, query, sort]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "", rows }];
    const map = new Map<string, Row[]>();
    for (const pr of rows) {
      const key = groupKey(pr, groupBy);
      map.set(key, [...(map.get(key) ?? []), pr]);
    }
    const keys = [...map.keys()].sort((a, b) =>
      groupBy === "section" ? SECTION_ORDER.indexOf(a as Section) - SECTION_ORDER.indexOf(b as Section) : a.localeCompare(b),
    );
    return keys.map((key) => ({ key, rows: map.get(key)! }));
  }, [rows, groupBy]);

  const clickHeader = (column: Column) => {
    if (!column.value) return;
    setSort((old) => (old.key === column.key ? { key: old.key, dir: (-old.dir as Dir) } : { key: column.key, dir: column.first ?? 1 }));
  };

  const toggleGroup = (key: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const counts = SECTION_ORDER.map((section) => [section, all.filter((pr) => pr.section === section).length] as const);

  return (
    <div class="vC">
      <style>{CSS}</style>
      <header class="top">
        <h1>WorkDash</h1>
        <span class="status">{statusText(state)}</span>
        <span class="legend">
          {counts.map(([section, n]) => (
            <span key={section} class={`lg s-${section}`} title={sectionTitle(section)}>
              <i />
              {sectionTitle(section)} <b>{n}</b>
            </span>
          ))}
        </span>
      </header>

      <div class="bar">
        <label class="filter">
          <input
            ref={filterRef}
            type="search"
            placeholder="Филтър: заглавие, автор, repo, branch…"
            value={query}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
          />
          <kbd>/</kbd>
        </label>
        <span class="shown">
          {rows.length === all.length ? `${all.length} PR-а` : `${rows.length} от ${all.length}`}
        </span>
        <span class="seg-label">Групирай по:</span>
        <div class="seg" role="radiogroup">
          {GROUPS.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={groupBy === key} class={groupBy === key ? "on" : ""} onClick={() => setGroupBy(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div class="wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    class={`${column.cls ?? ""} ${column.value ? "sortable" : ""} ${active ? "active" : ""}`}
                    title={column.title}
                    onClick={() => clickHeader(column)}
                    aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    {column.label}
                    {column.value ? <span class="arrow">{active ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td class="empty" colSpan={COLUMNS.length}>
                  Нищо не съвпада с „{query}“
                </td>
              </tr>
            ) : null}
            {groups.map((group) => {
              const shut = collapsed.has(group.key);
              return [
                groupBy === "none" ? null : (
                  <tr key={`g-${group.key}`} class={`group ${groupBy === "section" ? `s-${group.key}` : ""}`} onClick={() => toggleGroup(group.key)}>
                    <td colSpan={COLUMNS.length}>
                      <span class="caret">{shut ? "▸" : "▾"}</span>
                      {groupBy === "section" ? <i class="dot" /> : null}
                      {groupLabel(group.key, groupBy)}
                      <span class="count">{group.rows.length}</span>
                    </td>
                  </tr>
                ),
                ...(shut ? [] : group.rows.map((pr) => <PrRow key={`${pr.repo}#${pr.number}`} pr={pr} now={now} onSeen={onSeen} />)),
              ];
            })}
          </tbody>
        </table>
      </div>

      {state.recentlyClosed.length ? (
        <details class="closed">
          <summary>
            Наскоро затворени <span class="count">{state.recentlyClosed.length}</span>
          </summary>
          <table>
            <tbody>
              {state.recentlyClosed.map((pr) => (
                <tr key={`${pr.repo}#${pr.number}`}>
                  <td class={`st ${pr.state === "MERGED" ? "merged" : "bad"}`}>{pr.state === "MERGED" ? "merged" : "closed"}</td>
                  <td class="repo">{shortRepo(pr.repo)}</td>
                  <td class="num">
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      {pr.number}
                    </a>
                  </td>
                  <td class="c-title">
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      {pr.title}
                    </a>
                  </td>
                  <td>{pr.author}</td>
                  <td class="num" title={new Date(pr.closedAt).toLocaleString()}>
                    {age(pr.closedAt, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

function Check({ state, label }: { state: CiState | null; label: string }) {
  if (!state) return <span class="t-muted" title={`Няма ${label}`}>–</span>;
  const [mark, tone] = CHECK[state];
  return (
    <span class={`chk t-${tone}`} title={`${label}: ${state}`}>
      {mark}
    </span>
  );
}

function PrRow({ pr, now, onSeen }: { pr: Row; now: Date; onSeen(pr: DashboardPullRequest): void }) {
  const reason = pr.reason ? REASONS[pr.reason] : undefined;
  const merge = MERGE[mergeState(pr)];
  const unread = pr.unreadComments ?? 0;
  const reviewed = new Set(pr.reviews.map((r) => r.author.toLowerCase()));
  const pending = pr.requestedReviewers.filter((login) => !reviewed.has(login.toLowerCase()));
  const reReview = pr.reReview ? ` (${pr.reReview.newCommits} commit-а, ${pr.reReview.replies} отговора)` : "";
  return (
    <tr class={`s-${pr.section}`}>
      <td class="c-sec" title={sectionTitle(pr.section)}>
        <i class="dot" />
      </td>
      <td class="repo" title={pr.repo}>
        {shortRepo(pr.repo)}
      </td>
      <td class="num">
        <a href={pr.url} target="_blank" rel="noreferrer">
          {pr.number}
        </a>
      </td>
      <td class="c-title">
        <a href={pr.url} target="_blank" rel="noreferrer" title={`${pr.title}\n${pr.headRefName}`}>
          {pr.isDraft ? <span class="draft">draft</span> : null}
          {pr.title}
        </a>
      </td>
      <td class="author">{pr.author}</td>
      <td>{reason ? <span class={`pill t-${reason[1]}`} title={reReview || undefined}>{reason[0]}</span> : <span class="t-faint">·</span>}</td>
      <td class="ctr">
        <Check state={pr.ci} label="CI" />
      </td>
      <td class="ctr">
        <Check state={pr.sonar} label="Sonar" />
      </td>
      <td>{merge ? <span class={`t-${merge[1]}`}>{merge[0]}</span> : <span class="t-faint">{pr.mergeStateStatus}</span>}</td>
      <td class="revs">
        {pr.reviews.map((r) =>
          r.state === "DISMISSED" ? null : (
            <span
              key={r.author}
              class={`rv t-${r.state === "APPROVED" ? "ok" : r.state === "CHANGES_REQUESTED" ? "bad" : "muted"}`}
              title={`${r.author}: ${r.state}`}
            >
              {r.state === "APPROVED" ? "✓" : r.state === "CHANGES_REQUESTED" ? "✗" : "●"}
            </span>
          ),
        )}
        {pending.map((login) => (
          <span key={login} class="rv t-faint" title={`${login}: чака review`}>
            ○
          </span>
        ))}
        {pr.reviews.length + pending.length === 0 ? <span class="t-faint">·</span> : null}
      </td>
      <td class="num">{unread ? <span class="unread">{unread}</span> : <span class="t-faint">·</span>}</td>
      <td class="jira">
        {pr.jira.map((j) => (
          <a key={j.key} href={j.url} target="_blank" rel="noreferrer">
            {j.key}
          </a>
        ))}
      </td>
      <td class="num" title={new Date(pr.createdAt).toLocaleString()}>
        {age(pr.createdAt, now)}
      </td>
      <td class="num" title={new Date(pr.updatedAt).toLocaleString()}>
        {age(pr.updatedAt, now)}
      </td>
      <td class="act">
        {pr.section === "waiting_on_me" ? (
          <button type="button" onClick={() => onSeen(pr)} title="Маркирай като видян">
            видях
          </button>
        ) : null}
      </td>
    </tr>
  );
}

const CSS = `
body { margin: 0; background: #f6f7f9; color: #1d2330; font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; }
@media (prefers-color-scheme: dark) { body { background: #0f1218; color: #d8dde7; } }

.vC {
  --bg: #f6f7f9; --panel: #fff; --zebra: #f9fafb; --hover: #eef3ff; --line: #e3e6eb; --head: #f1f3f6;
  --fg: #1d2330; --muted: #6b7380; --faint: #b7bdc7; --link: #1f5fd1; --accent: #2f6fe4;
  --ok: #1a8a45; --bad: #cf2e2e; --pending: #b7790b; --merged: #7d4cdb;
  --s-waiting_on_me: #e0443a; --s-free_for_review: #2f6fe4; --s-ready_to_merge: #1a8a45; --s-waiting_on_others: #c99a14; --s-team: #9aa2ae;
  padding: 14px 16px 80px; color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .vC {
    --bg: #0f1218; --panel: #161a22; --zebra: #1a1f28; --hover: #212b3d; --line: #262c37; --head: #1c212b;
    --fg: #d8dde7; --muted: #8a93a3; --faint: #4a5160; --link: #7fa8ff; --accent: #5b8cff;
    --ok: #4cc27a; --bad: #ff6b63; --pending: #e3b341; --merged: #b18cff;
    --s-waiting_on_me: #ff6b63; --s-free_for_review: #5b8cff; --s-ready_to_merge: #4cc27a; --s-waiting_on_others: #e3b341; --s-team: #6b7380;
  }
}
.vC .s-waiting_on_me { --sec: var(--s-waiting_on_me); }
.vC .s-free_for_review { --sec: var(--s-free_for_review); }
.vC .s-ready_to_merge { --sec: var(--s-ready_to_merge); }
.vC .s-waiting_on_others { --sec: var(--s-waiting_on_others); }
.vC .s-team { --sec: var(--s-team); }

.vC .top { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }
.vC h1 { font-size: 16px; margin: 0; letter-spacing: .2px; }
.vC .status { color: var(--muted); font-size: 12px; }
.vC .legend { margin-left: auto; display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
.vC .lg { display: inline-flex; align-items: center; gap: 5px; }
.vC .lg i, .vC .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--sec); }
.vC .lg b { color: var(--fg); font-variant-numeric: tabular-nums; font-weight: 600; }

.vC .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.vC .filter { position: relative; display: flex; align-items: center; flex: 0 1 380px; }
.vC .filter input {
  width: 100%; box-sizing: border-box; padding: 6px 28px 6px 9px; font: inherit; color: var(--fg);
  background: var(--panel); border: 1px solid var(--line); border-radius: 6px; outline: none;
}
.vC .filter input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
.vC kbd { position: absolute; right: 7px; font: 11px ui-monospace, monospace; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 0 4px; }
.vC .shown { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.vC .seg-label { margin-left: auto; color: var(--muted); font-size: 12px; }
.vC .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--panel); }
.vC .seg button { font: inherit; font-size: 12px; padding: 5px 11px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
.vC .seg button + button { border-left: 1px solid var(--line); }
.vC .seg button.on { background: var(--accent); color: #fff; }
.vC .seg button:not(.on):hover { background: var(--hover); color: var(--fg); }

.vC .wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: auto; max-height: calc(100vh - 150px); }
.vC table { width: 100%; border-collapse: separate; border-spacing: 0; }
.vC th, .vC td { padding: 4px 8px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--line); vertical-align: middle; }
.vC th {
  position: sticky; top: 0; z-index: 2; background: var(--head); color: var(--muted);
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; user-select: none;
}
.vC th.sortable { cursor: pointer; }
.vC th.sortable:hover, .vC th.active { color: var(--fg); }
.vC .arrow { margin-left: 4px; font-size: 9px; opacity: .35; }
.vC th.active .arrow { opacity: 1; color: var(--accent); }
.vC tbody tr:not(.group):nth-child(even) td { background: var(--zebra); }
.vC tbody tr:not(.group):hover td { background: var(--hover); }

.vC td.c-sec, .vC th.c-sec { width: 6px; padding: 0 4px 0 0; }
.vC td.c-sec { box-shadow: inset 3px 0 0 var(--sec); text-align: center; padding-left: 8px; }
.vC td.c-sec .dot { width: 7px; height: 7px; }
.vC .num, .vC .jira, .vC .revs, .vC .chk, .vC .count, .vC .shown { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 12px; }
.vC td.num, .vC th.num { text-align: right; }
.vC .ctr { text-align: center; }
.vC .repo { color: var(--muted); max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.vC .c-title { white-space: normal; min-width: 260px; width: 40%; }
.vC td.c-title a { color: var(--fg); display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.vC td.c-title a:hover { color: var(--link); }
.vC a { color: var(--link); text-decoration: none; }
.vC a:hover { text-decoration: underline; }
.vC .author { color: var(--muted); }
.vC .draft { font-size: 10px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 0 3px; margin-right: 6px; }

.vC .t-ok { color: var(--ok); } .vC .t-bad { color: var(--bad); } .vC .t-pending { color: var(--pending); }
.vC .t-muted { color: var(--muted); } .vC .t-faint { color: var(--faint); }
.vC .chk { font-weight: 700; }
.vC .pill { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: color-mix(in srgb, currentColor 12%, transparent); font-weight: 600; }
.vC .rv { display: inline-block; width: 13px; text-align: center; font-weight: 700; cursor: default; }
.vC .unread { display: inline-block; min-width: 18px; padding: 0 4px; box-sizing: border-box; text-align: center; border-radius: 9px; background: var(--pending); color: #fff; font-weight: 700; font-size: 11px; }
.vC .jira a + a { margin-left: 6px; }
.vC .act { width: 52px; text-align: right; }
.vC .act button {
  font: inherit; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;
  border: 1px solid var(--line); background: var(--panel); color: var(--muted); visibility: hidden;
}
.vC tr:hover .act button, .vC .act button:focus { visibility: visible; }
.vC .act button:hover { border-color: var(--accent); color: var(--accent); }

.vC tr.group td {
  position: sticky; top: 25px; z-index: 1; background: var(--bg); cursor: pointer; user-select: none;
  font-weight: 600; font-size: 12px; padding: 6px 8px; border-top: 1px solid var(--line);
  box-shadow: inset 3px 0 0 var(--sec, transparent);
}
.vC tr.group:hover td { color: var(--accent); }
.vC tr.group .caret { display: inline-block; width: 12px; color: var(--muted); }
.vC tr.group .dot { margin-right: 6px; }
.vC .count { margin-left: 7px; color: var(--muted); font-weight: 500; background: var(--head); border: 1px solid var(--line); border-radius: 9px; padding: 0 6px; font-size: 11px; }
.vC td.empty { text-align: center; color: var(--muted); padding: 24px; }

.vC .closed { margin-top: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.vC .closed summary { cursor: pointer; padding: 8px 12px; font-weight: 600; font-size: 12px; color: var(--muted); user-select: none; }
.vC .closed summary:hover { color: var(--fg); }
.vC .closed[open] summary { border-bottom: 1px solid var(--line); }
.vC .closed td { color: var(--muted); }
.vC .closed tr:last-child td { border-bottom: 0; }
.vC .closed .st { width: 60px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .3px; }
.vC .closed .st.merged { color: var(--merged); } .vC .closed .st.bad { color: var(--bad); }
.vC .closed td.c-title a { color: var(--muted); }
`;
