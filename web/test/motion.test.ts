import { afterEach, describe, expect, it, vi } from "vitest";
import { createGate, flipDeltas, morphTransform, spring } from "../src/motion.js";

/** The points of a linear() easing. */
function points(easing: string): number[] {
  const inner = /^linear\((.*)\)$/.exec(easing)?.[1];
  if (!inner) throw new Error(`not a linear() easing: ${easing}`);
  return inner.split(",").map(Number);
}

describe("spring", () => {
  afterEach(() => vi.unstubAllGlobals());

  const withLinear = () => vi.stubGlobal("CSS", { supports: () => true });

  it("samples a curve that starts at 0 and settles at 1", () => {
    withLinear();
    const curve = points(spring(260, 24).easing);
    expect(curve[0]).toBe(0);
    expect(curve.at(-1)).toBe(1);
    expect(curve.length).toBeGreaterThan(10);
  });

  it("lasts a stable time, the same for the same spring", () => {
    withLinear();
    const { duration } = spring(260, 24);
    expect(duration).toBeGreaterThan(200);
    expect(duration).toBeLessThan(3000);
    expect(spring(260, 24)).toEqual(spring(260, 24));
  });

  it("overshoots with a bouncy spring and barely with a gliding one", () => {
    withLinear();
    expect(Math.max(...points(spring(320, 16).easing))).toBeGreaterThan(1.05);
    expect(Math.max(...points(spring(260, 24).easing))).toBeLessThan(1.05);
  });

  it("falls back to an overshooting cubic-bezier where linear() is not supported", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    expect(spring(320, 16).easing).toMatch(/^cubic-bezier\(/);
    vi.stubGlobal("CSS", undefined);
    expect(spring(320, 16).easing).toMatch(/^cubic-bezier\(/);
  });
});

describe("flipDeltas", () => {
  const at = (entries: Record<string, [number, number]>) => new Map(Object.entries(entries).map(([key, [x, y]]) => [key, { x, y }]));

  it("moves what moved back to where it was: old minus new", () => {
    expect(flipDeltas(at({ "pr:a#1": [10, 200] }), at({ "pr:a#1": [300, 50] }))).toEqual(new Map([["pr:a#1", { dx: -290, dy: 150 }]]));
  });

  it("leaves out what is new, what is gone and what moved less than a pixel", () => {
    const before = at({ gone: [0, 0], still: [5, 5], nudged: [5, 5] });
    const after = at({ fresh: [0, 0], still: [5, 5], nudged: [5.6, 4.5] });
    expect(flipDeltas(before, after)).toEqual(new Map());
  });
});

describe("createGate", () => {
  afterEach(() => vi.useRealTimers());

  /** A promise and the functions that settle it. */
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function gateWithLog() {
    const gate = createGate<string>();
    const seen: string[] = [];
    gate.subscribe((value) => seen.push(value));
    return { gate, seen };
  }

  it("lets a value through right away while nothing is held", () => {
    const { gate, seen } = gateWithLog();
    gate.push("a");
    gate.push("b");
    expect(seen).toEqual(["a", "b"]);
  });

  it("while an animation runs, lets only the last value through, once, after it ends", async () => {
    const { gate, seen } = gateWithLog();
    const animation = deferred();
    gate.hold(animation.promise);
    gate.push("a");
    gate.push("b");
    expect(seen).toEqual([]);
    animation.resolve();
    await vi.waitFor(() => expect(seen).toEqual(["b"]));
    await Promise.resolve();
    expect(seen).toEqual(["b"]);
  });

  it("lets the value through when the animation fails as well", async () => {
    const { gate, seen } = gateWithLog();
    const animation = deferred();
    gate.hold(animation.promise);
    gate.push("a");
    animation.reject(new Error("cancelled"));
    await vi.waitFor(() => expect(seen).toEqual(["a"]));
  });

  it("waits for every animation it holds, the last one to end included", async () => {
    const { gate, seen } = gateWithLog();
    const first = deferred();
    const second = deferred();
    gate.hold(first.promise);
    gate.push("a");
    gate.hold(second.promise);
    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(seen).toEqual([]);
    second.resolve();
    await vi.waitFor(() => expect(seen).toEqual(["a"]));
  });

  it("lets nothing through when nothing came while it held", async () => {
    const { gate, seen } = gateWithLog();
    const animation = deferred();
    gate.hold(animation.promise);
    animation.resolve();
    await animation.promise;
    await Promise.resolve();
    expect(seen).toEqual([]);
  });

  it("stops holding after 1.5s, so a stuck animation never freezes the board", async () => {
    vi.useFakeTimers();
    const { gate, seen } = gateWithLog();
    gate.hold(new Promise(() => {}));
    gate.push("a");
    await vi.advanceTimersByTimeAsync(1499);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual(["a"]);
  });
});

/** A rect as getBoundingClientRect gives it. */
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height }) as DOMRectReadOnly;

describe("morphTransform", () => {
  it("leaves an element where it is when the rects are the same", () => {
    expect(morphTransform(rect(10, 20, 300, 200), rect(10, 20, 300, 200))).toBe("translate(0px, 0px) scale(1, 1)");
  });

  it("shrinks onto a smaller rect, moved by the difference of their corners", () => {
    expect(morphTransform(rect(100, 300, 380, 100), rect(260, 60, 760, 400))).toBe("translate(-160px, 240px) scale(0.5, 0.25)");
  });
});
