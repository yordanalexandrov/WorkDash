import { join } from "node:path";
import { app, BrowserWindow, screen, shell } from "electron";
import { linkTarget } from "./links.js";
import { loadWindowState, saveWindowState } from "./window-state.js";

function stateFile(): string {
  return join(app.getPath("userData"), "window-state.json");
}

/** The app's icon, for the window and the tray. */
export function appIcon(): string {
  return join(app.getAppPath(), "..", "web", "public", "icons", "icon-512.png");
}

/**
 * Opens the dashboard at `url` in a window that comes back at its last size and position, and keeps other sites out of
 * it. Closing it only hides it, so the page goes on polling and notifying, unless the app is quitting.
 */
export function openWindow(url: string, quitting: () => boolean): BrowserWindow {
  const state = loadWindowState(
    stateFile(),
    screen.getAllDisplays().map((display) => display.workArea),
  );
  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 480,
    minHeight: 360,
    title: "WorkDash",
    icon: appIcon(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // SSE and notifications keep going while the window is hidden or in the background.
      backgroundThrottling: false,
    },
  });
  if (state.maximized) window.maximize();
  window.once("ready-to-show", () => window.show());

  window.on("close", (event) => {
    saveWindowState(stateFile(), { ...window.getNormalBounds(), maximized: window.isMaximized() });
    if (quitting()) return;
    event.preventDefault();
    window.hide();
  });

  // Links to GitHub, Jira and the rest open in the default browser; the window only ever shows the dashboard.
  const toBrowser = (link: string) => {
    if (linkTarget(link, url) === "browser") void shell.openExternal(link);
  };
  window.webContents.setWindowOpenHandler(({ url: link }) => {
    toBrowser(link);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => {
    if (linkTarget(event.url, url) === "window") return;
    event.preventDefault();
    toBrowser(event.url);
  });

  void window.loadURL(url);
  return window;
}

/** Brings the window to the front, out of the taskbar or from behind other windows. */
export function showWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
