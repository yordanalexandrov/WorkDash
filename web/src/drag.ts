// The arithmetic of dragging something onto a drop zone: when a press becomes a drag, the tilt, the hit test and the spin of
// the drop. It knows nothing of PRs; see "Motion" and "Interaction" in docs/design.md.

/** How far the pointer must go from where it pressed before a press becomes a drag; until then a click stays a click. */
const THRESHOLD = 7;

/** Whether a press that has moved by `dx`, `dy` is a drag now. */
export function pastThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > THRESHOLD;
}

/** The most a dragged copy leans either way, in degrees. */
const MAX_TILT = 14;

/**
 * The lean after the pointer has moved `deltaX` sideways since the last event: a quarter of the way from `tilt` towards
 * 0.9 × `deltaX`, so it follows the horizontal speed smoothly and rights itself when the pointer stops; at most ±14°.
 */
export function nextTilt(tilt: number, deltaX: number): number {
  const next = tilt + (0.9 * deltaX - tilt) * 0.25;
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, next));
}

export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };

/** Whether `point` is over `zone`: in its box grown by `margin` on every side, so a drop near the edge still lands. */
export function overZone(point: Point, zone: Box, margin = 20): boolean {
  return point.x >= zone.left - margin && point.x <= zone.right + margin && point.y >= zone.top - margin && point.y <= zone.bottom + margin;
}

/** How far a copy dropped into the zone turns as it goes in, in degrees: the way it leans, and the other way when upright. */
export function dropSpin(tilt: number): number {
  return tilt > 0 ? 25 : -25;
}
