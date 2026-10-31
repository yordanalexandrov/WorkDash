import { createPortal } from "preact/compat";
import { useMemo } from "preact/hooks";
import { issueTabs, pickRepo } from "../dashboard.js";
import { shortRepo } from "../format.js";
import { repoHue } from "../palette.js";
import { Board } from "./Board.js";
import { IssueTabs } from "./IssueTabs.js";

type IssueDashboardProps = {
  /** The followed repos whose issues are on, as the last poll read them. */
  issueRepos: string[];
  /** Whether a poll has fetched them, so no tabs means no repo has issues rather than not known yet. */
  fetched: boolean;
  /** The project colours, shared with the PR dashboard so a repo has one colour on both. */
  hues: Map<string, number>;
  /** The repo the URL asks for; the first tab opens when it has none. */
  repo: string | null;
  onRepo(repo: string): void;
  /** Where in the top bar the tabs go, below the toggles. */
  topSlot: HTMLElement | null;
  booted: boolean;
};

/** The Issue dashboard: a tab per repo in the top bar and the open repo's board, empty until stages come. */
export function IssueDashboard({ issueRepos, fetched, hues, repo, onRepo, topSlot, booted }: IssueDashboardProps) {
  const tabs = useMemo(() => issueTabs(issueRepos), [issueRepos]);
  const open = pickRepo(tabs, repo);
  const message = open ? `Issues на ${shortRepo(open)} идват скоро.` : fetched ? "Нито едно repo няма включени issues." : null;
  return (
    <>
      {topSlot && tabs.length
        ? createPortal(
            <IssueTabs tabs={tabs.map((r) => ({ repo: r, name: shortRepo(r), hue: repoHue(hues, r) }))} open={open} onOpen={onRepo} />,
            topSlot,
          )
        : null}
      <Board columns={[]} booted={booted} message={message}>
        {() => null}
      </Board>
    </>
  );
}
