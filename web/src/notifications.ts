// Desktop notifications for the events the server pushes.

import type { EventType, PrEvent } from "../../src/domain/events.js";
import type { Missed, MissedNotice } from "../../src/domain/notify.js";
import { desktopBridge } from "./desktop.js";
import { serviceWorkerRegistration } from "./serviceWorker.js";

export type { Missed, MissedNotice, PrEvent };

export type PermissionState = NotificationPermission | "unsupported";

const browserNotification = typeof Notification === "undefined" ? undefined : Notification;

/** Per event type: what happened, in a few words, and its label in a missed summary, in the order the plan lists them. */
const EVENT_TEXT: Record<EventType, { what: (event: PrEvent) => string; missed: string }> = {
  review_requested: { what: (e) => `${e.actor} иска review от теб`, missed: "Искания за review" },
  new_comment_on_my_pr: { what: (e) => `Нов коментар от ${e.actor}`, missed: "Коментари" },
  review_on_my_pr: {
    what: (e) =>
      e.review === "APPROVED" ? `${e.actor} одобри` : e.review === "CHANGES_REQUESTED" ? `${e.actor} поиска промени` : `${e.actor} остави review`,
    missed: "Review-та",
  },
  ci_failed_on_my_pr: { what: () => "CI се провали", missed: "Провален CI" },
  my_pr_ready_to_merge: { what: () => "Готов за merge", missed: "Готови за merge" },
  mention: { what: (e) => `${e.actor} те спомена`, missed: "Споменавания" },
  re_review_needed: { what: () => "Има ново след твоето review", missed: "Ново след твое review" },
  team_pr_opened: { what: (e) => `${e.actor} отвори PR`, missed: "Нови PR-и на екипа" },
};

/** The name of an event type, as a missed summary and the Settings screen list it. */
export function eventLabel(type: EventType): string {
  return EVENT_TEXT[type].missed;
}

/** What happened on the PR, in a few words. */
export function whatHappened(event: PrEvent): string {
  return EVENT_TEXT[event.type].what(event);
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

type NotificationEnv = {
  Notification: typeof Notification | undefined;
  registration: Promise<ServiceWorkerRegistration | null>;
  open?: (url: string) => void;
  /** Brings the dashboard forward; in the desktop app it also shows the hidden window. */
  focus?: () => void;
};

const browserEnv = (): NotificationEnv => ({
  Notification: browserNotification,
  registration: serviceWorkerRegistration(),
  ...(desktopBridge && { focus: desktopBridge.showWindow }),
});

/** Shows a notification via the service worker, else `new Notification`; a click opens `url` or the dashboard. */
async function show(env: NotificationEnv, title: string, options: { body: string; tag: string }, url?: string): Promise<boolean> {
  const { Notification: NotificationApi, open = (target) => window.open(target, "_blank"), focus = () => window.focus() } = env;
  if (notificationPermission(NotificationApi) !== "granted") return false;
  const registration = await env.registration;
  if (registration) {
    await registration.showNotification(title, url ? { ...options, data: { url } } : options);
    return true;
  }
  const notification = new NotificationApi!(title, options);
  notification.onclick = () => {
    if (url) open(url);
    else focus();
    notification.close();
  };
  return true;
}

/** Shows a notification for the event that opens the PR; the event id as tag shows it once across tabs. */
export function showNotification(event: PrEvent, env: NotificationEnv = browserEnv()): Promise<boolean> {
  const { title, body } = notificationText(event);
  return show(env, title, { body, tag: event.id }, event.url);
}

/** The summary notification for the missed events: how many, and how many of each kind. */
export function missedText(missed: Missed): { title: string; body: string } {
  const title = missed.total === 1 ? "1 пропуснато събитие" : `${missed.total} пропуснати събития`;
  const body = (Object.keys(EVENT_TEXT) as EventType[])
    .filter((type) => missed.byType[type])
    .map((type) => `${EVENT_TEXT[type].missed}: ${missed.byType[type]}`)
    .join(" · ");
  return { title, body };
}

/** Shows one notification that sums up the missed events; clicking it brings the dashboard forward. */
export function showMissedNotification(missed: Missed, env: NotificationEnv = browserEnv()): Promise<boolean> {
  const { title, body } = missedText(missed);
  return show(env, title, { body, tag: "missed" });
}

/** The missed events still listed with a later summary added on top, newest first. */
export function mergeMissed(shown: Missed | null, next: Missed): Missed {
  if (!shown) return next;
  const byType = { ...shown.byType };
  for (const [type, count] of Object.entries(next.byType) as [EventType, number][]) byType[type] = (byType[type] ?? 0) + count;
  const ids = new Set(next.events.map((event) => event.id));
  const events = [...next.events, ...shown.events.filter((event) => !ids.has(event.id))];
  return { total: shown.total + next.total, byType, events };
}
