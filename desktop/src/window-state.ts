import { readFileSync } from "node:fs";
import { z } from "zod";
import { writeFileAtomically } from "../../src/atomic-write.js";

type Rect = { x: number; y: number; width: number; height: number };

/** The window's size, position (none: centred) and whether it was maximized, kept in `userData` between starts. */
export type WindowState = { x?: number; y?: number; width: number; height: number; maximized: boolean };

export const DEFAULT_WINDOW_STATE: WindowState = { width: 1280, height: 800, maximized: false };

const size = z.number().int().positive();
const savedState = z.object({ x: z.number().int().optional(), y: z.number().int().optional(), width: size, height: size, maximized: z.boolean() });

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * The state saved at `path`, or the default when there is none or it cannot be read. A position that no longer lands
 * on any of `workAreas` (the screen it was on is unplugged) is dropped, so the window opens centred at its old size.
 */
export function loadWindowState(path: string, workAreas: Rect[]): WindowState {
  let saved: WindowState;
  try {
    saved = savedState.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
  const { x, y, ...rest } = saved;
  if (x === undefined || y === undefined) return rest;
  const onScreen = workAreas.some((area) => overlaps({ x, y, width: rest.width, height: rest.height }, area));
  return onScreen ? saved : rest;
}

export function saveWindowState(path: string, state: WindowState): void {
  writeFileAtomically(path, `${JSON.stringify(state)}\n`);
}
