// Desktop notifications for the events the server pushes. Shown through the service worker when
// there is one (sw.js opens `data.url` on click), otherwise with a plain `new Notification`.

import type { PrEvent } from "../../src/domain/events.js";
import { serviceWorkerRegistration } from "./serviceWorker.js";

export type { PrEvent };

export type PermissionState = NotificationPermission | "unsupported";

const browserNotification = typeof Notification === "undefined" ? undefined : Notification;

function whatHappened(event: PrEvent): string {
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
