import { useEffect, useRef, useState } from "preact/hooks";
import { type IssueBoardState, loadIssues, requestIssuePoll } from "./api.js";
import type { IssueDemand } from "../../src/domain/issue-poll.js";
import { afterMotion } from "./motion.js";
import { useServerEvent, useStreamStatus } from "./useServerEvents.js";

/** What the Issue dashboard shows of its open repo, and its "Обнови". */
export type IssuesView = {
  /** The open repo's issues as last saved; null while there is no open repo or until the server answers for it. */
  state: IssueBoardState | null;
  /** "Обнови": a poll of the open repo now, however recent the last one is. */
  pollNow(): void;
};

const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function ask(repo: string, reason: IssueDemand): void {
  requestIssuePoll(repo, reason).catch((error: Error) => console.error(`issue poll request failed: ${error.message}`));
}

/**
 * The issues of `repo`, the repo open on the Issue dashboard (null while the dashboard is not shown). Opening a repo shows
 * what the server saved and asks for a poll of it, which the server makes at most once a minute; the stream (re)connecting
 * does too, as events may have been missed. Every `issues` event for the repo replaces what shows, held back while a card
 * animates, so every page on one repo shows the same.
 */
export function useIssues(repo: string | null): IssuesView {
  const [state, setState] = useState<IssueBoardState | null>(null);
  const open = useRef(repo);
  open.current = repo;
  const stream = useStreamStatus();
  const connected = stream === "open";

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
