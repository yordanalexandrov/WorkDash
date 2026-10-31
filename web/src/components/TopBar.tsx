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
  children?: ComponentChildren;
};

/**
 * The sticky bar: the name with a dot for the server connection, the view toggle, how fresh the board is, the poll mode
 * and "Обнови", the notification permission; the toolbar below.
 */
export function TopBar({ status, stream, notifications, toggle, pollControls, children }: TopBarProps) {
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
      {children}
    </header>
  );
}
