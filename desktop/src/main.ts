import { app, dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import type { WorkDash } from "../../src/workdash.js";
import { autostartDir, HIDDEN, loginSwitch } from "./autostart.js";
import { startServer } from "./server.js";
import { openTray, type WorkDashTray } from "./tray.js";
import { openWindow, showWindow } from "./window.js";

// The desktop app: the dashboard's server in this process, its page in a window (ADR 0002).

let workdash: WorkDash | undefined;
let window: BrowserWindow | undefined;
let tray: WorkDashTray | undefined;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  // Already running: the first instance shows its window (below), this one leaves.
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (window && !window.isDestroyed()) showWindow(window);
  });

  Menu.setApplicationMenu(null);

  /** "Пауза на нотификациите": holds notifications back until switched off; not kept across a restart. */
  const pauseSwitch = (): MenuItemConstructorOptions => ({
    label: "Пауза на нотификациите",
    type: "checkbox",
    checked: workdash?.paused() ?? false,
    click: (item) => {
      workdash?.setPaused(item.checked);
      tray?.showPaused(item.checked);
      tray?.refresh();
    },
  });

  void app.whenReady().then(async () => {
    try {
      workdash = await startServer();
    } catch (error) {
      dialog.showErrorBox("WorkDash не тръгна", error instanceof Error ? error.message : String(error));
      app.exit(1);
      return;
    }
    window = openWindow(workdash.url, () => quitting, process.argv.includes(HIDDEN));
    tray = openTray({
      open: () => {
        if (window && !window.isDestroyed()) showWindow(window);
      },
      quit: () => app.quit(),
      switches: () => [
        pauseSwitch(),
        loginSwitch(autostartDir(), () => tray?.refresh()),
      ],
    });
    workdash.onWaitingOnMe((count) => tray?.showCount(count));
  });

  // Closing the window only hides it; the app ends from the tray's "Изход" (or a signal), which closes the window for good.
  app.on("before-quit", () => (quitting = true));
  app.on("window-all-closed", () => app.quit());

  // Stop the poller, the watcher and the server and close the database before leaving.
  let closing = false;
  app.on("will-quit", (event) => {
    if (!workdash) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void workdash.close().finally(() => app.exit(0));
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => app.quit());
}
