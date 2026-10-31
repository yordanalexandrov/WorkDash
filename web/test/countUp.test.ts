import { describe, expect, it } from "vitest";
import { countFrame } from "../src/countUp.js";

describe("countFrame", () => {
  it("starts at `from` and ends at `to`", () => {
    expect(countFrame(0, 10, 0)).toBe(0);
    expect(countFrame(0, 10, 1)).toBe(10);
  });

  it("eases out: half the time in, it is past the middle (ease-out cubic), rounded to a whole number", () => {
    // 1 - 0.5³ = 0.875 of the way: 8.75.
    expect(countFrame(0, 10, 0.5)).toBe(9);
    // 1 - 0.9³ = 0.271 of the way: 2.71.
    expect(countFrame(0, 10, 0.1)).toBe(3);
  });

  it("never goes back on the way up", () => {
    const frames = Array.from({ length: 101 }, (_, i) => countFrame(3, 40, i / 100));
    frames.slice(1).forEach((frame, i) => expect(frame).toBeGreaterThanOrEqual(frames[i]!));
  });

  it("counts down as well", () => {
    expect(countFrame(10, 4, 0)).toBe(10);
    // 10 - 6 × 0.875 = 4.75.
    expect(countFrame(10, 4, 0.5)).toBe(5);
    expect(countFrame(10, 4, 1)).toBe(4);
  });
});
