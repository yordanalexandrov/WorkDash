// The 3D tilt of a card under the mouse: it leans towards the pointer and a soft shine follows it ("Motion" in docs/design.md).

/** The most a card leans on each axis, in degrees. */
const MAX_TILT = 4.5;

/** The lean of a card (`rotateX`, `rotateY`, degrees) and where its shine is (% of the card from its left and top). */
export type Tilt = { rx: number; ry: number; mx: number; my: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** How a card on `rect` leans with the pointer at `point`; a point outside leans as the nearest edge does. */
export function tiltFor(point: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }): Tilt {
  const px = clamp((point.x - rect.left) / rect.width);
  const py = clamp((point.y - rect.top) / rect.height);
  return { rx: (0.5 - py) * 2 * MAX_TILT, ry: (px - 0.5) * 2 * MAX_TILT, mx: px * 100, my: py * 100 };
}

/**
 * Leans `card` towards a mouse moving over it with no button down, measured on `box` (what does not lean, so the lean does not
 * feed back into itself); any other pointer, and reduced motion, leave it straight. Sets `--rx`, `--ry`, `--mx`, `--my` and `--shine`, and `.leaning` while it follows the mouse.
 */
export function lean(card: HTMLElement, box: HTMLElement, event: PointerEvent, reduced: boolean): void {
  if (reduced || event.pointerType !== "mouse" || event.buttons) {
    straighten(card);
    return;
  }
  const { rx, ry, mx, my } = tiltFor({ x: event.clientX, y: event.clientY }, box.getBoundingClientRect());
  card.style.setProperty("--rx", `${rx}deg`);
  card.style.setProperty("--ry", `${ry}deg`);
  card.style.setProperty("--mx", `${mx}%`);
  card.style.setProperty("--my", `${my}%`);
  card.style.setProperty("--shine", "1");
  card.classList.add("leaning");
}

/** Puts `card` straight again and its shine out; CSS eases it back. */
export function straighten(card: HTMLElement): void {
  card.style.setProperty("--rx", "0deg");
  card.style.setProperty("--ry", "0deg");
  card.style.setProperty("--shine", "0");
  card.classList.remove("leaning");
}
