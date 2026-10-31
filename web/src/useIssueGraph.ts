import { useEffect, useRef, useState } from "preact/hooks";
import type { IssueRef } from "../../src/domain/repos.js";
import { type IssueBoardState, type IssueFamily, loadIssueGraph } from "./api.js";
import { familyChanged } from "./issueGraph.js";

/** An issue's family as the sheet has it: the last that came (null before the first), whether one is on its way, and whether the last ask failed. */
export type IssueGraphState = { family: IssueFamily | null; loading: boolean; failed: boolean };

/**
 * The family of the issue whose sheet is open: asked for when the sheet opens (the server answers from what it fetched
 * within the minute), and again with `refresh` when a poll of the open repo (`board`) changes the family drawn. Either poll
 * mode brings `board` the same way, so it works alike in both.
 */
export function useIssueGraph(issue: IssueRef, board: IssueBoardState | null): IssueGraphState {
  const [state, setState] = useState<IssueGraphState>({ family: null, loading: true, failed: false });
  const asked = useRef(0);
  const family = useRef<IssueFamily | null>(null);

  const load = (refresh: boolean) => {
    // Only the latest ask is taken, should an older one come back after it.
    const ask = ++asked.current;
    setState((current) => ({ ...current, loading: true }));
    loadIssueGraph(issue, refresh).then(
      (next) => {
        if (ask !== asked.current) return;
        family.current = next;
        setState({ family: next, loading: false, failed: false });
      },
      () => ask === asked.current && setState((current) => ({ ...current, loading: false, failed: true })),
    );
  };

  useEffect(() => {
    load(false);
    // An answer after the sheet closed is dropped.
    return () => void ++asked.current;
  }, [issue.repo, issue.number]);

  const seen = useRef(board);
  useEffect(() => {
    const before = seen.current;
    seen.current = board;
    if (board && before !== board && family.current && familyChanged(family.current, before, board)) load(true);
  }, [board]);

  return state;
}
