import { describe, expect, it } from "vitest";
import type { ClosedPullRequest } from "../src/api.js";
import { confettiPiece, newlyMerged, SPARKS, sparkPiece } from "../src/effects.js";

const closed = (number: number, state: ClosedPullRequest["state"] = "MERGED"): ClosedPullRequest => ({
  repo: "my-org/repo-a",
  number,
  title: `PR ${number}`,
  url: "",
  author: "colleague1",
  state,
  closedAt: "2026-10-31T05:00:00Z",
});

describe("newlyMerged", () => {
  it("gives the key of a PR that came into the closed ones merged", () => {
    expect(newlyMerged([closed(1)], [closed(2), closed(1)])).toEqual(["my-org/repo-a#2"]);
  });

  it("leaves out a PR that came in closed without a merge", () => {
    expect(newlyMerged([closed(1)], [closed(2, "CLOSED"), closed(1)])).toEqual([]);
  });

  it("leaves out a merged PR that was already among the closed ones", () => {
    expect(newlyMerged([closed(1), closed(2)], [closed(1), closed(2)])).toEqual([]);
  });

  it("gives nothing for the first snapshot, which has none before it", () => {
    expect(newlyMerged(null, [closed(1), closed(2)])).toEqual([]);
  });
});

/** A generator that gives `values` in turn, over and over. */
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe("confettiPiece", () => {
  it("flies up in the fan, within the size, power, spin and time the spec sets, at both ends of the generator", () => {
    for (const random of [fixed(0), fixed(0.999999)]) {
      const piece = confettiPiece(random);
      expect(piece.angle).toBeGreaterThanOrEqual(-Math.PI * 0.95);
      expect(piece.angle).toBeLessThanOrEqual(-Math.PI * 0.05);
      expect(piece.power).toBeGreaterThanOrEqual(120);
      expect(piece.power).toBeLessThanOrEqual(300);
      expect(piece.width).toBeGreaterThanOrEqual(5);
      expect(piece.width).toBeLessThanOrEqual(9);
      expect(piece.height).toBeGreaterThanOrEqual(8);
      expect(piece.height).toBeLessThanOrEqual(14);
      expect(Math.abs(piece.spin)).toBeLessThanOrEqual(720);
      expect(piece.duration).toBeGreaterThanOrEqual(1300);
      expect(piece.duration).toBeLessThanOrEqual(2000);
    }
  });

  it("rises before it falls: the top of its flight is above where it set off, and it ends below that", () => {
    const piece = confettiPiece(fixed(0.5));
    expect(piece.angle).toBeCloseTo(-Math.PI / 2);
    expect(piece.rise).toBeLessThan(0);
    expect(piece.fall).toBeGreaterThan(0);
  });

  it("goes left at one end of the fan and right at the other", () => {
    expect(Math.cos(confettiPiece(fixed(0)).angle)).toBeLessThan(0);
    expect(Math.cos(confettiPiece(fixed(0.999999)).angle)).toBeGreaterThan(0);
  });
});

describe("sparkPiece", () => {
  it("spreads the sparks evenly around the circle when the generator is in its middle", () => {
    const angles = Array.from({ length: SPARKS }, (_, i) => sparkPiece(i, fixed(0.5)).angle);
    expect(SPARKS).toBe(16);
    angles.forEach((angle, i) => expect(angle).toBeCloseTo((i / 16) * Math.PI * 2));
  });

  it("keeps a spark near its place on the circle, within the distance, size and time the spec sets", () => {
    for (const random of [fixed(0), fixed(0.999999)]) {
      const piece = sparkPiece(4, random);
      expect(Math.abs(piece.angle - Math.PI / 2)).toBeLessThanOrEqual(0.2);
      expect(Math.hypot(piece.dx, piece.dy)).toBeGreaterThanOrEqual(40);
      expect(Math.hypot(piece.dx, piece.dy)).toBeLessThanOrEqual(90);
      expect(piece.size).toBeGreaterThanOrEqual(4);
      expect(piece.size).toBeLessThanOrEqual(8);
      expect(piece.duration).toBeGreaterThanOrEqual(500);
      expect(piece.duration).toBeLessThanOrEqual(800);
    }
  });

  it("flies in the direction of its angle: a quarter turn goes straight down", () => {
    const piece = sparkPiece(4, fixed(0.5));
    expect(piece.dx).toBeCloseTo(0);
    expect(piece.dy).toBeGreaterThan(0);
  });
});
