import { app, Menu, nativeImage, type MenuItemConstructorOptions, Tray } from "electron";
import { trayTooltip, withDot } from "./tray-look.js";
import { type TrayActions, trayMenu } from "./tray-menu.js";
import { appIcon } from "./resources.js";

/** Panels draw the icon at 16 to 24 pixels; a larger bitmap stays sharp on HiDPI ones. */
const ICON_SIZE = 64;

export type TrayOptions = TrayActions & {
  /** The switches between "Отвори" and "Изход", read again on every `refresh()` so checkboxes show their state. */
  switches?: () => MenuItemConstructorOptions[];
};

/** The desktop app's tray icon. */
export type WorkDashTray = {
  /** Shows how many PRs wait on me: in the tooltip, as a dot on the icon above 0, and as the number on the dock icon. */
  showCount(count: number): void;
  /** Says in the tooltip whether the notification pause is on. */
  showPaused(paused: boolean): void;
  /** Builds the menu again, after a switch changed. */
  refresh(): void;
};

/** Puts the icon in the tray (an AppIndicator on Ubuntu, the panel's tray on Cinnamon) with its menu. */
export function openTray(options: TrayOptions): WorkDashTray {
  const plain = nativeImage.createFromPath(appIcon()).resize({ width: ICON_SIZE, height: ICON_SIZE, quality: "best" });
  const dotted = nativeImage.createFromBitmap(withDot(plain.toBitmap(), ICON_SIZE), { width: ICON_SIZE, height: ICON_SIZE });

  const tray = new Tray(plain);
  const refresh = () => tray.setContextMenu(Menu.buildFromTemplate(trayMenu(options, options.switches?.() ?? [])));
  refresh();
  // Where the tray handles a click itself (not on AppIndicator, which only opens the menu), it opens the window.
  tray.on("click", () => options.open());

  let shown: number | undefined;
  let paused = false;
  return {
    showCount(count) {
      if (count === shown) return;
      if (shown === undefined || (count > 0) !== (shown > 0)) tray.setImage(count > 0 ? dotted : plain);
      shown = count;
      tray.setToolTip(trayTooltip(count, paused));
      app.setBadgeCount(count);
    },
    showPaused(next) {
      paused = next;
      tray.setToolTip(trayTooltip(shown ?? 0, paused));
    },
    refresh,
  };
}
