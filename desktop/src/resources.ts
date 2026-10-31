import { join } from "node:path";
import { app } from "electron";

/** Where the app runs from: Electron's `app.isPackaged`, `app.getAppPath()` and `process.resourcesPath`. */
export type AppLocation = { packaged: boolean; appPath: string; resourcesPath: string };

/**
 * The page and its assets (`webRoot`, holding `public/` and `dist/`) and the window's icon. From the repository they
 * are `web/` next to `desktop/`; the deb copies `web/public` and `web/dist` into the app's resources (electron-builder.yml).
 */
export function resources({ packaged, appPath, resourcesPath }: AppLocation): { webRoot: string; icon: string } {
  const webRoot = packaged ? join(resourcesPath, "web") : join(appPath, "..", "web");
  return { webRoot, icon: join(webRoot, "public", "icons", "icon-512.png") };
}

/** `resources()` for this running app: from the repository or from the installed app's resources. */
export function appResources(): { webRoot: string; icon: string } {
  return resources({ packaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath });
}

/** The app's icon, for the window and the tray. */
export function appIcon(): string {
  return appResources().icon;
}
