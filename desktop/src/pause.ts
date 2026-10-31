import type { MenuItemConstructorOptions } from "electron";
import type { WorkDash } from "../../src/workdash.js";

/**
 * The tray's "Пауза на нотификациите" checkbox: holds notifications back until switched off, like quiet hours; not
 * kept across a restart. A click switches the pause and calls `changed` with its new state.
 */
export function pauseSwitch(pause: Pick<WorkDash, "paused" | "setPaused">, changed: (paused: boolean) => void): MenuItemConstructorOptions {
  return {
    label: "Пауза на нотификациите",
    type: "checkbox",
    checked: pause.paused(),
    click: (item) => {
      pause.setPaused(item.checked);
      changed(item.checked);
    },
  };
}
