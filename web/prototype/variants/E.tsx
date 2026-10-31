// PROTOTYPE: concept E, time as the primary axis. A Gantt of open PRs per repo, activity as markers on each bar.
import { useState } from "preact/hooks";
import type { ClosedPullRequest, DashboardPullRequest, Section } from "../../src/api.js";
import { statusBadges } from "../../src/badges.js";
import { age, sectionTitle, statusText } from "../../src/format.js";
import { groupByRepo } from "../../src/group.js";
import { pushedAt } from "../../../src/domain/types.js";
import type { VariantProps } from "../types.js";

export const name = "Времева линия";

const DAY = 86_400_000;
const SECTION_ORDER: Section[] = ["waiting_on_me", "free_for_review", "ready_to_merge", "waiting_on_others", "team"];

type Range = "7" | "30" | "all";
const RANGES: [Range, string][] = [
  ["7", "7 дни"],
  ["30", "30 дни"],
  ["all", "всичко"],
];

type Kind = "commit" | "comment" | "approved" | "changes" | "reviewed";
type Mark = { t: number; kind: Kind; unread: boolean; title: string; who: string; body?: string };
type Row = { pr: DashboardPullRequest; section: Section; marks: Mark[]; last: number; created: number };
type Tip = { x: number; y: number; head: string; sub: string; body?: string };

const lower = (s: string) => s.toLowerCase();

/** Every commit, comment and review as a point in time; the newest ones the classifier counts as unread are flagged. */
function marksOf(pr: DashboardPullRequest, viewer: string | null): Mark[] {
  const fromOthers = pr.comments.filter((c) => !viewer || lower(c.author) !== lower(viewer));
  const unreadCount = pr.unreadComments ?? 0;
  const replies = pr.reReview?.replies ?? 0;
  const unreadIds = new Set(fromOthers.slice(fromOthers.length - Math.max(unreadCount, replies)).map((c) => c.id));
  const newCommits = pr.reReview?.newCommits ?? 0;
  const commits = pr.commits.map((c, i) => ({
    t: Date.parse(pushedAt(c)),
    kind: "commit" as const,
    unread: i >= pr.commits.length - newCommits,
    title: "commit",
    who: c.oid.slice(0, 7),
  }));
  const comments = pr.comments.map((c) => ({
    t: Date.parse(c.createdAt),
    kind: "comment" as const,
    unread: unreadIds.has(c.id) && (unreadCount > 0 || replies > 0),
    title: c.thread ? "коментар в review" : "коментар",
    who: c.author,
    body: c.body.replace(/\s+/g, " ").trim().slice(0, 80) + (c.body.length > 80 ? "…" : ""),
  }));
  const reviews = pr.reviews.flatMap((r): Mark[] => {
    if (r.state === "DISMISSED") return [];
    const kind: Kind = r.state === "APPROVED" ? "approved" : r.state === "CHANGES_REQUESTED" ? "changes" : "reviewed";
    const title = { approved: "review: approved", changes: "review: changes requested", reviewed: "review: коментари" }[kind as "approved"];
    return [{ t: Date.parse(r.submittedAt), kind, unread: false, title, who: r.author }];
  });
  return [...commits, ...comments, ...reviews].sort((a, b) => a.t - b.t);
}

function rowOf(pr: DashboardPullRequest, section: Section, viewer: string | null): Row {
  const marks = marksOf(pr, viewer);
  const created = Date.parse(pr.createdAt);
  const last = Math.max(created, ...marks.map((m) => m.t));
  return { pr, section, marks, last, created };
}

const fmt = (t: number, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("bg-BG", opts).format(new Date(t));
const when = (t: number) => fmt(t, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const spanText = (ms: number) => (ms < DAY ? `${Math.max(1, Math.floor(ms / 3_600_000))}ч` : ms < 365 * DAY ? `${Math.floor(ms / DAY)}д` : `${(ms / 365 / DAY).toFixed(1)}г`);

type Tick = { t: number; label: string; major: boolean };

/** Day ticks for short ranges, weeks for a couple of months, months beyond that. */
function ticks(start: number, end: number): Tick[] {
  const days = (end - start) / DAY;
  const out: Tick[] = [];
  if (days <= 62) {
    const step = days <= 10 ? 1 : days <= 20 ? 2 : 7;
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    for (; d.getTime() < end; d.setDate(d.getDate() + 1)) {
      const major = step === 7 ? d.getDay() === 1 : Math.round(d.getTime() / DAY) % step === 0;
      const label = days <= 10 ? fmt(d.getTime(), { weekday: "short", day: "numeric", month: "numeric" }) : fmt(d.getTime(), { day: "numeric", month: "numeric" });
      out.push({ t: d.getTime(), label: major ? label : "", major });
    }
    return out;
  }
  const months = days / 30;
  const step = months <= 8 ? 1 : months <= 18 ? 2 : months <= 36 ? 3 : 6;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (; d.getTime() < end; d.setMonth(d.getMonth() + 1)) {
    const major = d.getMonth() % step === 0;
    const label = d.getMonth() === 0 ? String(d.getFullYear()) : fmt(d.getTime(), { month: "short" });
    out.push({ t: d.getTime(), label: major ? label : "", major });
  }
  return out;
}

export function View({ state, onSeen }: VariantProps) {
  const [range, setRange] = useState<Range>("7");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<Tip | null>(null);

  const now = state.fetchedAt ? Date.parse(state.fetchedAt) : Date.now();
  const lanes = groupByRepo(state.sections).map((card) => ({
    repo: card.repo,
    rows: card.sections
      .flatMap((group) => group.pullRequests.map((pr) => rowOf(pr, group.section, state.viewer)))
      .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.last - b.last),
  }));
  const all = lanes.flatMap((lane) => lane.rows);
  const oldest = Math.min(now - DAY, ...all.map((r) => r.created));
  const start = range === "all" ? oldest : now - Number(range) * DAY;
  // A little room after "now" so markers on the today line stay whole.
  const end = now + (now - start) * 0.025;
  const x = (t: number) => ((t - start) / (end - start)) * 100;
  const pos = (t: number) => `${Math.min(100, Math.max(0, x(t)))}%`;

  const show = (event: MouseEvent, head: string, sub: string, body?: string) =>
    setTip({ x: event.clientX, y: event.clientY, head, sub, ...(body ? { body } : {}) });
  const hide = () => setTip(null);
  const toggle = (repo: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      next.has(repo) ? next.delete(repo) : next.add(repo);
      return next;
    });

  const counts = SECTION_ORDER.map((s) => [s, all.filter((r) => r.section === s).length] as const);
  const unreadTotal = all.filter((r) => r.marks.some((m) => m.unread)).length;

  return (
    <div class="vE" onMouseLeave={hide}>
      <style>{CSS}</style>
      <header class="top">
        <div class="brand">
          <h1>WorkDash</h1>
          <span class="status">{statusText(state)}</span>
        </div>
        <div class="controls">
          <div class="legend">
            {counts.map(([s, n]) => (
              <span key={s} class={`lg sec-${s}`}>
                <i />
                {sectionTitle(s)} <b>{n}</b>
              </span>
            ))}
          </div>
          <div class="seg" role="group" aria-label="Период">
            {RANGES.map(([key, label]) => (
              <button key={key} class={range === key ? "on" : ""} onClick={() => setRange(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div class="keys">
          <span><i class="m commit" /> commit</span>
          <span><i class="m comment" /> коментар</span>
          <span><i class="m approved" /> approve</span>
          <span><i class="m changes" /> changes</span>
          <span><i class="m reviewed" /> review</span>
          <span><i class="m comment unread" /> ново</span>
          <span><i class="quietkey" /> тишина след последната активност</span>
          {unreadTotal ? <span class="unreadsum">{unreadTotal} PR с нова активност</span> : null}
        </div>
      </header>

      <div class="chart">
        <div class="grid" aria-hidden="true">
          {ticks(start, end).map((tick) => (
            <div key={tick.t} class={tick.major ? "gl major" : "gl"} style={{ left: pos(tick.t) }} />
          ))}
          <div class="today" style={{ left: pos(now) }} />
        </div>

        <div class="row axis">
          <div class="meta axis-meta">PR</div>
          <div class="track">
            {ticks(start, end)
              .filter((tick) => tick.label)
              .map((tick) => (
                <span key={tick.t} class="tl" style={{ left: pos(tick.t) }}>
                  {tick.label}
                </span>
              ))}
            <span class="tl today-l" style={{ left: pos(now) }}>
              днес
            </span>
          </div>
          <div class="side">тишина</div>
        </div>

        {lanes.map((lane) => (
          <section key={lane.repo} class="lane">
            <button class="lane-h" onClick={() => toggle(lane.repo)} aria-expanded={!collapsed.has(lane.repo)}>
              <span class="chev">{collapsed.has(lane.repo) ? "▸" : "▾"}</span>
              <span class="repo">{lane.repo}</span>
              <span class="cnt">{lane.rows.length}</span>
              <span class="dots">
                {lane.rows.map((r) => (
                  <i key={r.pr.url} class={`sec-${r.section}`} />
                ))}
              </span>
            </button>
            {collapsed.has(lane.repo)
              ? null
              : lane.rows.map((row) => <PrRow key={row.pr.url} row={row} now={now} start={start} pos={pos} show={show} hide={hide} onSeen={onSeen} />)}
          </section>
        ))}

        {state.recentlyClosed.length ? (
          <section class="lane closed">
            <div class="lane-h static">
              <span class="repo">Наскоро затворени</span>
              <span class="cnt">{state.recentlyClosed.length}</span>
            </div>
            {state.recentlyClosed.map((pr) => (
              <ClosedRow key={pr.url} pr={pr} now={now} start={start} end={end} pos={pos} show={show} hide={hide} />
            ))}
          </section>
        ) : null}
      </div>

      {tip ? (
        <div class="tip" style={{ left: `${Math.min(tip.x + 14, innerWidth - 300)}px`, top: `${tip.y + 16}px` }}>
          <b>{tip.head}</b>
          <span>{tip.sub}</span>
          {tip.body ? <q>{tip.body}</q> : null}
        </div>
      ) : null}
    </div>
  );
}

type RowProps = {
  row: Row;
  now: number;
  start: number;
  pos(t: number): string;
  show(event: MouseEvent, head: string, sub: string, body?: string): void;
  hide(): void;
  onSeen(pr: DashboardPullRequest): void;
};

function PrRow({ row, now, start, pos, show, hide, onSeen }: RowProps) {
  const { pr, section, marks, last, created } = row;
  const reason = pr.reason ? statusBadges(pr)[0] : undefined;
  const quiet = now - last;
  const before = marks.filter((m) => m.t < start).length;
  const visible = marks.filter((m) => m.t >= start);
  const hasUnread = marks.some((m) => m.unread);
  const stale = quiet > 3 * DAY ? "stale" : quiet > DAY ? "cool" : "fresh";
  return (
    <div class={`row pr sec-${section}${hasUnread ? " has-unread" : ""}`}>
      <div class="meta">
        <a class="num" href={pr.url} target="_blank" rel="noreferrer">
          #{pr.number}
        </a>
        <a class="title" href={pr.url} target="_blank" rel="noreferrer" title={`${pr.title} · ${pr.author}`}>
          {pr.isDraft ? <em class="draft">draft</em> : null}
          {pr.title}
        </a>
        {reason ? (
          <span class="chip" title={reason.title}>
            {reason.text}
          </span>
        ) : null}
        {pr.jira.slice(0, 1).map((j) => (
          <a key={j.key} class="jira" href={j.url} target="_blank" rel="noreferrer" title={pr.jira.map((k) => k.key).join(", ")}>
            {j.key}
            {pr.jira.length > 1 ? ` +${pr.jira.length - 1}` : ""}
          </a>
        ))}
        {section === "waiting_on_me" ? (
          <button class="seen" onClick={() => onSeen(pr)} title="Махни от „Чака теб“ до следващата активност">
            видях
          </button>
        ) : null}
      </div>
      <div class="track">
        <div
          class={`bar${created < start ? " cut" : ""}`}
          style={{ left: pos(created), width: `calc(${pos(last)} - ${pos(created)})` }}
          onMouseMove={(e) => show(e, `#${pr.number} от ${pr.author}`, `отворен ${when(created)} · преди ${spanText(now - created)} · ${sectionTitle(section)}`)}
          onMouseLeave={hide}
        />
        <div
          class={`quiet ${stale}`}
          style={{ left: pos(last), width: `calc(${pos(now)} - ${pos(last)})` }}
          onMouseMove={(e) => show(e, `Тишина ${spanText(quiet)}`, `последна активност ${when(last)}`)}
          onMouseLeave={hide}
        />
        {created < start ? <span class="older">◂ {age(pr.createdAt, new Date(now))}</span> : null}
        {before ? <span class="before" style={{ left: "0%" }}>+{before}</span> : null}
        {visible.map((m, i) => (
          <i
            key={i}
            class={`m ${m.kind}${m.unread ? " unread" : now - m.t < DAY ? " recent" : ""}`}
            style={{ left: pos(m.t) }}
            onMouseMove={(e) => show(e, `${m.title} · ${m.who}`, `${when(m.t)} · преди ${spanText(now - m.t)}${m.unread ? " · ново" : ""}`, m.body)}
            onMouseLeave={hide}
          />
        ))}
      </div>
      <div class={`side q-${stale}`}>{spanText(quiet)}</div>
    </div>
  );
}

type ClosedProps = Omit<RowProps, "row" | "onSeen"> & { pr: ClosedPullRequest; end: number };

function ClosedRow({ pr, now, start, end, pos, show, hide }: ClosedProps) {
  const closed = Date.parse(pr.closedAt);
  // The open time of a closed PR is unknown, so the bar fades in over a fixed share of the range.
  const tail = (end - start) * 0.12;
  const merged = pr.state === "MERGED";
  return (
    <div class="row pr closed-row">
      <div class="meta">
        <a class="num" href={pr.url} target="_blank" rel="noreferrer">
          #{pr.number}
        </a>
        <a class="title" href={pr.url} target="_blank" rel="noreferrer" title={`${pr.title} · ${pr.repo}`}>
          {pr.title}
        </a>
        <span class={`chip ${merged ? "merged" : "closedc"}`}>{merged ? "merged" : "closed"}</span>
      </div>
      <div class="track">
        {closed >= start ? (
          <>
            <div class={`ctail ${merged ? "merged" : "closedc"}`} style={{ left: pos(closed - tail), width: `calc(${pos(closed)} - ${pos(closed - tail)})` }} />
            <i
              class={`m end ${merged ? "merged" : "closedc"}`}
              style={{ left: pos(closed) }}
              onMouseMove={(e) => show(e, `${merged ? "Merged" : "Затворен"} · ${pr.author}`, `${when(closed)} · ${pr.repo}`)}
              onMouseLeave={hide}
            />
          </>
        ) : (
          <span class="older">◂ извън периода</span>
        )}
      </div>
      <div class="side">{spanText(now - closed)}</div>
    </div>
  );
}

const CSS = `
:root { color-scheme: light dark; }
body { margin: 0; font: 13px/1.4 "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f5f1; color: #1d1d1b; }
@media (prefers-color-scheme: dark) { body { background: #131416; color: #e7e6e1; } }

.vE {
  --bg: #f6f5f1; --panel: #ffffff; --ink: #1d1d1b; --muted: #77756e; --line: #e4e2db; --grid: #ecebe5; --grid-major: #d9d7cf;
  --today: #d63c2f; --link: #1b4fb8;
  --c-waiting_on_me: #e0533d; --c-free_for_review: #2f7de1; --c-ready_to_merge: #2d9a5a; --c-waiting_on_others: #d99a1c; --c-team: #8a7fb0;
  --approved: #2d9a5a; --changes: #d63c2f; --reviewed: #8a7fb0; --commit: #1d1d1b; --comment: #ffffff;
  --meta: 420px; --side: 64px;
  padding: 20px 24px 96px; max-width: 1600px; margin: 0 auto; color: var(--ink);
}
@media (prefers-color-scheme: dark) {
  .vE {
    --bg: #131416; --panel: #1b1c1f; --ink: #e7e6e1; --muted: #8e8c85; --line: #2a2b2f; --grid: #222327; --grid-major: #33343a;
    --today: #ff6a5c; --link: #8fb3ff;
    --c-waiting_on_me: #ff6a54; --c-free_for_review: #5b9cf0; --c-ready_to_merge: #4cc07c; --c-waiting_on_others: #f0b53c; --c-team: #a99ed4;
    --approved: #4cc07c; --changes: #ff6a5c; --reviewed: #a99ed4; --commit: #e7e6e1; --comment: #1b1c1f;
  }
}
@media (max-width: 900px) { .vE { --meta: 240px; --side: 48px; padding: 16px 12px 96px; } }

.vE .sec-waiting_on_me { --c: var(--c-waiting_on_me); }
.vE .sec-free_for_review { --c: var(--c-free_for_review); }
.vE .sec-ready_to_merge { --c: var(--c-ready_to_merge); }
.vE .sec-waiting_on_others { --c: var(--c-waiting_on_others); }
.vE .sec-team { --c: var(--c-team); }

.vE a { color: inherit; text-decoration: none; }
.vE a:hover { text-decoration: underline; }
.vE button { font: inherit; color: inherit; }

.vE .top { display: grid; gap: 10px; margin-bottom: 14px; }
.vE .brand { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.vE h1 { margin: 0; font-size: 20px; letter-spacing: -0.02em; }
.vE .status { color: var(--muted); font-size: 12px; }
.vE .controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.vE .legend { display: flex; gap: 14px; flex-wrap: wrap; }
.vE .lg { display: inline-flex; align-items: center; gap: 6px; }
.vE .lg i { width: 18px; height: 8px; border-radius: 3px; background: var(--c); }
.vE .lg b { font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 600; }
.vE .seg { display: inline-flex; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 2px; }
.vE .seg button { border: 0; background: none; padding: 5px 12px; border-radius: 6px; cursor: pointer; color: var(--muted); }
.vE .seg button.on { background: var(--ink); color: var(--bg); }
.vE .keys { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 12px; align-items: center; }
.vE .keys span { display: inline-flex; align-items: center; gap: 6px; }
.vE .keys .m { position: static; transform: none; }
.vE .keys .m.diamond { transform: rotate(45deg); }
.vE .keys .m.commit { transform: rotate(45deg); }
.vE .quietkey { display: inline-block; width: 22px; height: 8px; border-radius: 2px; background: repeating-linear-gradient(135deg, var(--grid-major) 0 3px, transparent 3px 6px); border: 1px solid var(--grid-major); }
.vE .unreadsum { color: var(--today); font-weight: 600; }

.vE .chart { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.vE .grid { position: absolute; top: 0; bottom: 0; left: var(--meta); right: var(--side); pointer-events: none; z-index: 0; }
.vE .gl { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--grid); }
.vE .gl.major { background: var(--grid-major); }
.vE .today { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--today); opacity: .8; }

.vE .row { position: relative; z-index: 1; display: grid; grid-template-columns: var(--meta) 1fr var(--side); align-items: center; min-height: 34px; }
.vE .row.pr { border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
.vE .row.pr:hover { background: color-mix(in srgb, var(--c, var(--muted)) 6%, transparent); }
.vE .row.axis { position: sticky; top: 0; z-index: 3; height: 30px; background: color-mix(in srgb, var(--panel) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); font-size: 11px; color: var(--muted); }
.vE .axis-meta { padding-left: 14px; text-transform: uppercase; letter-spacing: .06em; }
.vE .tl { position: absolute; top: 50%; transform: translate(4px, -50%); white-space: nowrap; }
.vE .tl.today-l { transform: translate(-50%, -50%); background: var(--today); color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
.vE .side { text-align: right; padding-right: 12px; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted); }
.vE .axis .side { text-transform: uppercase; letter-spacing: .06em; font-size: 10px; }
.vE .side.q-stale { color: var(--today); font-weight: 600; }
.vE .side.q-fresh { color: var(--approved); }

.vE .meta { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 4px 10px 4px 14px; height: 100%; box-sizing: border-box; background: var(--panel); border-right: 1px solid var(--line); }
.vE .row.pr .meta { box-shadow: inset 3px 0 0 var(--c, transparent); }
.vE .num { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; flex: none; }
.vE .title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.vE .title:hover { color: var(--link); }
.vE .draft { font-style: normal; font-size: 10px; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 0 3px; margin-right: 5px; }
.vE .chip { flex: none; font-size: 11px; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); font-weight: 600; white-space: nowrap; }
.vE .chip.merged { --c: #8250df; }
.vE .chip.closedc { --c: var(--muted); }
.vE .jira { flex: none; font-size: 11px; color: var(--link); white-space: nowrap; }
.vE .seen { flex: none; border: 1px solid var(--line); background: none; border-radius: 6px; font-size: 11px; padding: 1px 7px; cursor: pointer; color: var(--muted); }
.vE .seen:hover { border-color: var(--c); color: var(--c); }

.vE .track { position: relative; height: 34px; }
.vE .bar { position: absolute; top: 11px; height: 12px; min-width: 3px; border-radius: 6px; background: color-mix(in srgb, var(--c) 30%, transparent); border: 1px solid color-mix(in srgb, var(--c) 70%, transparent); box-sizing: border-box; }
.vE .bar.cut { border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 2px dashed var(--c); }
.vE .quiet { position: absolute; top: 14px; height: 6px; border-radius: 0 3px 3px 0; box-sizing: border-box;
  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--c) 35%, transparent) 0 3px, transparent 3px 6px); }
.vE .quiet.stale { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--today) 45%, transparent) 0 3px, transparent 3px 6px); }
.vE .older { position: absolute; left: 4px; top: 24px; font-size: 10px; color: var(--muted); pointer-events: none; }
.vE .before { position: absolute; top: 1px; font-size: 10px; color: var(--muted); padding-left: 4px; pointer-events: none; }

.vE .m { position: absolute; display: inline-block; width: 8px; height: 8px; box-sizing: border-box; transform: translate(-50%, -50%); cursor: default; z-index: 2; }
.vE .m.commit { top: 12px; background: var(--commit); transform: translate(-50%, -50%) rotate(45deg); width: 7px; height: 7px; }
.vE .m.comment { top: 23px; border-radius: 50%; background: var(--comment); border: 1.5px solid var(--ink); }
.vE .m.approved, .vE .m.changes, .vE .m.reviewed { top: 17px; width: 11px; height: 11px; border-radius: 3px; border: 2px solid var(--panel); }
.vE .m.approved { background: var(--approved); }
.vE .m.changes { background: var(--changes); }
.vE .m.reviewed { background: var(--reviewed); }
.vE .m:hover { z-index: 5; outline: 2px solid var(--link); outline-offset: 1px; }
.vE .m.recent { box-shadow: 0 0 0 2px color-mix(in srgb, var(--c, var(--link)) 45%, transparent); }
.vE .m.unread { background: var(--today); border-color: var(--today); animation: vE-pulse 1.6s ease-out infinite; }
@keyframes vE-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--today) 70%, transparent); }
  100% { box-shadow: 0 0 0 9px transparent; }
}
@media (prefers-reduced-motion: reduce) { .vE .m.unread { animation: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--today) 40%, transparent); } }
.vE .keys .m.comment.unread { animation: none; }
.vE .row.has-unread .num { color: var(--today); font-weight: 700; }

.vE .lane { position: relative; z-index: 1; }
.vE .lane-h { all: unset; position: relative; z-index: 2; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 14px 7px; cursor: pointer;
  background: color-mix(in srgb, var(--bg) 85%, var(--panel)); border-top: 1px solid var(--line); font-weight: 650; }
.vE .lane-h.static { cursor: default; }
.vE .lane:first-of-type .lane-h { border-top: 0; }
.vE .chev { width: 10px; color: var(--muted); font-size: 11px; }
.vE .repo { font-size: 13px; letter-spacing: -0.01em; }
.vE .cnt { font-size: 11px; color: var(--muted); background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 0 7px; font-variant-numeric: tabular-nums; }
.vE .dots { display: inline-flex; gap: 3px; margin-left: 4px; }
.vE .dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }

.vE .lane.closed { opacity: .62; }
.vE .lane.closed:hover { opacity: 1; }
.vE .ctail { position: absolute; top: 14px; height: 6px; border-radius: 3px; }
.vE .ctail.merged { background: linear-gradient(90deg, transparent, #8250df); }
.vE .ctail.closedc { background: linear-gradient(90deg, transparent, var(--muted)); }
.vE .m.end { top: 17px; width: 10px; height: 10px; border-radius: 2px; }
.vE .m.end.merged { background: #8250df; }
.vE .m.end.closedc { background: var(--muted); }

.vE .tip { position: fixed; z-index: 100; max-width: 280px; display: grid; gap: 2px; padding: 8px 10px; border-radius: 8px; pointer-events: none;
  background: var(--ink); color: var(--bg); font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
.vE .tip span { opacity: .75; }
.vE .tip q { margin-top: 4px; font-style: italic; opacity: .9; }
`;
