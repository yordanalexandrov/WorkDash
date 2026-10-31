// How the tray shows the Чака теб count: a tooltip with the number, and a dot on the icon while it is above 0.
// The panel of Cinnamon shows no numbers next to an icon, and the icon itself carries none.

/** The tray's tooltip for `count` PRs waiting on me. */
export function trayTooltip(count: number): string {
  return `Чака теб: ${count}`;
}

/** The dashboard's --bad in the dark theme, as blue, green, red. */
const DOT = [0x63, 0x6f, 0xff] as const;

/**
 * The icon with a red dot in its top right corner: a copy of `icon`, a square BGRA bitmap `size` pixels wide as
 * nativeImage.toBitmap() gives it. The dot's edge is blended, so it stays round at panel sizes.
 */
export function withDot(icon: Buffer, size: number): Buffer {
  const dotted = Buffer.from(icon);
  const radius = size * 0.26;
  const centre = { x: size - radius, y: radius };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y);
      const cover = Math.min(1, Math.max(0, radius - distance + 0.5));
      if (cover === 0) continue;
      const at = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        dotted[at + channel] = Math.round(DOT[channel]! * cover + dotted[at + channel]! * (1 - cover));
      }
      dotted[at + 3] = Math.round(0xff * cover + dotted[at + 3]! * (1 - cover));
    }
  }
  return dotted;
}
