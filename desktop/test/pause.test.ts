import type { MenuItem } from "electron";
import { describe, expect, it, vi } from "vitest";
import { pauseSwitch } from "../src/pause.js";

function fakePause(initially: boolean) {
  let paused = initially;
  return { paused: () => paused, setPaused: (next: boolean) => (paused = next) };
}

const clicked = (checked: boolean) => ({ checked }) as MenuItem;

describe("the tray's notification pause switch", () => {
  it("is ticked while notifications are paused", () => {
    expect(pauseSwitch(fakePause(false), () => {})).toMatchObject({ label: "Пауза на нотификациите", type: "checkbox", checked: false });
    expect(pauseSwitch(fakePause(true), () => {}).checked).toBe(true);
  });

  it("pauses and resumes notifications on a click, then says what changed", () => {
    const pause = fakePause(false);
    const changed = vi.fn();
    pauseSwitch(pause, changed).click?.(clicked(true), undefined, {} as never);
    expect(pause.paused()).toBe(true);
    pauseSwitch(pause, changed).click?.(clicked(false), undefined, {} as never);
    expect(pause.paused()).toBe(false);
    expect(changed.mock.calls).toEqual([[true], [false]]);
  });
});
