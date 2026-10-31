import { useEffect, useRef, useState } from "preact/hooks";
import { type IssueBoardState, loadIssues, requestIssuePoll } from "./api.js";
import type { IssueDemand } from "../../src/domain/issue-poll.js";
import { afterMotion } from "./motion.js";
import { useServerEvent, useStreamStatus } from "./useServerEvents.js";
import { sameRepo } from "../../src/domain/repos.js";

/** What the Issue dashboard shows of its open repo, and its "Обнови". */
export type IssuesView = {
  /** The open repo's issues as last saved; null while there is no open repo or until the server answers for it. */
  state: IssueBoardState | null;
  /** "Обнови": a poll of the open repo now, however recent the last one is. */
  pollNow(): void;
};

/** Focus and visibilitychange come together when I come back; within this long, the second one is not asked for. */
const SAME_MOMENT_MS = 1_000;
/** How long after the server says the interval is due the page asks, so the ask never lands a moment early. */
const DUE_MARGIN_MS = 250;
/** How long the interval waits to ask again after an ask that failed (the server unreachable, say). */
const RETRY_MS = 60_000;

function ask(repo: string, demand: IssueDemand): void {
  requestIssuePoll(repo, demand).catch((error: Error) => console.error(`issue poll request failed: ${error.message}`));
}

/** Whether the browser tab shows, kept up to date. */
function useTabShown(): boolean {
  const [shown, setShown] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const onChange = () => setShown(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return shown;
}

/**
 * The issues of `repo`, the repo open on the Issue dashboard (null while the dashboard is not shown). Opening a repo shows
 * what the server saved and asks for a poll of it; so do the stream (re)connecting, as events may have been missed, window
 * focus and the browser tab shown again, in either mode. In Periodic (`periodic`) the page also asks on the interval while
 * the tab shows, at the time the server's last answer said it is due. The server polls at most once a minute but for
 * "Обнови". Every `issues` event for the repo replaces what shows, held back while a card animates, so every page on one
 * repo shows the same.
 */
export function useIssues(repo: string | null, periodic: boolean): IssuesView {
  const [state, setState] = useState<IssueBoardState | null>(null);
  const open = useRef(repo);
  open.current = repo;
  const stream = useStreamStatus();
  const connected = stream === "open";
  const tabShown = useTabShown();

  useEffect(() => {
    setState((current) => (current && repo && sameRepo(current.repo, repo) ? current : null));
    if (!repo) return;
    loadIssues(repo)
      .then((loaded) => {
        // An event may have brought a newer state for this repo meanwhile; the one loaded only fills an empty board.
        if (open.current && sameRepo(open.current, repo)) setState((current) => current ?? loaded);
      })
      .catch((error: Error) => console.error(`loading the issues of ${repo} failed: ${error.message}`));
    if (connected) ask(repo, "open");
  }, [repo, connected]);

  // Coming back to the page: the window focused, or the browser tab shown again.
  const lastShown = useRef(0);
  useEffect(() => {
    if (!repo || !connected) return;
    const onShow = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastShown.current < SAME_MOMENT_MS) return;
      lastShown.current = Date.now();
      ask(repo, "focus");
    };
    addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [repo, connected]);

  // The interval: only in Periodic, while the dashboard and the browser tab show. Its first ask joins or skips the one of opening.
  useEffect(() => {
    if (!repo || !connected || !periodic || !tabShown) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = () => {
      requestIssuePoll(repo, "interval")
        .then(({ dueAt }) => {
          if (!stopped) timer = setTimeout(tick, Math.max(0, Date.parse(dueAt) - Date.now()) + DUE_MARGIN_MS);
        })
        .catch((error: Error) => {
          console.error(`issue poll request failed: ${error.message}`);
          if (!stopped) timer = setTimeout(tick, RETRY_MS);
        });
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [repo, connected, periodic, tabShown]);

  useServerEvent("issues", (next) => {
    if (!open.current || !sameRepo(next.repo, open.current)) return;
    afterMotion(() => {
      if (open.current && sameRepo(next.repo, open.current)) setState(next);
    });
  });

  return {
    state,
    pollNow() {
      if (repo) ask(repo, "button");
    },
  };
}
