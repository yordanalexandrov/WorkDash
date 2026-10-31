import { describe, expect, it } from "vitest";
import { dropSpin, nextTilt, overZone, pastThreshold } from "../src/drag.js";

describe("pastThreshold", () => {
  it("does not start a drag at 7px and starts it past 7px", () => {
    expect(pastThreshold(7, 0)).toBe(false);
    expect(pastThreshold(0, -7)).toBe(false);
    expect(pastThreshold(7.5, 0)).toBe(true);
    expect(pastThreshold(0, -8)).toBe(true);
  });

  it("measures a diagonal move by its length", () => {
    // 5, 5 is about 7.07px; 4, 5 is about 6.4px.
    expect(pastThreshold(5, 5)).toBe(true);
    expect(pastThreshold(-4, 5)).toBe(false);
  });
});

describe("nextTilt", () => {
  it("moves a quarter of the way towards 0.9 of the horizontal move", () => {
    // From 0 towards 9 (0.9 × 10): a quarter is 2.25.
    expect(nextTilt(0, 10)).toBeCloseTo(2.25);
    // From 4 towards -9: 4 + (-13) / 4.
    expect(nextTilt(4, -10)).toBeCloseTo(0.75);
  });

  it("never leans past 14 degrees either way", () => {
    expect(nextTilt(0, 100)).toBe(14);
    expect(nextTilt(14, 200)).toBe(14);
    expect(nextTilt(-10, -300)).toBe(-14);
  });

  it("settles back towards upright when the pointer stops moving sideways", () => {
    expect(nextTilt(8, 0)).toBeCloseTo(6);
    let tilt = 14;
    for (let i = 0; i < 40; i++) tilt = nextTilt(tilt, 0);
    expect(Math.abs(tilt)).toBeLessThan(0.01);
  });
});

describe("overZone", () => {
  // A 300 × 92 zone with its top left corner at 100, 500.
  const zone = { left: 100, top: 500, right: 400, bottom: 592 };

  it("counts a point inside the zone", () => {
    expect(overZone({ x: 250, y: 546 }, zone)).toBe(true);
  });

  it("counts a point up to 20px outside any side", () => {
    expect(overZone({ x: 80, y: 546 }, zone)).toBe(true);
    expect(overZone({ x: 420, y: 546 }, zone)).toBe(true);
    expect(overZone({ x: 250, y: 480 }, zone)).toBe(true);
    expect(overZone({ x: 250, y: 612 }, zone)).toBe(true);
  });

  it("does not count a point 21px outside any side", () => {
    expect(overZone({ x: 79, y: 546 }, zone)).toBe(false);
    expect(overZone({ x: 421, y: 546 }, zone)).toBe(false);
    expect(overZone({ x: 250, y: 479 }, zone)).toBe(false);
    expect(overZone({ x: 250, y: 613 }, zone)).toBe(false);
  });

  it("takes another margin", () => {
    expect(overZone({ x: 95, y: 546 }, zone, 0)).toBe(false);
  });
});

describe("dropSpin", () => {
  it("spins a copy leaning right 25° clockwise", () => {
    expect(dropSpin(0.4)).toBe(25);
    expect(dropSpin(14)).toBe(25);
  });

  it("spins a copy leaning left or upright the other way", () => {
    expect(dropSpin(-3)).toBe(-25);
    expect(dropSpin(0)).toBe(-25);
  });
});
