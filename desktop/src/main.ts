import { app, dialog, Menu, type BrowserWindow } from "electron";
import type { WorkDash } from "../../src/workdash.js";
import { startServer } from "./server.js";
import { openWindow, showWindow } from "./window.js";

// The desktop app: the dashboard's server in this process, its page in a window (ADR 0002).

let workdash: WorkDash | undefined;
let window: BrowserWindow | undefined;

if (!app.requestSingleInstanceLock()) {
  // Already running: the first instance shows its window (below), this one leaves.
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (window && !window.isDestroyed()) showWindow(window);
  });

  Menu.setApplicationMenu(null);

  void app.whenReady().then(async () => {
    try {
      workdash = await startServer();
    } catch (error) {
      dialog.showErrorBox("WorkDash не тръгна", error instanceof Error ? error.message : String(error));
      app.exit(1);
      return;
    }
    window = openWindow(workdash.url);
  });

  // Closing the window ends the app.
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
