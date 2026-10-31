import type { MenuItemConstructorOptions } from "electron";

/** What the tray's fixed items do. */
export type TrayActions = { open(): void; quit(): void };

/**
 * The tray's menu: "Отвори", then the switches other features add (notification pause, start at login), then "Изход".
 * Without switches there is one separator only.
 */
export function trayMenu(actions: TrayActions, switches: MenuItemConstructorOptions[] = []): MenuItemConstructorOptions[] {
  return [
    { label: "Отвори", click: () => actions.open() },
    { type: "separator" },
    ...(switches.length > 0 ? [...switches, { type: "separator" as const }] : []),
    { label: "Изход", click: () => actions.quit() },
  ];
}
