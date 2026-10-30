import { useEffect, useState } from "preact/hooks";
import { acknowledgeNotifications } from "./api.js";
import {
  type Missed,
  mergeMissed,
  notificationPermission,
  type PermissionState,
  requestNotificationPermission,
  showMissedNotification,
  showNotification,
} from "./notifications.js";
import { useServerEvent } from "./useServerEvents.js";

export type NotificationsView = {
  permission: PermissionState;
  /** Asks the browser for permission; call it from a click. */
  enable(): void;
  /** The missed events the server handed over, listed until dismissed; null when there are none. */
  missed: Missed | null;
  dismissMissed(): void;
};

/** Shows a desktop notification per pushed event and one for the missed events, which stay listed until dismissed. */
export function useNotifications(): NotificationsView {
  const [permission, setPermission] = useState<PermissionState>(() => notificationPermission());
  const [missed, setMissed] = useState<Missed | null>(null);

  // Unacknowledged events come back in the next missed summary, e.g. while notifications are not allowed.
  useServerEvent("notification", (event) => {
    showNotification(event)
      .then((shown) => (shown ? acknowledgeNotifications([event.id]) : undefined))
      .catch((error: Error) => console.error(`notification failed: ${error.message}`));
  });

  useServerEvent("missed", ({ quiet, ...summary }) => {
    setMissed((shown) => mergeMissed(shown, summary));
    if (quiet) return;
    showMissedNotification(summary).catch((error: Error) => console.error(`notification failed: ${error.message}`));
  });

  // The permission can change in the browser's site settings while the page is open.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions) return;
    let status: PermissionStatus | undefined;
    const update = () => setPermission(notificationPermission());
    navigator.permissions
      .query({ name: "notifications" })
      .then((result) => {
        status = result;
        status.addEventListener("change", update);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", update);
  }, []);

  const enable = () => {
    requestNotificationPermission()
      .then(setPermission)
      .catch((error: Error) => console.error(`notification permission failed: ${error.message}`));
  };
  return { permission, enable, missed, dismissMissed: () => setMissed(null) };
}
