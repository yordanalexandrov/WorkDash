// PROTOTYPE: focus mode, one PR at a time with a plain-language next step. Not shipped.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ClosedPullRequest, DashboardPullRequest, Section } from "../../src/api.js";
import { checkBadges, closedBadge, statusBadges } from "../../src/badges.js";
import { age, sectionTitle, statusText } from "../../src/format.js";
import type { VariantProps } from "../types.js";

export const name = "Следващо действие";

// The sections the queue draws from, most urgent first.
const QUEUE_SECTIONS: Section[] = ["waiting_on_me", "free_for_review", "ready_to_merge"];

type Item = { pr: DashboardPullRequest; section: Section };
type Tone = "bad" | "warn" | "ok" | "info";
type Action = { sentence: string; hint: string; tone: Tone };

const keyOf = (pr: { repo: string; number: number }) => `${pr.repo}#${pr.number}`;
const repoName = (repo: string) => repo.slice(repo.indexOf("/") + 1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const same = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

/** Others' comments, newest first. */
function othersComments(pr: DashboardPullRequest, viewer: string | null) {
  return [...pr.comments].filter((c) => !same(viewer, c.author)).reverse();
}

function names(list: string[]): string {
  const unique = [...new Set(list)];
  return unique.length > 2 ? `${unique.slice(0, 2).join(", ")} и още ${unique.length - 2}` : unique.join(" и ");
}

/** What the PR wants from me, in one sentence a human would say. */
function action(item: Item, viewer: string | null): Action {
  const { pr, section } = item;
  const since = age(pr.updatedAt);
  const unread = pr.unreadComments ?? 0;
  const recent = othersComments(pr, viewer);
  switch (pr.reason) {
    case "ci_failed":
      return { sentence: "CI падна на твоя PR", hint: "Виж кой check не минава и пусни fix.", tone: "bad" };
    case "sonar_failed":
      return { sentence: "Sonar quality gate падна на твоя PR", hint: "Отвори Sonar отчета и оправи проблемите.", tone: "bad" };
    case "changes_requested": {
      const who = pr.reviews.filter((r) => r.state === "CHANGES_REQUESTED").map((r) => r.author);
      return {
        sentence: `${who.length ? names(who) : "Reviewer"} поиска промени`,
        hint: "Прочети коментарите, push-ни промените и поискай re-review.",
        tone: "bad",
      };
    }
    case "conflict":
      return { sentence: "Твоят PR има конфликт с base клона", hint: "Rebase-ни или merge-ни base и реши конфликта.", tone: "bad" };
    case "needs_rebase":
      return { sentence: "Одобрен е, но клонът е изостанал", hint: "Rebase-ни върху base и после merge.", tone: "warn" };
    case "unread_comments": {
      const who = recent.slice(0, unread).map((c) => c.author);
      return {
        sentence: `${plural(unread, "нов коментар", "нови коментара")}${who.length ? ` от ${names(who)}` : ""}`,
        hint: "Отговори или оправи и маркирай като видян.",
        tone: "info",
      };
    }
    case "review_requested":
      return { sentence: `${pr.author} поиска твоето review преди ${since}`, hint: "Прегледай промените и одобри или коментирай.", tone: "bad" };
    case "mention": {
      const who = recent.find((c) => viewer && c.body.toLowerCase().includes(`@${viewer.toLowerCase()}`))?.author;
      return { sentence: `${who ?? "Някой"} те спомена в коментар`, hint: "Виж какво питат и отговори.", tone: "info" };
    }
    case "re_review": {
      const { newCommits = 0, replies = 0 } = pr.reReview ?? {};
      const news = [
        ...(newCommits ? [plural(newCommits, "нов commit", "нови commit-а")] : []),
        ...(replies ? [plural(replies, "отговор", "отговора")] : []),
      ];
      return {
        sentence: `След твоето review: ${news.join(", ") || "нова активност"}`,
        hint: "Провери дали исканите промени са направени.",
        tone: "warn",
      };
    }
  }
  if (section === "free_for_review")
    return { sentence: `${pr.author} чака review от ${age(pr.createdAt)}`, hint: "Никой още не го е взел. Вземи го ти.", tone: "info" };
  if (section === "ready_to_merge") return { sentence: "Одобрен и зелен, готов за merge", hint: "Натисни merge.", tone: "ok" };
  if (section === "waiting_on_others") return { sentence: "Чака други", hint: "Нищо за теб засега.", tone: "info" };
  return { sentence: `${pr.author} работи по това`, hint: "За информация.", tone: "info" };
}

/** Strips the noisiest markdown so a comment reads as a quote. */
function plain(body: string, max = 260): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " [код] ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " [картинка] ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Subsequence match: higher is better, null when the query letters are not all there in order. */
function fuzzy(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct;
  let score = 0;
  let at = -1;
  let run = 0;
  for (const ch of q) {
    const next = t.indexOf(ch, at + 1);
    if (next < 0) return null;
    run = next === at + 1 ? run + 1 : 0;
    score += 1 + run * 3 - Math.min(next - at, 10) * 0.1;
    at = next;
  }
  return score;
}

type Entry = { key: string; title: string; number: number; repo: string; author: string; url: string; label: string; hay: string };

function Badges({ pr }: { pr: DashboardPullRequest }) {
  const badges = [...statusBadges(pr).slice(pr.reason ? 1 : 0), ...checkBadges(pr)];
  return (
    <span class="badges">
      {badges.map((b) => (
        <span key={b.text} class={`badge k-${b.kind}`} title={b.title}>
          {b.text}
        </span>
      ))}
    </span>
  );
}

function Jira({ pr }: { pr: DashboardPullRequest }) {
  return (
    <>
      {pr.jira.map((j) => (
        <a key={j.key} class="jira" href={j.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          {j.key}
        </a>
      ))}
    </>
  );
}

function Hero({ item, viewer, position, total, onDone }: { item: Item; viewer: string | null; position: number; total: number; onDone(): void }) {
  const { pr, section } = item;
  const act = action(item, viewer);
  const quote = othersComments(pr, viewer)[0];
  return (
    <article class={`hero t-${act.tone}`}>
      <div class="hero-top">
        <span class="pill">{sectionTitle(section)}</span>
        <span class="count">
          {position} от {total}
        </span>
      </div>
      <h2 class="sentence">{act.sentence}</h2>
      <p class="hint">{act.hint}</p>
      <a class="pr-title" href={pr.url} target="_blank" rel="noreferrer">
        {pr.title}
      </a>
      <div class="meta">
        <span>
          {repoName(pr.repo)} <a href={pr.url} target="_blank" rel="noreferrer">#{pr.number}</a>
        </span>
        <span>{pr.author}</span>
        <span class="branch" title={pr.headRefName}>
          {pr.headRefName}
        </span>
        <span>обновен преди {age(pr.updatedAt)}</span>
      </div>
      <div class="chips">
        <Jira pr={pr} />
        <Badges pr={pr} />
      </div>
      {quote ? (
        <blockquote>
          <p>{plain(quote.body) || "(празен коментар)"}</p>
          <footer>
            {quote.author} · преди {age(quote.createdAt)}
            {quote.thread ? " · в код review" : ""}
          </footer>
        </blockquote>
      ) : null}
      <div class="actions">
        <a class="btn primary" href={pr.url} target="_blank" rel="noreferrer">
          Отвори в GitHub ↗
        </a>
        <button class="btn" onClick={onDone}>
          видях · следващ →
        </button>
      </div>
    </article>
  );
}

function Row({ item, viewer }: { item: Item; viewer: string | null }) {
  const act = action(item, viewer);
  return (
    <a class="row" href={item.pr.url} target="_blank" rel="noreferrer">
      <span class={`dot t-${act.tone}`} />
      <span class="row-main">
        <span class="row-sentence">{act.sentence}</span>
        <span class="row-title">
          {repoName(item.pr.repo)}#{item.pr.number} · {item.pr.title}
        </span>
      </span>
      <span class="row-age">{age(item.pr.updatedAt)}</span>
    </a>
  );
}

function Closed({ pr }: { pr: ClosedPullRequest }) {
  const b = closedBadge(pr);
  return (
    <a class="row closed" href={pr.url} target="_blank" rel="noreferrer">
      <span class={`badge k-${b.kind}`} title={b.title}>
        {b.text}
      </span>
      <span class="row-main">
        <span class="row-title">
          {repoName(pr.repo)}#{pr.number} · {pr.title}
        </span>
      </span>
      <span class="row-age">{age(pr.closedAt)}</span>
    </a>
  );
}

function Palette({ entries, onClose }: { entries: Entry[]; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const results = useMemo(
    () =>
      entries
        .map((e) => ({ e, score: fuzzy(query, e.hay) }))
        .filter((r): r is { e: Entry; score: number } => r.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((r) => r.e),
    [entries, query],
  );
  const open = (entry: Entry | undefined) => {
    if (!entry) return;
    window.open(entry.url, "_blank", "noreferrer");
    onClose();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(results[active]);
    } else if (event.key === "Escape") onClose();
  };
  return (
    <div class="scrim" onClick={onClose}>
      <div class="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder="Търси PR: заглавие, repo, автор, клон, Jira…"
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        <ul>
          {results.map((e, i) => (
            <li key={e.key} class={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => open(e)}>
              <span class="p-title">{e.title}</span>
              <span class="p-meta">
                {repoName(e.repo)}#{e.number} · {e.author} · {e.label}
              </span>
            </li>
          ))}
          {results.length ? null : <li class="empty">Нищо не съвпада</li>}
        </ul>
        <div class="p-foot">↑↓ избор · Enter отваря · Esc затваря</div>
      </div>
    </div>
  );
}

export function View({ state, onSeen }: VariantProps) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [palette, setPalette] = useState(false);
  const viewer = state.viewer;

  const all: Item[] = state.sections.flatMap((group) => group.pullRequests.map((pr) => ({ pr, section: group.section })));
  const full = all.filter((item) => QUEUE_SECTIONS.includes(item.section));
  const queue = full.filter((item) => !done.has(keyOf(item.pr)));
  const hero = queue[0];
  const rest = state.sections.filter((group) => group.pullRequests.length);

  const entries: Entry[] = [
    ...all.map(({ pr, section }) => ({
      key: keyOf(pr),
      title: pr.title,
      number: pr.number,
      repo: pr.repo,
      author: pr.author,
      url: pr.url,
      label: sectionTitle(section),
      hay: [pr.title, pr.repo, pr.author, pr.headRefName, `#${pr.number}`, ...pr.jira.map((j) => j.key)].join(" "),
    })),
    ...state.recentlyClosed.map((pr) => ({
      key: `closed:${keyOf(pr)}`,
      title: pr.title,
      number: pr.number,
      repo: pr.repo,
      author: pr.author,
      url: pr.url,
      label: pr.state === "MERGED" ? "merged" : "затворен",
      hay: [pr.title, pr.repo, pr.author, `#${pr.number}`].join(" "),
    })),
  ];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        setPalette(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const next = () => {
    if (!hero) return;
    onSeen(hero.pr);
    setDone((old) => new Set(old).add(keyOf(hero.pr)));
  };

  return (
    <div class="vF">
      <style>{CSS}</style>
      <header class="bar">
        <div>
          <h1>Следващо</h1>
          <p class="status">{statusText(state)}</p>
        </div>
        <button class="search" onClick={() => setPalette(true)} title="Търсене (/ или Ctrl+K)">
          ⌕ <kbd>/</kbd>
        </button>
      </header>

      {state.error || state.problems.length || state.configError ? (
        <p class="warn-line">{state.error?.message ?? state.configError ?? state.problems.join("; ")}</p>
      ) : null}

      {hero ? (
        <Hero item={hero} viewer={viewer} position={done.size + 1} total={done.size + queue.length} onDone={next} />
      ) : (
        <article class="hero t-ok empty-hero">
          <h2 class="sentence">Нищо не чака теб</h2>
          <p class="hint">Опашката е празна. Можеш да разгледаш всичко останало отдолу.</p>
          {done.size ? (
            <button class="btn" onClick={() => setDone(new Set())}>
              Започни отначало
            </button>
          ) : null}
        </article>
      )}

      {queue.length > 1 ? (
        <section class="block">
          <h3>Опашка · още {queue.length - 1}</h3>
          <div class="list">
            {queue.slice(1, 6).map((item) => (
              <Row key={keyOf(item.pr)} item={item} viewer={viewer} />
            ))}
          </div>
        </section>
      ) : null}

      <section class="block">
        <h3>Всичко останало</h3>
        {rest.map((group) => (
          <details key={group.section} class="acc">
            <summary>
              <span>{sectionTitle(group.section)}</span>
              <span class="n">{group.pullRequests.length}</span>
            </summary>
            <div class="list">
              {group.pullRequests.map((pr) => (
                <div key={keyOf(pr)} class="row-wrap">
                  <Row item={{ pr, section: group.section }} viewer={viewer} />
                  {pr.jira.length ? (
                    <div class="row-jira">
                      <Jira pr={pr} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ))}
      </section>

      {state.recentlyClosed.length ? (
        <section class="block">
          <h3>Наскоро затворени</h3>
          <div class="list">
            {state.recentlyClosed.map((pr) => (
              <Closed key={keyOf(pr)} pr={pr} />
            ))}
          </div>
        </section>
      ) : null}

      <p class="foot">
        <kbd>/</kbd> или <kbd>Ctrl</kbd>+<kbd>K</kbd> за търсене
      </p>

      {palette ? <Palette entries={entries} onClose={() => setPalette(false)} /> : null}
    </div>
  );
}

const CSS = `
body { margin: 0; background: #eef0f4; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.vF {
  --bg: #eef0f4; --card: #ffffff; --ink: #161a22; --muted: #687083; --line: #e2e5ec; --soft: #f5f6f9;
  --bad: #d4343a; --warn: #c27a00; --ok: #1f8a4c; --info: #3a63d6; --merged: #7a4fd0; --accent: #2f5bd8;
  max-width: 560px; margin: 0 auto; padding: 16px 16px 96px; color: var(--ink); box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  body { background: #0f1116; }
  .vF { --bg: #0f1116; --card: #191c24; --ink: #e8eaf0; --muted: #8b92a3; --line: #2a2e39; --soft: #20232c;
    --bad: #ff6b6f; --warn: #f0a83a; --ok: #4cc47e; --info: #7c9cff; --merged: #b18cff; --accent: #6f8fff; }
}
.vF *, .vF *::before, .vF *::after { box-sizing: border-box; }
.vF a { color: inherit; }
.vF kbd { font: 12px ui-monospace, monospace; padding: 1px 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; background: var(--card); }

.vF .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 4px 0 16px; }
.vF h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
.vF .status { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
.vF .search { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border: 1px solid var(--line);
  border-radius: 20px; background: var(--card); color: var(--muted); font: inherit; font-size: 18px; cursor: pointer; }
.vF .warn-line { margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: color-mix(in srgb, var(--warn) 15%, transparent); color: var(--warn); font-size: 13px; }

.vF .hero { position: relative; background: var(--card); border-radius: 22px; padding: 20px 20px 18px; overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 12px 32px -12px rgba(20,30,60,.22); border-top: 5px solid var(--tone); }
.vF .t-bad { --tone: var(--bad); } .vF .t-warn { --tone: var(--warn); } .vF .t-ok { --tone: var(--ok); } .vF .t-info { --tone: var(--info); }
.vF .hero-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.vF .pill { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; color: var(--tone);
  background: color-mix(in srgb, var(--tone) 13%, transparent); }
.vF .count { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.vF .sentence { margin: 0; font-size: 25px; line-height: 1.2; letter-spacing: -0.015em; }
.vF .hint { margin: 6px 0 16px; color: var(--muted); }
.vF .pr-title { display: block; font-weight: 600; font-size: 16px; text-decoration: none; margin-bottom: 6px; }
.vF .pr-title:hover { text-decoration: underline; }
.vF .meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font-size: 13px; }
.vF .meta a { text-decoration: none; font-weight: 600; color: var(--accent); }
.vF .branch { font-family: ui-monospace, monospace; font-size: 12px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vF .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.vF .badges { display: contents; }
.vF .badge, .vF .jira { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; white-space: nowrap; text-decoration: none; }
.vF .jira { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
.vF .jira:hover { text-decoration: underline; }
.vF .k-ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 13%, transparent); }
.vF .k-bad { color: var(--bad); background: color-mix(in srgb, var(--bad) 13%, transparent); }
.vF .k-pending { color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, transparent); }
.vF .k-muted { color: var(--muted); background: var(--soft); }
.vF .k-merged { color: var(--merged); background: color-mix(in srgb, var(--merged) 13%, transparent); }
.vF blockquote { margin: 16px 0 0; padding: 12px 14px; border-radius: 14px; background: var(--soft); border-left: 3px solid var(--tone); }
.vF blockquote p { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
.vF blockquote footer { margin-top: 6px; font-size: 12px; color: var(--muted); }
.vF .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
.vF .btn { display: flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 14px; border-radius: 14px;
  font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; text-decoration: none; border: 1px solid var(--line);
  background: var(--soft); color: var(--ink); transition: transform .08s ease, filter .15s; }
.vF .btn:active { transform: scale(.98); }
.vF .btn:hover { filter: brightness(.97); }
.vF .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.vF .empty-hero .btn { margin-top: 4px; }
@media (max-width: 400px) { .vF .actions { grid-template-columns: 1fr; } .vF .sentence { font-size: 22px; } }

.vF .block { margin-top: 26px; }
.vF h3 { margin: 0 0 8px 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.vF .list { background: var(--card); border-radius: 16px; overflow: hidden; }
.vF .row { display: flex; align-items: center; gap: 12px; padding: 11px 14px; text-decoration: none; border-top: 1px solid var(--line); min-width: 0; }
.vF .list > :first-child, .vF .list > .row-wrap:first-child .row { border-top: 0; }
.vF .row:hover { background: var(--soft); }
.vF .dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--tone); }
.vF .row-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.vF .row-sentence { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vF .row-title { color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vF .closed .row-title { color: var(--ink); }
.vF .row-age { flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.vF .row-wrap { border-top: 1px solid var(--line); }
.vF .row-wrap .row { border-top: 0; }
.vF .row-jira { display: flex; gap: 6px; padding: 0 14px 10px 35px; margin-top: -4px; }

.vF .acc { background: var(--card); border-radius: 16px; margin-bottom: 8px; overflow: hidden; }
.vF .acc summary { list-style: none; display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; cursor: pointer; font-weight: 600; }
.vF .acc summary::-webkit-details-marker { display: none; }
.vF .acc summary::after { content: "›"; margin-left: 10px; color: var(--muted); transition: transform .15s; font-size: 18px; line-height: 1; }
.vF .acc[open] summary::after { transform: rotate(90deg); }
.vF .acc summary .n { margin-left: auto; color: var(--muted); font-weight: 500; font-variant-numeric: tabular-nums; }
.vF .acc .list { border-radius: 0; border-top: 1px solid var(--line); }

.vF .foot { text-align: center; color: var(--muted); font-size: 12px; margin-top: 28px; }

.vF .scrim { position: fixed; inset: 0; background: rgba(10,14,24,.45); backdrop-filter: blur(3px); display: flex; justify-content: center;
  align-items: flex-start; padding: 12vh 16px 16px; z-index: 50; }
.vF .palette { width: 100%; max-width: 560px; background: var(--card); border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px -10px rgba(0,0,0,.45); }
.vF .palette input { width: 100%; border: 0; border-bottom: 1px solid var(--line); padding: 16px 18px; font: inherit; font-size: 17px;
  background: transparent; color: var(--ink); outline: none; }
.vF .palette ul { list-style: none; margin: 0; padding: 6px; max-height: 50vh; overflow-y: auto; }
.vF .palette li { display: flex; flex-direction: column; padding: 9px 12px; border-radius: 10px; cursor: pointer; min-width: 0; }
.vF .palette li.on { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.vF .palette li.empty { color: var(--muted); cursor: default; }
.vF .p-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vF .p-meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vF .p-foot { padding: 8px 14px; font-size: 11.5px; color: var(--muted); border-top: 1px solid var(--line); }
`;
