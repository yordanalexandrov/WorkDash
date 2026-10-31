import { describe, expect, it } from "vitest";
import { closedIssue } from "../../test/fixtures.js";
import type { ClosedIssue, ClosedPullRequest, IssueBoardState } from "../src/api.js";
import { confettiPiece, newlyCompleted, newlyMerged, SPARKS, sparkPiece } from "../src/effects.js";

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

describe("newlyCompleted", () => {
  /** What the Issue dashboard got for a repo: its closed issues, as fetched at `fetchedAt` (null when nothing is saved yet). */
  const board = (closed: ClosedIssue[], options: { repo?: string; fetchedAt?: string | null } = {}): Pick<IssueBoardState, "repo" | "fetchedAt" | "closed"> => ({
    repo: options.repo ?? "my-org/repo-a",
    fetchedAt: options.fetchedAt === undefined ? "2026-10-31T08:00:00Z" : options.fetchedAt,
    closed,
  });

  it("gives the key of an issue that came into the closed ones as completed between two answers for the repo", () => {
    expect(newlyCompleted(board([closedIssue({ number: 1 })]), board([closedIssue({ number: 2 }), closedIssue({ number: 1 })]))).toEqual(["my-org/repo-a#2"]);
  });

  it("leaves out an issue closed as not planned, and one already among the closed ones", () => {
    const before = board([closedIssue({ number: 1 })]);
    const after = board([closedIssue({ number: 2, closedAs: "not_planned" }), closedIssue({ number: 1 })]);

    expect(newlyCompleted(before, after)).toEqual([]);
  });

  it("gives nothing on first load: no answer before, or one with nothing saved yet", () => {
    const after = board([closedIssue({ number: 1 })]);

    expect(newlyCompleted(null, after)).toEqual([]);
    expect(newlyCompleted(board([], { fetchedAt: null }), after)).toEqual([]);
  });

  it("gives nothing when the answer before was for another repo, as when a tab is opened", () => {
    const before = board([], { repo: "my-org/repo-b" });
    const after = board([closedIssue({ number: 1 })]);

    expect(newlyCompleted(before, after)).toEqual([]);
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
