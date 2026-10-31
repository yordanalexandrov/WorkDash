// Runs in the window's sandboxed preload: tells the page it is in the desktop app and lets it show the window
// (web/src/desktop.ts). Built on its own to dist/preload.cjs, since a sandboxed preload can only require "electron".
import { contextBridge, ipcRenderer } from "electron";
import { SHOW_WINDOW } from "./ipc.js";

contextBridge.exposeInMainWorld("workdash", {
  desktop: true,
  showWindow: () => ipcRenderer.send(SHOW_WINDOW),
});
