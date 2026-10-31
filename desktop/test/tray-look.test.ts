import { describe, expect, it } from "vitest";
import { trayTooltip, withDot } from "../src/tray-look.js";

/** A square BGRA bitmap of one colour, as nativeImage.toBitmap() gives it. */
function bitmap(size: number, [b, g, r, a]: number[]): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([b!, g!, r!, a!], i);
  return pixels;
}

const pixel = (image: Buffer, size: number, x: number, y: number) => [...image.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];

describe("the tray's tooltip", () => {
  it("tells how many PRs wait on me", () => {
    expect(trayTooltip(3)).toBe("Чака теб: 3");
    expect(trayTooltip(0)).toBe("Чака теб: 0");
  });
});

describe("the tray icon with a dot", () => {
  const size = 32;
  const icon = bitmap(size, [0x11, 0x11, 0x11, 0xff]);

  it("paints a red dot in the top right corner", () => {
    const dotted = withDot(icon, size);

    // #ff6f63, the dashboard's --bad, in BGRA.
    expect(pixel(dotted, size, 24, 8)).toEqual([0x63, 0x6f, 0xff, 0xff]);
  });

  it("leaves the rest of the icon as it was", () => {
    const dotted = withDot(icon, size);

    expect(pixel(dotted, size, 4, 28)).toEqual([0x11, 0x11, 0x11, 0xff]);
    expect(pixel(dotted, size, 8, 8)).toEqual([0x11, 0x11, 0x11, 0xff]);
    expect(dotted.length).toBe(icon.length);
  });

  it("does not change the icon it is given", () => {
    withDot(icon, size);

    expect(pixel(icon, size, 24, 8)).toEqual([0x11, 0x11, 0x11, 0xff]);
  });
});
