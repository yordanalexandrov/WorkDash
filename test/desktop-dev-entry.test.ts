import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applicationsDir, devEntry, installDevEntry, removeDevEntry } from "../scripts/desktop-dev-entry.js";

describe("devEntry", () => {
  const entry = devEntry("/home/me/workdash");

  it("matches the window by its class, so the dock and Alt+Tab show the icon without the deb", () => {
    expect(entry).toContain("StartupWMClass=workdash\n");
  });

  it("points at the repo's icon and starts the built app from the repo", () => {
    expect(entry).toContain("Icon=/home/me/workdash/web/public/icons/icon-512.png\n");
    expect(entry).toContain("Exec=/home/me/workdash/desktop/node_modules/.bin/electron /home/me/workdash/desktop\n");
  });

  it("is named apart from the deb's entry", () => {
    expect(entry).toContain("Name=WorkDash (dev)\n");
    expect(entry.startsWith("[Desktop Entry]\n")).toBe(true);
  });
});

describe("applicationsDir", () => {
  it("uses $XDG_DATA_HOME/applications, by default ~/.local/share/applications", () => {
    expect(applicationsDir({ XDG_DATA_HOME: "/x" }, "/home/me")).toBe("/x/applications");
    expect(applicationsDir({}, "/home/me")).toBe("/home/me/.local/share/applications");
    expect(applicationsDir({ XDG_DATA_HOME: "" }, "/home/me")).toBe("/home/me/.local/share/applications");
  });
});

describe("installDevEntry / removeDevEntry", () => {
  it("writes workdash-dev.desktop into the dir and removes it again", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "workdash-apps-")), "applications");
    const path = installDevEntry(dir, "/home/me/workdash");
    expect(path).toBe(join(dir, "workdash-dev.desktop"));
    expect(readFileSync(path, "utf8")).toBe(devEntry("/home/me/workdash"));
    removeDevEntry(dir);
    expect(existsSync(path)).toBe(false);
    removeDevEntry(dir);
  });
});
