import type { CiState } from "../domain/types.js";

/** One entry of a commit's statusCheckRollup: a GitHub Checks run or a legacy commit status. */
export type CheckContext =
  | {
      __typename: "CheckRun";
      name: string;
      status: string;
      conclusion: string | null;
      checkSuite: { app: { slug: string } | null } | null;
    }
  | { __typename: "StatusContext"; context: string; state: CiState };

const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

function stateOf(check: CheckContext): CiState {
  if (check.__typename === "StatusContext") return check.state;
  if (check.status !== "COMPLETED" || check.conclusion === null || check.conclusion === "STALE") return "PENDING";
  return PASSING_CONCLUSIONS.has(check.conclusion) ? "SUCCESS" : "FAILURE";
}

/** Combines checks the way GitHub's rollup does: a failure wins over pending, pending over success. */
function rollUp(checks: CheckContext[]): CiState | null {
  if (checks.length === 0) return null;
  const states = new Set(checks.map(stateOf));
  for (const state of ["FAILURE", "ERROR", "PENDING", "EXPECTED"] as const) {
    if (states.has(state)) return state === "EXPECTED" ? "PENDING" : state;
  }
  return "SUCCESS";
}

function isSonar(check: CheckContext): boolean {
  const name = check.__typename === "CheckRun" ? `${check.checkSuite?.app?.slug ?? ""} ${check.name}` : check.context;
  return /sonar/i.test(name);
}

/** Splits the head commit's checks into the build (CI) and the Sonar quality gate. */
export function summarizeChecks(checks: CheckContext[]): { ci: CiState | null; sonar: CiState | null } {
  return { ci: rollUp(checks.filter((check) => !isSonar(check))), sonar: rollUp(checks.filter(isSonar)) };
}
