import { join } from "node:path";
import { app, BrowserWindow, ipcMain, type IpcMainEvent, screen, shell } from "electron";
import { SHOW_WINDOW } from "./ipc.js";
import { linkTarget } from "./links.js";
import { allowsPermission } from "./permissions.js";
import { appIcon } from "./resources.js";
import { loadWindowState, saveWindowState } from "./window-state.js";

function stateFile(): string {
  return join(app.getPath("userData"), "window-state.json");
}

/**
 * Opens the dashboard at `url` in a window that comes back at its last size and position, and keeps other sites out of
 * it. Closing it only hides it, so the page goes on polling and notifying, unless the app is quitting. A `hidden` window
 * (started at login) loads the page but stays out of sight until the tray or a second start shows it.
 */
export function openWindow(url: string, quitting: () => boolean, hidden = false): BrowserWindow {
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
      // Built next to main.cjs by `npm run build:desktop`.
      preload: join(app.getAppPath(), "dist", "preload.cjs"),
      // SSE and notifications keep going while the window is hidden or in the background.
      backgroundThrottling: false,
    },
  });
  // maximize() also shows the window, so a hidden one maximizes when it is first shown.
  if (state.maximized) {
    if (hidden) window.once("show", () => window.maximize());
    else window.maximize();
  }
  if (!hidden) window.once("ready-to-show", () => window.show());

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

  // The page's web notifications show as native ones; it may ask for nothing else.
  const session = window.webContents.session;
  session.setPermissionRequestHandler((_contents, permission, callback) => callback(allowsPermission(permission)));
  session.setPermissionCheckHandler((_contents, permission) => allowsPermission(permission));

  // A click on the missed summary shows the window, also when it is hidden.
  const onShowWindow = (event: IpcMainEvent) => {
    if (event.sender === window.webContents) showWindow(window);
  };
  ipcMain.on(SHOW_WINDOW, onShowWindow);
  window.once("closed", () => ipcMain.off(SHOW_WINDOW, onShowWindow));

  void window.loadURL(url);
  return window;
}

/** Brings the window to the front, out of the taskbar or from behind other windows. */
export function showWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
