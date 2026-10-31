import { describe, expect, it } from "vitest";
import { trayMenu } from "../src/tray-menu.js";

describe("the tray's menu", () => {
  it("opens the window and quits the app", () => {
    const done: string[] = [];
    const menu = trayMenu({ open: () => done.push("open"), quit: () => done.push("quit") });

    expect(menu.map((item) => item.label ?? item.type)).toEqual(["Отвори", "separator", "Изход"]);
    for (const item of menu) item.click?.(...([] as unknown as Parameters<NonNullable<typeof item.click>>));
    expect(done).toEqual(["open", "quit"]);
  });

  it("puts the switches it is given between Отвори and Изход", () => {
    const menu = trayMenu({ open() {}, quit() {} }, [{ label: "Пауза на нотификациите", type: "checkbox", checked: true }]);

    expect(menu.map((item) => item.label ?? item.type)).toEqual(["Отвори", "separator", "Пауза на нотификациите", "separator", "Изход"]);
  });
});
