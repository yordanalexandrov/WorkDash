import { describe, expect, it } from "vitest";
import { barChange, SHOW_AFTER_MS, SHOW_AT_LEAST_MS } from "../src/pollBar.js";

describe("barChange", () => {
  it("shows the bar only after a poll has run for a moment", () => {
    expect(barChange(true, null, 1000)).toEqual({ show: true, delay: SHOW_AFTER_MS });
  });

  it("keeps a bar that has just appeared for the rest of its minimum", () => {
    expect(barChange(false, 1000, 1100)).toEqual({ show: false, delay: SHOW_AT_LEAST_MS - 100 });
  });

  it("hides at once a bar that has been up long enough", () => {
    expect(barChange(false, 1000, 1000 + SHOW_AT_LEAST_MS + 500)).toEqual({ show: false, delay: 0 });
  });

  it("leaves the bar alone while a shown bar stays busy or a hidden one idle", () => {
    expect(barChange(true, 1000, 2000)).toBeNull();
    expect(barChange(false, null, 2000)).toBeNull();
  });
});
