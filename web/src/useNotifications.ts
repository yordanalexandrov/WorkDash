import { useEffect, useState } from "preact/hooks";
import { notificationPermission, type PermissionState, requestNotificationPermission, showNotification } from "./notifications.js";
import { useServerEvent } from "./useServerEvents.js";

export type NotificationsView = {
  permission: PermissionState;
  /** Asks the browser for permission; call it from a click. */
  enable(): void;
};

/** Shows a desktop notification for every event the server pushes, once the browser allows it. */
export function useNotifications(): NotificationsView {
  const [permission, setPermission] = useState<PermissionState>(() => notificationPermission());

  useServerEvent("notification", (event) => {
    showNotification(event).catch((error: Error) => console.error(`notification failed: ${error.message}`));
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
  return { permission, enable };
}
