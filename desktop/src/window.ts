import { join } from "node:path";
import { app, BrowserWindow, screen, shell } from "electron";
import { linkTarget } from "./links.js";
import { resources } from "./resources.js";
import { loadWindowState, saveWindowState } from "./window-state.js";

function stateFile(): string {
  return join(app.getPath("userData"), "window-state.json");
}

/** Opens the dashboard at `url` in a window that comes back at its last size and position, and keeps other sites out of it. */
export function openWindow(url: string): BrowserWindow {
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
    icon: resources({ packaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }).icon,
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

  window.on("close", () => {
    saveWindowState(stateFile(), { ...window.getNormalBounds(), maximized: window.isMaximized() });
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
