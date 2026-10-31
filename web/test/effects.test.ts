import { describe, expect, it } from "vitest";
import { closedIssue } from "../../test/fixtures.js";
import type { ClosedIssue, ClosedPullRequest, IssueBoardState } from "../src/api.js";
import { confettiPiece, newlyMerged, NO_WATCH, SPARKS, sparkPiece, watchCompleted } from "../src/effects.js";

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

describe("watchCompleted", () => {
  /** What the Issue dashboard got for a repo: its closed issues, as fetched at `fetchedAt` (null when nothing is saved yet). */
  const board = (closed: ClosedIssue[], options: { repo?: string; fetchedAt?: string | null } = {}): Pick<IssueBoardState, "repo" | "fetchedAt" | "closed"> => ({
    repo: options.repo ?? "my-org/repo-a",
    fetchedAt: options.fetchedAt === undefined ? "2026-10-31T08:00:00Z" : options.fetchedAt,
    closed,
  });
  /** What the page shows of the repo, one state after the other (null while it shows none), and the issues each one bursts for. */
  const along = (states: (Pick<IssueBoardState, "repo" | "fetchedAt" | "closed"> | null)[]): string[][] => {
    let watch = NO_WATCH;
    return states.map((state) => {
      const step = watchCompleted(watch, state);
      watch = step.watch;
      return step.completed;
    });
  };
  const saved = board([closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T05:00:00Z" });

  it("gives the key of an issue completed between two poll answers that came in while the page showed the repo", () => {
    const first = board([closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:00:00Z" });
    const second = board([closedIssue({ number: 2 }), closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:01:00Z" });

    expect(along([saved, first, second])).toEqual([[], [], ["my-org/repo-a#2"]]);
  });

  it("gives nothing for the first poll answer after the saved issues, however long ago they were saved", () => {
    const answer = board([closedIssue({ number: 2 }), closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:00:00Z" });

    expect(along([saved, answer])).toEqual([[], []]);
  });

  it("gives nothing for the first poll answer when nothing was saved yet", () => {
    const answer = board([closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:00:00Z" });

    expect(along([board([], { fetchedAt: null }), answer])).toEqual([[], []]);
  });

  it("takes a poll's start, which carries the issues as saved, for no answer", () => {
    const first = board([closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:00:00Z" });
    const second = board([closedIssue({ number: 2 }), closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:01:00Z" });

    expect(along([saved, saved, first, first, second])).toEqual([[], [], [], [], ["my-org/repo-a#2"]]);
  });

  it("leaves out an issue closed as not planned, and one already among the closed ones", () => {
    const first = board([closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:00:00Z" });
    const second = board([closedIssue({ number: 2, closedAs: "not_planned" }), closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:01:00Z" });

    expect(along([saved, first, second])).toEqual([[], [], []]);
  });

  it("starts over when another repo shows between two answers, as when a tab is opened and left", () => {
    const first = board([], { fetchedAt: "2026-10-31T08:00:00Z" });
    const other = board([], { repo: "my-org/repo-b", fetchedAt: "2026-10-31T08:00:30Z" });
    const second = board([closedIssue({ number: 1 })], { fetchedAt: "2026-10-31T08:01:00Z" });

    expect(along([saved, first, other, second])).toEqual([[], [], [], []]);
    expect(along([saved, first, null, second])).toEqual([[], [], [], []]);
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
