import type { DashboardState, Section } from "./api.js";

const SECTION_TITLES: Record<Section, string> = {
  waiting_on_me: "Чака теб",
  free_for_review: "Свободни за review",
  ready_to_merge: "Готови за merge",
  waiting_on_others: "Чакат други",
  team: "Екипът",
};

export function sectionTitle(section: Section): string {
  return SECTION_TITLES[section] ?? section;
}

/** How long ago `since` was, in whole hours under a day and whole days after that. */
export function age(since: string, now: Date = new Date()): string {
  const hours = Math.floor((now.getTime() - new Date(since).getTime()) / 3_600_000);
  if (hours < 1) return "<1ч";
  if (hours < 24) return `${hours}ч`;
  return `${Math.floor(hours / 24)}д`;
}

/** The header line: who the dashboard is for and how fresh it is. `state` is null before the server answers. */
export function statusText(state: DashboardState | null): string {
  if (!state) return "Зареждане…";
  return state.fetchedAt ? `${state.viewer} · обновено ${new Date(state.fetchedAt).toLocaleTimeString()}` : "Чака първия poll…";
}

/** The error banner, or null when there is nothing to report; a lost server outranks a failed poll. */
export function errorText(state: DashboardState | null, connectionError: string | null): string | null {
  if (connectionError) return `Няма връзка със сървъра: ${connectionError}`;
  return state?.error ? `Последният poll е неуспешен: ${state.error}` : null;
}
