import type { StreamStatus } from "../events.js";
import type { NotificationsView } from "../useNotifications.js";
import { NotificationPermissionView } from "./NotificationPermissionView.js";

/** The sticky bar: the name with a dot for the server connection, how fresh the board is, and the notification permission. */
export function TopBar({ status, stream, notifications }: { status: string; stream: StreamStatus; notifications: NotificationsView }) {
  return (
    <header class="top">
      <h1>
        <span class={`live ${stream === "open" ? "ok" : "pending"}`} title={stream === "open" ? "Свързан със сървъра" : "Свързване…"} />
        WorkDash
      </h1>
      <p class="status">{status}</p>
      <NotificationPermissionView {...notifications} />
    </header>
  );
}
