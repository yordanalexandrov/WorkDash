import { describe, expect, it } from "vitest";
import { allowsPermission } from "../src/permissions.js";

describe("what the dashboard's page may use", () => {
  it("may show notifications", () => {
    expect(allowsPermission("notifications")).toBe(true);
  });

  it("gets nothing else", () => {
    for (const permission of ["media", "geolocation", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "openExternal", "midi", "unknown"]) {
      expect(allowsPermission(permission), permission).toBe(false);
    }
  });
});
