import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The deb's icons for the app menu, the dock and Alt+Tab (hicolor/<n>x<n>/apps/workdash.png), made from the dashboard's.
const dir = new URL("../build/icons/", import.meta.url);

/** Width and height from the PNG's IHDR chunk. */
function pngSize(file: URL): [number, number] {
  const png = readFileSync(file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe("the desktop app's icons", () => {
  it("are the dashboard's icon, unchanged at 512", () => {
    expect(readFileSync(new URL("512x512.png", dir))).toEqual(
      readFileSync(new URL("../../web/public/icons/icon-512.png", import.meta.url)),
    );
  });

  it("come in the sizes the docks and menus ask for, each as large as its name", () => {
    const files = readdirSync(dir).sort((a, b) => parseInt(a) - parseInt(b));
    expect(files).toEqual(["16x16.png", "24x24.png", "32x32.png", "48x48.png", "64x64.png", "128x128.png", "256x256.png", "512x512.png"]);
    for (const file of files) {
      const n = parseInt(file);
      expect(pngSize(new URL(file, dir)), file).toEqual([n, n]);
    }
  });
});
