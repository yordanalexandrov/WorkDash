import { createPortal } from "preact/compat";
import { useMemo } from "preact/hooks";
import type { IssueBoardState } from "../api.js";
import { issueTabs, pickRepo } from "../dashboard.js";
import { shortRepo } from "../format.js";
import { issueColumns } from "../issueBoard.js";
import { repoHue } from "../palette.js";
import { Board } from "./Board.js";
import { IssueCard } from "./IssueCard.js";
import { IssueTabs } from "./IssueTabs.js";

type IssueDashboardProps = {
  /** The followed repos whose issues are on, as the last poll read them. */
  issueRepos: string[];
  /** Whether a poll has fetched them, so no tabs means no repo has issues rather than not known yet. */
  fetched: boolean;
  /** The open repo's issues (`useIssues`); null until the server answers for it. */
  issues: IssueBoardState | null;
  /** The project colours, shared with the PR dashboard so a repo has one colour on both. */
  hues: Map<string, number>;
  /** The repo the URL asks for; the first tab opens when it has none. */
  repo: string | null;
  onRepo(repo: string): void;
  /** Where in the top bar the tabs go, below the toggles. */
  topSlot: HTMLElement | null;
  booted: boolean;
};

/** "100 от 240" on the open tab when the repo has more open issues than one poll fetches; nothing otherwise. */
function shownOfTotal(issues: IssueBoardState | null): string | null {
  return issues && issues.totalCount > issues.issues.length ? `${issues.issues.length} от ${issues.totalCount}` : null;
}

/** What the board says in its middle: why there is nothing to show yet, or nothing at all when there is. */
function boardMessage(open: string | null, fetched: boolean, issues: IssueBoardState | null): string | null {
  if (!open) return fetched ? "Нито едно repo няма включени issues." : null;
  if (!issues) return null;
  if (issues.fetchedAt === null) return issues.error ? `Issues на ${shortRepo(open)} не се взеха: ${issues.error.message}` : `Взимам issues на ${shortRepo(open)}…`;
  return issues.issues.length === 0 ? `${shortRepo(open)} няма отворени issues.` : null;
}

/** The Issue dashboard: a tab per repo in the top bar, and the open repo's issues on a board by stage. */
export function IssueDashboard({ issueRepos, fetched, issues, hues, repo, onRepo, topSlot, booted }: IssueDashboardProps) {
  const tabs = useMemo(() => issueTabs(issueRepos), [issueRepos]);
  const open = pickRepo(tabs, repo);
  // Only the open repo's issues: the state of the repo left behind shows until the new one comes.
  const shown = issues && open && issues.repo.toLowerCase() === open.toLowerCase() ? issues : null;
  const columns = useMemo(() => (shown ? issueColumns(shown) : []), [shown]);
  const hue = open ? repoHue(hues, open) : 0;
  const note = shownOfTotal(shown);
  return (
    <>
      {topSlot && tabs.length
        ? createPortal(
            <IssueTabs
              tabs={tabs.map((r) => ({ repo: r, name: shortRepo(r), hue: repoHue(hues, r), note: r === open ? note : null }))}
              open={open}
              onOpen={onRepo}
            />,
            topSlot,
          )
        : null}
      <Board columns={columns} booted={booted} message={boardMessage(open, fetched, shown)}>
        {(column) => column.items.map((issue, index) => <IssueCard key={`${issue.repo}#${issue.number}`} issue={issue} hue={hue} index={index} />)}
      </Board>
    </>
  );
}
