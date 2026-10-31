import type { NotificationsView } from "../useNotifications.js";

/** Asks to turn desktop notifications on, or says why there are none; nothing once they are on. */
export function NotificationPermissionView({ permission, enable }: NotificationsView) {
  if (permission === "granted") return null;
  if (permission === "default") {
    return (
      <button type="button" id="notifications" class="chip" onClick={enable}>
        Включи нотификациите
      </button>
    );
  }
  return (
    <p id="notifications" class="off">
      {permission === "denied"
        ? "Нотификациите са забранени за тази страница. Разреши ги от настройките на сайта в браузъра."
        : "Браузърът не поддържа нотификации."}
    </p>
  );
}
