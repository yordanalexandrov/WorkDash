import { join } from "node:path";

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
