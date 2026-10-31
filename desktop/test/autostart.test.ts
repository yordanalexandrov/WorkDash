import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MenuItem } from "electron";
import { describe, expect, it, vi } from "vitest";
import { autostartDir, autostartEntry, loginSwitch, setStartsAtLogin, startsAtLogin } from "../src/autostart.js";

describe("the autostart entry", () => {
  it("starts the installed app hidden, in the tray, at login", () => {
    expect(autostartEntry()).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=WorkDash",
        "Exec=/usr/bin/workdash --hidden",
        "Icon=workdash",
        "Terminal=false",
        "X-GNOME-Autostart-enabled=true",
        "",
      ].join("\n"),
    );
  });
});

describe("the autostart directory", () => {
  it("is autostart in the XDG config home", () => {
    expect(autostartDir({ XDG_CONFIG_HOME: "/tmp/config" }, "/home/me")).toBe("/tmp/config/autostart");
  });

  it("is ~/.config/autostart without an XDG config home, or with an empty one", () => {
    expect(autostartDir({}, "/home/me")).toBe("/home/me/.config/autostart");
    expect(autostartDir({ XDG_CONFIG_HOME: "" }, "/home/me")).toBe("/home/me/.config/autostart");
  });
});

describe("starting at login", () => {
  // A directory that does not exist yet, as on a machine where nothing was ever set to start at login.
  const freshDir = () => join(mkdtempSync(join(tmpdir(), "workdash-autostart-")), "autostart");

  it("is off without an entry", () => {
    expect(startsAtLogin(freshDir())).toBe(false);
  });

  it("writes workdash.desktop when switched on, creating the directory, and then reads as on", () => {
    const dir = freshDir();
    setStartsAtLogin(dir, true);
    expect(readFileSync(join(dir, "workdash.desktop"), "utf8")).toBe(autostartEntry());
    expect(startsAtLogin(dir)).toBe(true);
  });

  it("removes the entry when switched off, and then reads as off", () => {
    const dir = freshDir();
    setStartsAtLogin(dir, true);
    setStartsAtLogin(dir, false);
    expect(existsSync(join(dir, "workdash.desktop"))).toBe(false);
    expect(startsAtLogin(dir)).toBe(false);
  });

  it("switches off quietly when it was never on", () => {
    const dir = freshDir();
    expect(() => setStartsAtLogin(dir, false)).not.toThrow();
    expect(startsAtLogin(dir)).toBe(false);
  });
});

describe("the tray's start at login switch", () => {
  const freshDir = () => join(mkdtempSync(join(tmpdir(), "workdash-autostart-")), "autostart");
  // Electron ticks the checkbox before it calls click; the item is all the switch reads.
  const clicked = (checked: boolean) => ({ checked }) as MenuItem;

  it("is a checkbox that shows whether the entry exists", () => {
    const dir = freshDir();
    expect(loginSwitch(dir, () => {})).toMatchObject({ label: "Стартирай при вход", type: "checkbox", checked: false });
    setStartsAtLogin(dir, true);
    expect(loginSwitch(dir, () => {}).checked).toBe(true);
  });

  it("writes the entry when ticked and removes it when unticked, then rebuilds the menu", () => {
    const dir = freshDir();
    const refresh = vi.fn();
    loginSwitch(dir, refresh).click?.(clicked(true), undefined, {} as never);
    expect(startsAtLogin(dir)).toBe(true);
    loginSwitch(dir, refresh).click?.(clicked(false), undefined, {} as never);
    expect(startsAtLogin(dir)).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
