import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MenuItemConstructorOptions } from "electron";

/** The flag the autostart entry starts the app with: no window, only the tray icon. */
export const HIDDEN = "--hidden";

/** The XDG autostart entry that starts the installed app at login, hidden in the tray. */
export function autostartEntry(): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=WorkDash",
    `Exec=/usr/bin/workdash ${HIDDEN}`,
    "Icon=workdash",
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

/** Where login sessions look for autostart entries: `$XDG_CONFIG_HOME/autostart`, by default `~/.config/autostart`. */
export function autostartDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "autostart");
}

function entryPath(dir: string): string {
  return join(dir, "workdash.desktop");
}

/** Whether the app starts at login: read from the entry in `dir` itself, so it is never stored anywhere else. */
export function startsAtLogin(dir: string): boolean {
  return existsSync(entryPath(dir));
}

/** Writes the autostart entry into `dir` (switched on) or removes it (switched off). */
export function setStartsAtLogin(dir: string, on: boolean): void {
  if (on) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(entryPath(dir), autostartEntry());
  } else {
    rmSync(entryPath(dir), { force: true });
  }
}

/** The tray's "Стартирай при вход" checkbox: ticked while the entry in `dir` exists; a click writes or removes it. */
export function loginSwitch(dir: string, refresh: () => void): MenuItemConstructorOptions {
  return {
    label: "Стартирай при вход",
    type: "checkbox",
    checked: startsAtLogin(dir),
    click: (item) => {
      try {
        setStartsAtLogin(dir, item.checked);
      } finally {
        // Also when the write failed, so the checkbox goes back to what is on disk.
        refresh();
      }
    },
  };
}
