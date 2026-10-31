// PROTOTYPE concept B: the dashboard as a kanban board, sections as columns in workflow order.
import { useState } from "preact/hooks";
import type { ClosedPullRequest, DashboardPullRequest, Section } from "../../src/api.js";
import { statusBadges } from "../../src/badges.js";
import { age, sectionTitle, statusText } from "../../src/format.js";
import type { CiState, MergeStateStatus, ReviewState } from "../../../src/domain/types.js";
import type { VariantProps } from "../types.js";

export const name = "Канбан";

const CSS = `
body { margin: 0; background: var(--vb-bg, #f4f5f7); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.vB {
  --bg: #f4f5f7; --col: #ebedf0; --card: #fff; --line: #dcdfe4; --text: #1d2125; --muted: #626f86; --faint: #8590a2;
  --ok: #1f845a; --bad: #c9372c; --pending: #b38600; --merged: #6e5dc6; --chip: #fff; --chip-on: #1d2125; --chip-on-text: #fff;
  --shadow: 0 1px 1px rgba(9,30,66,.18), 0 0 1px rgba(9,30,66,.2);
  --tag-l: 42%; --tag-bg-l: 92%;
  color: var(--text); background: var(--bg); min-height: 100vh; padding: 0 0 72px; box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  body { background: #161a1d; }
  .vB {
    --bg: #161a1d; --col: #1d2125; --card: #282e33; --line: #38414a; --text: #dee4ea; --muted: #9fadbc; --faint: #738496;
    --ok: #4bce97; --bad: #f87168; --pending: #e2b203; --merged: #9f8fef; --chip: #22272b; --chip-on: #dee4ea; --chip-on-text: #161a1d;
    --shadow: 0 1px 1px rgba(0,0,0,.5), 0 0 1px rgba(0,0,0,.6);
    --tag-l: 75%; --tag-bg-l: 22%;
  }
}
.vB * { box-sizing: border-box; }
.vB a { color: inherit; text-decoration: none; }
.vB a:hover { text-decoration: underline; }

.vB .top { position: sticky; left: 0; padding: 14px 16px 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.vB h1 { margin: 0; font-size: 18px; letter-spacing: -.01em; }
.vB .status { color: var(--muted); font-size: 12px; flex: 1 1 auto; }
.vB .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; width: 100%; }
.vB .toolbar .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
.vB .chip {
  font: inherit; font-size: 12px; border: 1px solid var(--line); background: var(--chip); color: var(--text);
  border-radius: 999px; padding: 3px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
}
.vB .chip:hover { border-color: var(--faint); }
.vB .chip.on { background: var(--chip-on); color: var(--chip-on-text); border-color: var(--chip-on); }
.vB .chip .dot { width: 8px; height: 8px; border-radius: 50%; }
.vB .chip .n { opacity: .65; }

.vB .board { display: flex; gap: 10px; align-items: flex-start; overflow-x: auto; padding: 4px 16px 16px; }
.vB .col {
  flex: 0 0 272px; background: var(--col); border-radius: 10px; display: flex; flex-direction: column;
  max-height: calc(100vh - 150px); border-top: 3px solid var(--accent);
}
.vB .col-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 8px; cursor: pointer; user-select: none; }
.vB .col-head h2 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 650; }
.vB .col-head .count { font-size: 12px; color: var(--muted); background: var(--card); border-radius: 999px; padding: 0 7px; min-width: 22px; text-align: center; }
.vB .col-head .fold { margin-left: auto; color: var(--faint); font-size: 12px; }
.vB .col.hot .col-head h2 { color: var(--accent); }
.vB .cards { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 10px; overflow-y: auto; }
.vB .col.closed { opacity: .78; }
.vB .col.closed .card { box-shadow: none; border: 1px dashed var(--line); background: transparent; }

.vB .col.strip { flex: 0 0 44px; cursor: pointer; align-self: stretch; max-height: none; min-height: 220px; }
.vB .col.strip .col-head { flex-direction: column; padding: 10px 0; gap: 10px; }
.vB .col.strip h2 { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
.vB .col.strip .fold { margin: 0; }
.vB .col.strip:hover { filter: brightness(.97); }

.vB .card { background: var(--card); border-radius: 8px; box-shadow: var(--shadow); padding: 8px 10px 8px; display: flex; flex-direction: column; gap: 6px; }
.vB .card.draft { background: repeating-linear-gradient(135deg, var(--card), var(--card) 8px, var(--col) 8px, var(--col) 10px); }
.vB .card-top { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.vB .tag { font-weight: 650; border-radius: 4px; padding: 1px 6px; color: hsl(var(--h) 55% var(--tag-l)); background: hsl(var(--h) 60% var(--tag-bg-l)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.vB .num { color: var(--faint); }
.vB .age { margin-left: auto; color: var(--faint); white-space: nowrap; }
.vB .title { font-size: 13.5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.vB .reason { align-self: flex-start; font-size: 11px; font-weight: 650; border-radius: 4px; padding: 1px 6px; color: #fff; background: var(--bad); }
.vB .reason.pending { background: var(--pending); color: #1d2125; }
.vB .reason.muted { background: var(--faint); }
.vB .jira { display: flex; flex-wrap: wrap; gap: 4px; }
.vB .jira a { font-size: 10.5px; font-family: ui-monospace, monospace; color: var(--muted); border: 1px solid var(--line); border-radius: 3px; padding: 0 4px; }
.vB .card-foot { display: flex; align-items: center; gap: 6px; min-height: 24px; }
.vB .av {
  width: 22px; height: 22px; border-radius: 50%; display: inline-grid; place-items: center; flex: none;
  font-size: 9.5px; font-weight: 700; color: #fff; background: hsl(var(--h) 45% 48%); border: 2px solid var(--card);
}
.vB .icons { display: flex; align-items: center; gap: 4px; }
.vB .ic { font-size: 10.5px; font-weight: 650; border-radius: 4px; padding: 0 4px; line-height: 18px; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
.vB .ic.ok { --c: var(--ok); } .vB .ic.bad { --c: var(--bad); } .vB .ic.pending { --c: var(--pending); } .vB .ic.muted { --c: var(--faint); }
.vB .reviews { display: flex; margin-left: auto; }
.vB .reviews .av { width: 20px; height: 20px; margin-left: -6px; position: relative; }
.vB .reviews .av::after { content: ""; position: absolute; right: -3px; bottom: -3px; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--card); background: var(--c); }
.vB .reviews .av.ok { --c: var(--ok); } .vB .reviews .av.bad { --c: var(--bad); } .vB .reviews .av.muted { --c: var(--faint); }
.vB .reviews .av.ask { background: transparent; color: var(--muted); border: 1.5px dashed var(--faint); }
.vB .seen { font: inherit; font-size: 11px; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 4px; padding: 1px 7px; cursor: pointer; }
.vB .seen:hover { color: var(--text); border-color: var(--faint); }
.vB .closed-st { font-size: 11px; font-weight: 650; }
.vB .closed-st.merged { color: var(--merged); } .vB .closed-st.bad { color: var(--bad); }
.vB .empty { color: var(--faint); font-size: 12px; text-align: center; padding: 14px 0 6px; }
`;

const ACCENT: Record<Section | "closed", string> = {
  waiting_on_me: "var(--bad)",
  free_for_review: "#2684ff",
  ready_to_merge: "var(--ok)",
  waiting_on_others: "var(--pending)",
  team: "var(--faint)",
  closed: "var(--line)",
};

function hue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

const shortRepo = (repo: string) => repo.slice(repo.indexOf("/") + 1);

function initials(login: string): string {
  const parts = login.split(/[-_.]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : login.slice(0, 2);
  return letters.toUpperCase();
}

const same = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

function Avatar({ login, cls = "", title }: { login: string; cls?: string; title?: string }) {
  return (
    <span class={`av ${cls}`} style={{ "--h": hue(login) }} title={title ?? login}>
      {initials(login)}
    </span>
  );
}

const CHECK: Record<CiState, [string, string]> = {
  SUCCESS: ["✓", "ok"],
  FAILURE: ["✗", "bad"],
  ERROR: ["✗", "bad"],
  PENDING: ["…", "pending"],
  EXPECTED: ["…", "pending"],
};

const MERGE: Partial<Record<MergeStateStatus, [string, string, string]>> = {
  DIRTY: ["⨯ конфликт", "bad", "Има конфликт с base клона"],
  BEHIND: ["↻", "pending", "Клонът е изостанал, трябва rebase"],
  BLOCKED: ["⏸", "muted", "Merge е блокиран от правилата на repo-то"],
  CLEAN: ["⇢ merge", "ok", "Може да се merge-не"],
  HAS_HOOKS: ["⇢ merge", "ok", "Може да се merge-не"],
  UNSTABLE: ["⇢ merge", "ok", "Може да се merge-не, незадължителни проверки не минават"],
};

const REVIEW: Partial<Record<ReviewState, [string, string]>> = {
  APPROVED: ["ok", "одобри"],
  CHANGES_REQUESTED: ["bad", "иска промени"],
  COMMENTED: ["muted", "коментира"],
};

function Check({ label, state }: { label: string; state: CiState | null }) {
  if (!state) return null;
  const [mark, kind] = CHECK[state];
  return (
    <span class={`ic ${kind}`} title={`${label}: ${state}`}>
      {label} {mark}
    </span>
  );
}

function Ticket({ pr, onSeen }: { pr: DashboardPullRequest; onSeen?: (pr: DashboardPullRequest) => void }) {
  const reason = pr.reason ? statusBadges(pr)[0] : undefined;
  const mergeKey = pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.mergeStateStatus;
  const merge = MERGE[mergeKey];
  const reviewed = new Set(pr.reviews.map((r) => r.author.toLowerCase()));
  const asked = pr.requestedReviewers.filter((login) => !reviewed.has(login.toLowerCase()));
  return (
    <article class={`card${pr.isDraft ? " draft" : ""}`}>
      <div class="card-top">
        <span class="tag" style={{ "--h": hue(pr.repo) }} title={pr.repo}>
          {shortRepo(pr.repo)}
        </span>
        <a class="num" href={pr.url} target="_blank" rel="noreferrer">
          #{pr.number}
        </a>
        <span class="age" title={`Отворен ${new Date(pr.createdAt).toLocaleString()} · обновен преди ${age(pr.updatedAt)}`}>
          {age(pr.createdAt)}
        </span>
      </div>
      {reason ? (
        <span class={`reason ${reason.kind}`} title={reason.title}>
          {reason.text}
        </span>
      ) : null}
      <a class="title" href={pr.url} target="_blank" rel="noreferrer">
        {pr.isDraft ? "[draft] " : ""}
        {pr.title}
      </a>
      {pr.jira.length ? (
        <div class="jira">
          {pr.jira.map((j) => (
            <a key={j.key} href={j.url} target="_blank" rel="noreferrer">
              {j.key}
            </a>
          ))}
        </div>
      ) : null}
      <div class="card-foot">
        <Avatar login={pr.author} title={`автор: ${pr.author}`} />
        <div class="icons">
          {pr.reason === "ci_failed" ? null : <Check label="CI" state={pr.ci} />}
          {pr.reason === "sonar_failed" ? null : <Check label="SQ" state={pr.sonar} />}
          {merge && !(pr.reason === "needs_rebase" && mergeKey === "BEHIND") ? (
            <span class={`ic ${merge[1]}`} title={merge[2]}>
              {merge[0]}
            </span>
          ) : null}
          {pr.unreadComments ? (
            <span class="ic pending" title="непрочетени коментари">
              💬{pr.unreadComments}
            </span>
          ) : null}
        </div>
        <div class="reviews">
          {pr.reviews.map((r) => {
            const mark = REVIEW[r.state];
            return mark ? <Avatar key={r.author} login={r.author} cls={mark[0]} title={`${r.author} ${mark[1]}`} /> : null;
          })}
          {asked.map((login) => (
            <Avatar key={login} login={login} cls="ask" title={`${login}: чака се review`} />
          ))}
        </div>
        {onSeen ? (
          <button class="seen" onClick={() => onSeen(pr)} title="Маркирай като видян">
            видях
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ClosedTicket({ pr }: { pr: ClosedPullRequest }) {
  const merged = pr.state === "MERGED";
  return (
    <article class="card">
      <div class="card-top">
        <span class="tag" style={{ "--h": hue(pr.repo) }} title={pr.repo}>
          {shortRepo(pr.repo)}
        </span>
        <a class="num" href={pr.url} target="_blank" rel="noreferrer">
          #{pr.number}
        </a>
        <span class="age" title={new Date(pr.closedAt).toLocaleString()}>
          преди {age(pr.closedAt)}
        </span>
      </div>
      <a class="title" href={pr.url} target="_blank" rel="noreferrer">
        {pr.title}
      </a>
      <div class="card-foot">
        <Avatar login={pr.author} />
        <span class={`closed-st ${merged ? "merged" : "bad"}`}>{merged ? "merged" : "затворен без merge"}</span>
      </div>
    </article>
  );
}

type ColumnProps = {
  id: Section | "closed";
  title: string;
  count: number;
  folded: Record<string, boolean>;
  toggle(id: string): void;
  children: preact.ComponentChildren;
};

function Column({ id, title, count, folded, toggle, children }: ColumnProps) {
  // Empty columns fold to a strip unless opened by hand; full ones fold only by hand.
  const strip = folded[id] ?? count === 0;
  const cls = `col${strip ? " strip" : ""}${id === "closed" ? " closed" : ""}${id === "waiting_on_me" && count ? " hot" : ""}`;
  return (
    <section class={cls} style={{ "--accent": ACCENT[id] }} onClick={strip ? () => toggle(id) : undefined}>
      <header class="col-head" onClick={strip ? undefined : () => toggle(id)} title={strip ? "Разгъни" : "Сгъни"}>
        {strip ? <span class="count">{count}</span> : null}
        <h2>{title}</h2>
        {strip ? null : <span class="count">{count}</span>}
        <span class="fold">{strip ? "›" : "‹"}</span>
      </header>
      {strip ? null : <div class="cards">{count ? children : <div class="empty">Празно</div>}</div>}
    </section>
  );
}

/** Sections as kanban columns, left to right in workflow order; repo is only a coloured tag on each ticket. */
export function View({ state, onSeen }: VariantProps) {
  const [repos, setRepos] = useState<string[]>([]);
  const [mine, setMine] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setFolded((old) => {
      const isEmpty = id === "closed" ? !closed.length : !state.sections.find((s) => s.section === id)?.pullRequests.length;
      return { ...old, [id]: !(old[id] ?? isEmpty) };
    });

  const allRepos = [
    ...new Set([...state.sections.flatMap((s) => s.pullRequests.map((pr) => pr.repo)), ...state.recentlyClosed.map((pr) => pr.repo)]),
  ].sort();
  const repoCount = (repo: string) => state.sections.reduce((n, s) => n + s.pullRequests.filter((pr) => pr.repo === repo).length, 0);
  const keep = (pr: { repo: string; author: string }) =>
    (repos.length === 0 || repos.includes(pr.repo)) && (!mine || same(state.viewer, pr.author));
  const closed = state.recentlyClosed.filter(keep);
  const flipRepo = (repo: string) => setRepos((old) => (old.includes(repo) ? old.filter((r) => r !== repo) : [...old, repo]));

  return (
    <div class="vB">
      <style>{CSS}</style>
      <div class="top">
        <h1>WorkDash</h1>
        <span class="status">{statusText(state)}</span>
        <div class="toolbar">
          <button class={`chip${repos.length === 0 ? " on" : ""}`} onClick={() => setRepos([])}>
            Всички repo-та
          </button>
          {allRepos.map((repo) => (
            <button key={repo} class={`chip${repos.includes(repo) ? " on" : ""}`} onClick={() => flipRepo(repo)} title={repo}>
              <span class="dot" style={{ background: `hsl(${hue(repo)} 55% 50%)` }} />
              {shortRepo(repo)}
              <span class="n">{repoCount(repo)}</span>
            </button>
          ))}
          <span class="sep" />
          <button class={`chip${mine ? " on" : ""}`} onClick={() => setMine(!mine)}>
            само моите
          </button>
        </div>
      </div>
      <div class="board">
        {state.sections.map(({ section, pullRequests }) => {
          const shown = pullRequests.filter(keep);
          return (
            <Column key={section} id={section} title={sectionTitle(section)} count={shown.length} folded={folded} toggle={toggle}>
              {shown.map((pr) => (
                <Ticket key={`${pr.repo}#${pr.number}`} pr={pr} {...(section === "waiting_on_me" ? { onSeen } : {})} />
              ))}
            </Column>
          );
        })}
        <Column id="closed" title="Затворени" count={closed.length} folded={folded} toggle={toggle}>
          {closed.map((pr) => (
            <ClosedTicket key={`${pr.repo}#${pr.number}`} pr={pr} />
          ))}
        </Column>
      </div>
    </div>
  );
}
