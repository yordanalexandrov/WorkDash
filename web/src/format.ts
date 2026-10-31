import type { DashboardState, PollError, PollMode, Section } from "./api.js";
import { rateLimitLiftsAt } from "../../src/domain/poll-mode.js";
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

/** The repo's name without its owner: "my-org/repo-a" → "repo-a". */
export function shortRepo(repo: string): string {
  return repo.slice(repo.indexOf("/") + 1);
}

/** How long ago `since` was, in whole hours under a day and whole days after that. */
export function age(since: string, now: Date = new Date()): string {
  const hours = Math.floor((now.getTime() - new Date(since).getTime()) / 3_600_000);
  if (hours < 1) return "<1ч";
  if (hours < 24) return `${hours}ч`;
  return `${Math.floor(hours / 24)}д`;
}

/** In On-demand, how old the last poll may get before the header says the board is stale. */
const STALE_MS = 3_600_000;

/** The header line, and whether it should say the board is stale. */
export type Status = { text: string; stale: boolean };

/**
 * The header line: who the dashboard is for and how fresh it is. `state` is null before the server answers.
 * In On-demand nothing polls until I ask, so it says how long ago the last poll was, and that it is stale after an hour.
 */
export function statusText(state: DashboardState | null, now: Date): Status {
  if (!state) return { text: "Зареждане…", stale: false };
  if (!state.fetchedAt) return { text: "Чака първия poll…", stale: false };
  if (state.pollMode === "periodic") return { text: `${state.viewer} · последен успешен poll в ${new Date(state.fetchedAt).toLocaleTimeString()}`, stale: false };
  const ago = now.getTime() - Date.parse(state.fetchedAt);
  return { text: `${state.viewer} · последен poll ${agoText(ago)}`, stale: ago >= STALE_MS };
}

/** "току-що" under a minute, then whole minutes, hours, days. */
function agoText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "току-що";
  if (minutes < 60) return `преди ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `преди ${hours} ч` : `преди ${Math.floor(hours / 24)} д`;
}

/** "Обнови", held back while a rate limit lasts: no poll can start before it lifts. */
export function pollButton(state: DashboardState | null, now: Date): { label: string; disabled: boolean } {
  const resetAt = rateLimitLiftsAt(state?.error ?? null, now);
  if (!resetAt) return { label: "Обнови", disabled: false };
  return { label: `Обнови (след ${new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`, disabled: true };
}

/** The error banner, or null when there is nothing to report; a lost server outranks a failed poll. */
export function errorText(state: DashboardState | null, stream: StreamStatus): string | null {
  if (stream === "reconnecting") return "Няма връзка със сървъра, свързване отново…";
  if (state?.error) return pollErrorText(state.error, state.pollMode);
  return state?.problems.length ? `Последният poll е непълен: ${state.problems.join("; ")}` : null;
}

function pollErrorText({ kind, message, resetAt }: PollError, mode: PollMode): string {
  switch (kind) {
    case "auth":
      return `GitHub отказва токена (невалиден или изтекъл): ${message}`;
    case "rate_limit":
      if (resetAt && mode === "on_demand") return `Изчерпан rate limit на GitHub, „Обнови“ работи пак от ${new Date(resetAt).toLocaleTimeString()}`;
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

/** The poll interval for the poll mode toggle: seconds up to two minutes, then whole minutes or hours. */
export function intervalText(ms: number): string {
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) return `${ms / 3_600_000} ч`;
  if (ms >= 120_000 && ms % 60_000 === 0) return `${ms / 60_000} мин`;
  return `${Math.round(ms / 1000)}s`;
}
