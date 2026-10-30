// Desktop notifications for the events the server pushes. Shown through the service worker when
// there is one (sw.js opens `data.url` on click), otherwise with a plain `new Notification`.

import type { EventType, PrEvent } from "../../src/domain/events.js";
import type { Missed } from "../../src/domain/notify.js";
import { serviceWorkerRegistration } from "./serviceWorker.js";

export type { Missed, PrEvent };

export type PermissionState = NotificationPermission | "unsupported";

const browserNotification = typeof Notification === "undefined" ? undefined : Notification;

/** What happened on the PR, in a few words. */
export function whatHappened(event: PrEvent): string {
  const who = event.actor;
  switch (event.type) {
    case "review_requested":
      return `${who} иска review от теб`;
    case "new_comment_on_my_pr":
      return `Нов коментар от ${who}`;
    case "review_on_my_pr":
      if (event.review === "APPROVED") return `${who} одобри`;
      if (event.review === "CHANGES_REQUESTED") return `${who} поиска промени`;
      return `${who} остави review`;
    case "ci_failed_on_my_pr":
      return "CI се провали";
    case "my_pr_ready_to_merge":
      return "Готов за merge";
    case "mention":
      return `${who} те спомена`;
    case "re_review_needed":
      return "Има ново след твоето review";
    case "team_pr_opened":
      return `${who} отвори PR`;
  }
}

/** The notification for an event: the PR's title, and what happened on which PR. */
export function notificationText(event: PrEvent): { title: string; body: string } {
  return { title: event.title, body: `${whatHappened(event)} · ${event.repo}#${event.number}` };
}

/** Whether the page may show notifications; "unsupported" when the browser has none. */
export function notificationPermission(NotificationApi: typeof Notification | undefined = browserNotification): PermissionState {
  return NotificationApi ? NotificationApi.permission : "unsupported";
}

/** Asks the browser for permission; must run from a click. */
export async function requestNotificationPermission(
  NotificationApi: typeof Notification | undefined = browserNotification,
): Promise<PermissionState> {
  return NotificationApi ? NotificationApi.requestPermission() : "unsupported";
}

/**
 * Shows a native notification for the event; clicking it opens the PR. The event id is the tag,
 * so two open tabs that both get the event show it once. False when it could not be shown.
 */
export async function showNotification(
  event: PrEvent,
  env: {
    Notification: typeof Notification | undefined;
    registration: Promise<ServiceWorkerRegistration | null>;
    open?: (url: string) => void;
  } = { Notification: browserNotification, registration: serviceWorkerRegistration() },
): Promise<boolean> {
  const { Notification: NotificationApi, open = (url) => window.open(url, "_blank") } = env;
  if (notificationPermission(NotificationApi) !== "granted") return false;
  const { title, body } = notificationText(event);
  const registration = await env.registration;
  if (registration) {
    await registration.showNotification(title, { body, tag: event.id, data: { url: event.url } });
    return true;
  }
  const notification = new NotificationApi!(title, { body, tag: event.id });
  notification.onclick = () => {
    open(event.url);
    notification.close();
  };
  return true;
}

/** Each event type in a summary, in the order the plan lists them. */
const MISSED_LABELS: Record<EventType, string> = {
  review_requested: "Искания за review",
  new_comment_on_my_pr: "Коментари",
  review_on_my_pr: "Review-та",
  ci_failed_on_my_pr: "Провален CI",
  my_pr_ready_to_merge: "Готови за merge",
  mention: "Споменавания",
  re_review_needed: "Ново след твое review",
  team_pr_opened: "Нови PR-и на екипа",
};

/** The summary notification for the missed events: how many, and how many of each kind. */
export function missedText(missed: Missed): { title: string; body: string } {
  const title = missed.total === 1 ? "1 пропуснато събитие" : `${missed.total} пропуснати събития`;
  const body = (Object.keys(MISSED_LABELS) as EventType[])
    .filter((type) => missed.byType[type])
    .map((type) => `${MISSED_LABELS[type]}: ${missed.byType[type]}`)
    .join(" · ");
  return { title, body };
}

/** Shows one notification that sums up the missed events; clicking it brings the dashboard forward. */
export async function showMissedNotification(
  missed: Missed,
  env: {
    Notification: typeof Notification | undefined;
    registration: Promise<ServiceWorkerRegistration | null>;
  } = { Notification: browserNotification, registration: serviceWorkerRegistration() },
): Promise<boolean> {
  const { Notification: NotificationApi } = env;
  if (notificationPermission(NotificationApi) !== "granted") return false;
  const { title, body } = missedText(missed);
  const registration = await env.registration;
  if (registration) {
    // No `data.url`: the service worker then focuses the dashboard, where the list is.
    await registration.showNotification(title, { body, tag: "missed" });
    return true;
  }
  const notification = new NotificationApi!(title, { body, tag: "missed" });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return true;
}

/** The missed events still listed with a later summary added on top: newest first, at most `limit` listed. */
export function mergeMissed(shown: Missed | null, next: Missed, limit: number): Missed {
  if (!shown) return next;
  const byType = { ...shown.byType };
  for (const [type, count] of Object.entries(next.byType) as [EventType, number][]) byType[type] = (byType[type] ?? 0) + count;
  const ids = new Set(next.events.map((event) => event.id));
  const events = [...next.events, ...shown.events.filter((event) => !ids.has(event.id))].slice(0, limit);
  return { total: shown.total + next.total, byType, events };
}
