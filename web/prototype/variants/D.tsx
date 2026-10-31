// PROTOTYPE: "control room" wall display, readable from across the room. Deliberately dark-only:
// it lives on a second monitor or TV where a light page would glare.
import { useEffect, useState } from "preact/hooks";
import type { DashboardPullRequest } from "../../src/api.js";
import { age } from "../../src/format.js";
import { pushedAt } from "../../../src/domain/types.js";
import type { Reason } from "../../../src/domain/classify.js";
import type { VariantProps } from "../types.js";

export const name = "Контролна зала";

type Tone = "red" | "amber" | "green" | "blue" | "calm";

const REASONS: Record<Reason, [string, Tone]> = {
  ci_failed: ["CI червен", "red"],
  sonar_failed: ["Sonar червен", "red"],
  changes_requested: ["искат промени", "red"],
  conflict: ["конфликт", "red"],
  unread_comments: ["нови коментари", "amber"],
  needs_rebase: ["трябва rebase", "amber"],
  review_requested: ["иска се review", "blue"],
  mention: ["споменат си", "blue"],
  re_review: ["re-review", "blue"],
};

function reasonLabel(pr: DashboardPullRequest): [string, Tone] {
  if (!pr.reason) return ["—", "calm"];
  if (pr.reason === "unread_comments") return [`${pr.unreadComments ?? 0} нови коментара`, "amber"];
  return REASONS[pr.reason];
}

const failed = (s: string | null) => s === "FAILURE" || s === "ERROR";

/** red: failing checks or a conflict; amber: pending checks or behind base; green: nothing in the way. */
function health(pr: DashboardPullRequest): "red" | "amber" | "green" {
  if (failed(pr.ci) || failed(pr.sonar) || pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") return "red";
  if (pr.ci === "PENDING" || pr.ci === "EXPECTED" || pr.mergeStateStatus === "BEHIND" || pr.isDraft) return "amber";
  return "green";
}

const shortRepo = (repo: string) => repo.slice(repo.indexOf("/") + 1);

/** "преди 5 мин", "преди 3 ч", "преди 2 д". */
function ago(since: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(since).getTime()) / 60_000);
  if (minutes < 1) return "сега";
  if (minutes < 60) return `преди ${minutes} мин`;
  if (minutes < 1440) return `преди ${Math.floor(minutes / 60)} ч`;
  return `преди ${Math.floor(minutes / 1440)} д`;
}

type FeedItem = { key: string; at: string; pr: DashboardPullRequest; kind: "comment" | "commit"; who?: string; text: string };

export function View({ state, onSeen }: VariantProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const bySection = (section: string) => state.sections.find((s) => s.section === section)?.pullRequests ?? [];
  const mine = bySection("waiting_on_me");
  const all = state.sections.flatMap((s) => s.pullRequests);
  const redCi = all.filter((pr) => failed(pr.ci) || failed(pr.sonar)).length;
  const unread = all.reduce((sum, pr) => sum + (pr.unreadComments ?? 0), 0);
  const oldest = all.reduce<DashboardPullRequest | null>((o, pr) => (!o || pr.createdAt < o.createdAt ? pr : o), null);
  const oldestDays = oldest ? (now.getTime() - new Date(oldest.createdAt).getTime()) / 86_400_000 : 0;

  const kpis: { label: string; value: string; tone: Tone }[] = [
    { label: "Чака теб", value: String(mine.length), tone: mine.length ? "red" : "calm" },
    { label: "Свободни за review", value: String(bySection("free_for_review").length), tone: bySection("free_for_review").length ? "amber" : "calm" },
    { label: "Готови за merge", value: String(bySection("ready_to_merge").length), tone: bySection("ready_to_merge").length ? "green" : "calm" },
    { label: "Червен CI", value: String(redCi), tone: redCi ? "red" : "calm" },
    { label: "Непрочетени коментари", value: String(unread), tone: unread ? "amber" : "calm" },
    { label: "Най-стар PR", value: oldest ? age(oldest.createdAt, now) : "—", tone: oldestDays > 14 ? "red" : oldestDays > 7 ? "amber" : "calm" },
  ];

  const repos = [...new Set(all.map((pr) => pr.repo))].sort().map((repo) => {
    const prs = all.filter((pr) => pr.repo === repo);
    const count = (h: string) => prs.filter((pr) => health(pr) === h).length;
    return { repo, total: prs.length, red: count("red"), amber: count("amber"), green: count("green") };
  });

  const feed: FeedItem[] = all
    .flatMap((pr): FeedItem[] => [
      ...pr.comments.map((c) => ({ key: `c${c.id}`, at: c.createdAt, pr, kind: "comment" as const, who: c.author, text: c.body.replace(/\s+/g, " ").trim() })),
      ...pr.commits.map((c) => ({ key: `k${pr.repo}${c.oid}`, at: pushedAt(c), pr, kind: "commit" as const, text: c.oid.slice(0, 7) })),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  const merged = state.recentlyClosed.filter((pr) => pr.state === "MERGED");
  const stale = state.fetchedAt ? now.getTime() - new Date(state.fetchedAt).getTime() > 3 * state.pollIntervalMs : true;

  return (
    <div class="vD">
      <style>{CSS}</style>
      <header class="top">
        <div class="brand">WorkDash</div>
        <div class={`pulse ${state.error || stale ? "bad" : ""}`}>
          <span class="dot" />
          {state.error ? "poll-ът се провали" : state.fetchedAt ? `poll ${ago(state.fetchedAt, now)}` : "чака първия poll"}
        </div>
        <div class="clock">{now.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })}</div>
      </header>

      <section class="kpis">
        {kpis.map((k) => (
          <div key={k.label} class={`kpi t-${k.tone}`}>
            <div class="value">{k.value}</div>
            <div class="label">{k.label}</div>
          </div>
        ))}
      </section>

      <div class="main">
        <section class="waiting">
          <h2>Чака теб</h2>
          {mine.length === 0 ? (
            <div class="clear">Нищо не чака теб ✓</div>
          ) : (
            <ol>
              {mine.map((pr) => {
                const [text, tone] = reasonLabel(pr);
                return (
                  <li key={`${pr.repo}#${pr.number}`} class={`item b-${tone}`}>
                    <div class="body">
                      <div class={`reason t-${tone}`}>{text}</div>
                      <a class="title" href={pr.url} target="_blank" rel="noreferrer">
                        {pr.title}
                      </a>
                      <div class="meta">
                        <span class="repo">{shortRepo(pr.repo)}</span>
                        <a href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a>
                        {pr.jira.map((j) => (
                          <a key={j.key} class="jira" href={j.url} target="_blank" rel="noreferrer">{j.key}</a>
                        ))}
                      </div>
                    </div>
                    <div class="side">
                      <div class="age">{age(pr.updatedAt, now)}</div>
                      <button type="button" class="seen" onClick={() => onSeen(pr)}>видях</button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside class="radar">
          <section class="block">
            <h3>Здраве по repo</h3>
            {repos.map((r) => (
              <div key={r.repo} class="health">
                <div class="hrow">
                  <span class="name" title={r.repo}>{shortRepo(r.repo)}</span>
                  <span class="nums">
                    <b class="t-red">{r.red}</b> <b class="t-amber">{r.amber}</b> <b class="t-green">{r.green}</b>
                  </span>
                </div>
                <div class="bar">
                  {r.red ? <i class="s-red" style={{ flex: r.red }} /> : null}
                  {r.amber ? <i class="s-amber" style={{ flex: r.amber }} /> : null}
                  {r.green ? <i class="s-green" style={{ flex: r.green }} /> : null}
                </div>
              </div>
            ))}
          </section>

          <section class="block feed">
            <h3>Последно</h3>
            <ul>
              {feed.map((f) => (
                <li key={f.key}>
                  <span class={`ico ${f.kind}`}>{f.kind === "comment" ? "💬" : "⬆"}</span>
                  <div class="ftext">
                    <div class="fhead">
                      <a href={f.pr.url} target="_blank" rel="noreferrer">{shortRepo(f.pr.repo)}#{f.pr.number}</a>
                      <span class="who">{f.kind === "comment" ? f.who : "commit"}</span>
                      <span class="when">{ago(f.at, now)}</span>
                    </div>
                    <div class={`fbody ${f.kind}`}>{f.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {merged.length ? (
            <section class="block">
              <h3>Merge-нати 🎉</h3>
              <div class="chips">
                {merged.map((pr) => (
                  <a key={`${pr.repo}#${pr.number}`} class="chip" href={pr.url} target="_blank" rel="noreferrer" title={pr.title}>
                    {shortRepo(pr.repo)}#{pr.number} <span>{ago(pr.closedAt, now)}</span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

const CSS = `
body { margin: 0; background: #07090d; color: #e6edf3; font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; }
.vD {
  --bg: #07090d; --panel: #0f141b; --line: #1d2530; --text: #e6edf3; --dim: #7d8a99;
  --red: #ff5a5f; --amber: #ffb02e; --green: #3ddc84; --blue: #5cb8ff; --calm: #4b5766;
  box-sizing: border-box; min-height: 100vh; padding: 1.2vw 1.6vw 72px;
  display: flex; flex-direction: column; gap: 1.2vw;
  font-size: clamp(14px, 1.05vw, 22px); color: var(--text); background: var(--bg);
}
.vD *, .vD *::before, .vD *::after { box-sizing: border-box; }
.vD a { color: inherit; text-decoration: none; }
.vD a:hover { text-decoration: underline; }
.vD .t-red { color: var(--red); } .vD .t-amber { color: var(--amber); } .vD .t-green { color: var(--green); }
.vD .t-blue { color: var(--blue); } .vD .t-calm { color: var(--calm); }

.vD .top { display: flex; align-items: center; gap: 1.5em; }
.vD .brand { font-weight: 800; letter-spacing: .04em; font-size: 1.3em; }
.vD .pulse { display: flex; align-items: center; gap: .5em; color: var(--dim); }
.vD .pulse .dot { width: .7em; height: .7em; border-radius: 50%; background: var(--green); box-shadow: 0 0 .8em var(--green); animation: vDpulse 2.4s ease-in-out infinite; }
.vD .pulse.bad { color: var(--red); }
.vD .pulse.bad .dot { background: var(--red); box-shadow: 0 0 .8em var(--red); }
@keyframes vDpulse { 50% { opacity: .35; } }
.vD .clock { margin-left: auto; font-size: 2em; font-weight: 300; font-variant-numeric: tabular-nums; color: var(--dim); }

.vD .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1vw; }
.vD .kpi { background: var(--panel); border-radius: 14px; padding: 1vw 1.2vw; border-top: 6px solid currentColor; }
.vD .kpi .value { font-size: clamp(44px, 5.2vw, 120px); font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.vD .kpi .label { margin-top: .5em; color: var(--dim); font-size: 1.05em; text-transform: uppercase; letter-spacing: .06em; }
.vD .kpi.t-calm .value { color: var(--calm); }

.vD .main { flex: 1; display: grid; grid-template-columns: minmax(0, 2.1fr) minmax(0, 1fr); gap: 1.2vw; }
.vD h2 { margin: 0 0 .6em; font-size: 1.6em; text-transform: uppercase; letter-spacing: .08em; color: var(--dim); }
.vD h3 { margin: 0 0 .8em; font-size: .95em; text-transform: uppercase; letter-spacing: .1em; color: var(--dim); }

.vD .waiting { background: var(--panel); border-radius: 16px; padding: 1.4vw 1.6vw; }
.vD .waiting ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1vw; }
.vD .clear { font-size: 3em; font-weight: 700; color: var(--green); padding: 2em 0; text-align: center; }
.vD .item { display: flex; gap: 1.4vw; align-items: center; padding: 1vw 1.2vw; border-radius: 12px; background: #141b24; border-left: 10px solid var(--calm); }
.vD .item.b-red { border-left-color: var(--red); } .vD .item.b-amber { border-left-color: var(--amber); } .vD .item.b-blue { border-left-color: var(--blue); }
.vD .item .body { flex: 1; min-width: 0; }
.vD .reason { display: inline-block; font-size: 1.35em; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; padding: .15em .55em; border-radius: 8px; background: color-mix(in srgb, currentColor 16%, transparent); }
.vD .item .title { display: block; margin-top: .3em; font-size: clamp(22px, 2.1vw, 48px); font-weight: 700; line-height: 1.15;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.vD .meta { margin-top: .45em; display: flex; flex-wrap: wrap; gap: .5em 1em; color: var(--dim); font-size: 1.2em; }
.vD .meta .repo { color: var(--text); font-weight: 600; }
.vD .meta .jira { color: var(--blue); }
.vD .side { display: flex; flex-direction: column; align-items: flex-end; gap: .6em; }
.vD .age { font-size: clamp(28px, 2.6vw, 60px); font-weight: 300; font-variant-numeric: tabular-nums; color: var(--dim); }
.vD .seen { font: inherit; font-size: 1.25em; font-weight: 700; padding: .55em 1.3em; border-radius: 10px; cursor: pointer;
  color: var(--text); background: #222c38; border: 2px solid #334152; }
.vD .seen:hover { background: #2c3949; border-color: var(--green); color: var(--green); }

.vD .radar { display: flex; flex-direction: column; gap: 1.2vw; min-width: 0; }
.vD .block { background: var(--panel); border-radius: 16px; padding: 1.1vw 1.3vw; }
.vD .health + .health { margin-top: 1em; }
.vD .hrow { display: flex; justify-content: space-between; gap: 1em; margin-bottom: .35em; }
.vD .hrow .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vD .hrow .nums b { font-variant-numeric: tabular-nums; margin-left: .4em; }
.vD .bar { display: flex; gap: 3px; height: 14px; border-radius: 7px; overflow: hidden; background: var(--line); }
.vD .bar i { display: block; }
.vD .s-red { background: var(--red); } .vD .s-amber { background: var(--amber); } .vD .s-green { background: var(--green); }

.vD .feed { flex: 1; }
.vD .feed ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .75em; }
.vD .feed li { display: flex; gap: .7em; min-width: 0; }
.vD .ico { flex: none; width: 1.6em; text-align: center; opacity: .8; }
.vD .ico.commit { color: var(--blue); font-weight: 800; }
.vD .ftext { min-width: 0; flex: 1; }
.vD .fhead { display: flex; gap: .6em; font-size: .9em; color: var(--dim); }
.vD .fhead a { color: var(--text); font-weight: 600; }
.vD .fhead .when { margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
.vD .fbody { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vD .fbody.commit { font-family: ui-monospace, monospace; color: var(--dim); }

.vD .chips { display: flex; flex-wrap: wrap; gap: .5em; }
.vD .chip { padding: .3em .8em; border-radius: 999px; font-weight: 600; font-size: .95em;
  color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); border: 1px solid color-mix(in srgb, var(--green) 40%, transparent); }
.vD .chip span { color: var(--dim); font-weight: 400; margin-left: .3em; }

@media (max-width: 900px) {
  .vD .kpis { grid-template-columns: repeat(3, 1fr); }
  .vD .main { grid-template-columns: 1fr; }
}
`;
