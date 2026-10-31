import { describe, expect, it } from "vitest";
import { isStrip } from "../src/column.js";

describe("isStrip", () => {
  it("folds an empty column to a strip and leaves a full one open", () => {
    expect(isStrip(0, undefined)).toBe(true);
    expect(isStrip(3, undefined)).toBe(false);
  });

  it("lets a fold by hand win either way", () => {
    expect(isStrip(3, true)).toBe(true);
    expect(isStrip(0, false)).toBe(false);
  });
});
