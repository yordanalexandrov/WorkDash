import type { DashboardState, PollError, Section } from "./api.js";
import type { StreamStatus } from "./events.js";

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
  return state.fetchedAt ? `${state.viewer} · последен успешен poll в ${new Date(state.fetchedAt).toLocaleTimeString()}` : "Чака първия poll…";
}

/** The error banner, or null when there is nothing to report; a lost server outranks a failed poll. */
export function errorText(state: DashboardState | null, stream: StreamStatus): string | null {
  if (stream === "reconnecting") return "Няма връзка със сървъра, свързване отново…";
  if (state?.error) return pollErrorText(state.error);
  return state?.problems.length ? `Последният poll е непълен: ${state.problems.join("; ")}` : null;
}

function pollErrorText({ kind, message, resetAt }: PollError): string {
  switch (kind) {
    case "auth":
      return `GitHub отказва токена (невалиден или изтекъл): ${message}`;
    case "rate_limit":
      return resetAt
        ? `Изчерпан rate limit на GitHub, нов опит в ${new Date(resetAt).toLocaleTimeString()}`
        : `Изчерпан rate limit на GitHub: ${message}`;
    case "unreachable":
      return `GitHub е недостъпен: ${message}`;
    default:
      return `Последният poll е неуспешен: ${message}`;
  }
}

/** The banner for a config.yaml edit the server rejected, or null when the file on disk is in effect. */
export function configErrorText(state: DashboardState | null): string | null {
  return state?.configError ? `config.yaml не е приложен, в сила е последната валидна конфигурация. ${state.configError}` : null;
}
