import { describe, expect, it } from "vitest";
import { tiltFor } from "../src/tilt.js";

const rect = { left: 100, top: 50, width: 200, height: 100 };

describe("tiltFor", () => {
  it("leaves the card flat with the pointer in its middle, the shine there too", () => {
    const tilt = tiltFor({ x: 200, y: 100 }, rect);
    expect(tilt.rx).toBeCloseTo(0);
    expect(tilt.ry).toBeCloseTo(0);
    expect(tilt).toMatchObject({ mx: 50, my: 50 });
  });

  it("leans the card 4.5° on both axes towards the corner under the pointer", () => {
    // Top left: the top comes towards me (rotateX +), the left side goes back (rotateY −).
    expect(tiltFor({ x: 100, y: 50 }, rect)).toEqual({ rx: 4.5, ry: -4.5, mx: 0, my: 0 });
    expect(tiltFor({ x: 300, y: 150 }, rect)).toEqual({ rx: -4.5, ry: 4.5, mx: 100, my: 100 });
  });

  it("gives the shine's place in percent of the card", () => {
    expect(tiltFor({ x: 150, y: 125 }, rect)).toMatchObject({ mx: 25, my: 75 });
  });

  it("does not lean past 4.5° for a pointer just outside the card", () => {
    expect(tiltFor({ x: 90, y: 200 }, rect)).toEqual({ rx: -4.5, ry: -4.5, mx: 0, my: 100 });
  });
});
