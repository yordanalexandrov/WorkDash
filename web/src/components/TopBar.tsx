import type { ComponentChildren } from "preact";
import type { StreamStatus } from "../events.js";
import type { Status } from "../format.js";
import type { NotificationsView } from "../useNotifications.js";
import { NotificationPermissionView } from "./NotificationPermissionView.js";

type TopBarProps = {
  status: Status;
  stream: StreamStatus;
  notifications: NotificationsView;
  /** The view toggle, next to the name. */
  toggle?: ComponentChildren;
  /** The poll mode toggle and "Обнови", after how fresh the board is. */
  pollControls?: ComponentChildren;
  /** Whether the Settings screen is open, and the gear that opens and closes it. */
  settings: { open: boolean; onToggle(): void };
  children?: ComponentChildren;
};

/**
 * The sticky bar: the name with a dot for the server connection, the view toggle, how fresh the board is, the poll mode
 * and "Обнови", the notification permission, the gear for Settings; the toolbar below.
 */
export function TopBar({ status, stream, notifications, toggle, pollControls, settings, children }: TopBarProps) {
  return (
    <header class="top">
      <h1>
        <span class={`live ${stream === "open" ? "ok" : "pending"}`} title={stream === "open" ? "Свързан със сървъра" : "Свързване…"} />
        WorkDash
      </h1>
      {toggle}
      <p class={`status${status.stale ? " stale" : ""}`}>{status.text}</p>
      {pollControls}
      <NotificationPermissionView {...notifications} />
      <button
        type="button"
        class={`chip gear${settings.open ? " on" : ""}`}
        aria-pressed={settings.open}
        aria-label="Настройки"
        title="Настройки"
        onClick={settings.onToggle}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {children}
    </header>
  );
}
