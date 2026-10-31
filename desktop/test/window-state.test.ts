import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOW_STATE, loadWindowState, saveWindowState } from "../src/window-state.js";

const screen = [{ x: 0, y: 0, width: 1920, height: 1080 }];

function stateFile(contents?: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "workdash-window-")), "window-state.json");
  if (contents !== undefined) writeFileSync(path, contents);
  return path;
}

describe("the window's size and position", () => {
  it("starts at the default size, centred, the first time", () => {
    expect(loadWindowState(stateFile(), screen)).toEqual(DEFAULT_WINDOW_STATE);
    expect(DEFAULT_WINDOW_STATE).toEqual({ width: 1280, height: 800, maximized: false });
  });

  it("comes back where it was left", () => {
    const path = stateFile();
    saveWindowState(path, { x: 100, y: 50, width: 1000, height: 700, maximized: true });
    expect(loadWindowState(path, screen)).toEqual({ x: 100, y: 50, width: 1000, height: 700, maximized: true });
  });

  it("keeps the size but lets the window be centred when it was left on a screen that is gone", () => {
    const path = stateFile();
    saveWindowState(path, { x: 2500, y: 100, width: 1000, height: 700, maximized: false });
    expect(loadWindowState(path, screen)).toEqual({ width: 1000, height: 700, maximized: false });
  });

  it("finds it on a second screen", () => {
    const path = stateFile();
    saveWindowState(path, { x: 2500, y: 100, width: 1000, height: 700, maximized: false });
    const twoScreens = [...screen, { x: 1920, y: 0, width: 2560, height: 1440 }];
    expect(loadWindowState(path, twoScreens)).toEqual({ x: 2500, y: 100, width: 1000, height: 700, maximized: false });
  });

  it("falls back to the default when the file is damaged", () => {
    for (const contents of ["{not json", "null", '{"width":"wide","height":700}', '{"width":-5,"height":700}']) {
      expect(loadWindowState(stateFile(contents), screen), contents).toEqual(DEFAULT_WINDOW_STATE);
    }
  });

  it("is saved as JSON", () => {
    const path = stateFile();
    saveWindowState(path, { x: 1, y: 2, width: 800, height: 600, maximized: false });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ x: 1, y: 2, width: 800, height: 600, maximized: false });
  });
});
