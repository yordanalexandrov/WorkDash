import { describe, expect, it } from "vitest";
import { pullRequest } from "../../test/fixtures.js";
import type { ClosedPullRequest, DashboardPullRequest } from "../src/api.js";
import { clockLabel, expireToasts, fading, firedBy, type Happening, happenings, hourBuckets, hoursLeft, pushToasts, step } from "../src/replay.js";

const HOUR = 3_600_000;
const END = Date.parse("2026-10-31T12:00:00Z");
const START = END - 48 * HOUR;

const open = (overrides: Partial<DashboardPullRequest> = {}): DashboardPullRequest => ({ ...pullRequest(), jira: [], ...overrides });

describe("happenings", () => {
  it("turns a comment into its author commenting, with the text squeezed and cut to 90 characters", () => {
    const body = `Looks   good\n\nbut ${"x".repeat(100)}`;
    const pr = open({ comments: [{ id: "c1", author: "colleague1", createdAt: "2026-10-31T09:00:00Z", body }] });
    expect(happenings([pr], [], START, END)).toEqual([
      {
        at: Date.parse("2026-10-31T09:00:00Z"),
        key: "my-org/repo-a#1",
        project: "my-org/repo-a",
        tag: "#1",
        kind: "comment",
        who: "colleague1",
        what: "коментира",
        snippet: `Looks good but ${"x".repeat(75)}`,
        color: "var(--blue)",
      },
    ]);
  });

  it("turns a commit into the PR's author pushing it, at the time a poll first saw it, or else its commit time", () => {
    const pr = open({
      author: "colleague2",
      commits: [
        { oid: "abcdef1234567", committedAt: "2026-10-29T08:00:00Z", firstSeenAt: "2026-10-31T10:00:00Z" },
        { oid: "1234567abcdef", committedAt: "2026-10-31T11:00:00Z" },
      ],
    });
    expect(happenings([pr], [], START, END).map(({ at, kind, who, what, snippet, color }) => ({ at, kind, who, what, snippet, color }))).toEqual([
      { at: Date.parse("2026-10-31T10:00:00Z"), kind: "commit", who: "colleague2", what: "push-на commit", snippet: "abcdef1", color: "var(--pending)" },
      { at: Date.parse("2026-10-31T11:00:00Z"), kind: "commit", who: "colleague2", what: "push-на commit", snippet: "1234567", color: "var(--pending)" },
    ]);
  });

  it("turns reviews into approving, asking for changes or writing a review, and leaves dismissed ones out", () => {
    const at = (h: number) => `2026-10-31T0${h}:00:00Z`;
    const pr = open({
      reviews: [
        { author: "a", state: "APPROVED", submittedAt: at(1) },
        { author: "b", state: "CHANGES_REQUESTED", submittedAt: at(2) },
        { author: "c", state: "COMMENTED", submittedAt: at(3) },
        { author: "d", state: "DISMISSED", submittedAt: at(4) },
      ],
    });
    expect(happenings([pr], [], START, END).map(({ who, kind, what, color }) => ({ who, kind, what, color }))).toEqual([
      { who: "a", kind: "review", what: "одобри", color: "var(--ok)" },
      { who: "b", kind: "changes", what: "поиска промени", color: "var(--bad)" },
      { who: "c", kind: "review", what: "написа review", color: "var(--ok)" },
    ]);
  });

  it("turns a closed PR into its author merging or closing it", () => {
    const closed = (state: ClosedPullRequest["state"], number: number, closedAt: string): ClosedPullRequest => ({
      repo: "my-org/repo-b",
      number,
      title: `PR ${number}`,
      url: "",
      author: "colleague1",
      state,
      closedAt,
    });
    expect(happenings([], [closed("MERGED", 7, "2026-10-31T05:00:00Z"), closed("CLOSED", 8, "2026-10-31T04:00:00Z")], START, END)).toEqual([
      {
        at: Date.parse("2026-10-31T04:00:00Z"),
        key: "my-org/repo-b#8",
        project: "my-org/repo-b",
        tag: "#8",
        kind: "closed",
        who: "colleague1",
        what: "затвори",
        color: "var(--merged)",
      },
      {
        at: Date.parse("2026-10-31T05:00:00Z"),
        key: "my-org/repo-b#7",
        project: "my-org/repo-b",
        tag: "#7",
        kind: "closed",
        who: "colleague1",
        what: "merge-на",
        color: "var(--merged)",
      },
    ]);
  });

  it("keeps what happened after the start of the window up to its end, ordered by time across PRs", () => {
    const comment = (id: string, ms: number) => ({ id, author: "a", createdAt: new Date(ms).toISOString(), body: id });
    const a = open({ number: 1, comments: [comment("at-start", START), comment("late", END - HOUR), comment("after", END + 1)] });
    const b = open({ number: 2, comments: [comment("at-end", END), comment("early", START + HOUR)] });
    expect(happenings([a, b], [], START, END).map((h) => h.snippet)).toEqual(["early", "late", "at-end"]);
  });
});

/** A happening at `at` that only its time tells apart. */
const at = (ms: number, key = "k"): Happening => ({ at: ms, key, project: "p", tag: "#1", kind: "comment", who: "a", what: "коментира", color: "var(--blue)" });

describe("step", () => {
  // Something every hour, so nothing is quiet enough to rush through.
  const hourly = Array.from({ length: 48 }, (_, i) => at(START + (i + 1) * HOUR));

  it("moves an hour of the window per second at 1x and four at 4x", () => {
    expect(step(START, hourly, 100, 1, END).next).toBe(START + HOUR / 10);
    expect(step(START, hourly, 100, 4, END).next).toBe(START + (4 * HOUR) / 10);
  });

  it("rushes eight times faster while the next happening is more than 3 hours away, and through the quiet end", () => {
    const later = [at(START + 3 * HOUR + 1)];
    expect(step(START, later, 100, 1, END).next).toBe(START + (8 * HOUR) / 10);
    expect(step(START, [at(START + 3 * HOUR)], 100, 1, END).next).toBe(START + HOUR / 10);
    expect(step(START, [], 100, 4, END).next).toBe(START + (32 * HOUR) / 10);
  });

  it("stops at the end of the window", () => {
    expect(step(END - 60_000, [at(END)], 100, 4, END).next).toBe(END);
  });

  it("is due exactly what happens after the old time up to and with the new one, two at the same moment included", () => {
    const t = START + HOUR;
    const events = [at(t, "at-old"), at(t + 1, "a"), at(t + 1, "b"), at(t + HOUR / 10, "at-new"), at(t + HOUR / 10 + 1, "after")];
    expect(step(t, events, 100, 1, END).due.map((h) => h.key)).toEqual(["a", "b", "at-new"]);
  });

  it("counts a frame longer than 100ms, as after a hidden tab, as 100ms", () => {
    expect(step(START, hourly, 5000, 1, END).next).toBe(START + HOUR / 10);
  });
});

describe("firedBy", () => {
  it("counts what happened up to and with the moment", () => {
    const events = [at(START + 1), at(START + HOUR), at(START + HOUR), at(END)];
    expect(firedBy(events, START)).toBe(0);
    expect(firedBy(events, START + HOUR - 1)).toBe(1);
    expect(firedBy(events, START + HOUR)).toBe(3);
    expect(firedBy(events, END)).toBe(4);
  });
});

describe("hourBuckets", () => {
  it("counts the happenings of each of the 48 hours, one at the very end in the last", () => {
    const buckets = hourBuckets([at(START + 1), at(START + HOUR - 1), at(START + HOUR), at(END - 1), at(END)], START, END);
    expect(buckets).toHaveLength(48);
    expect(buckets[0]).toBe(2);
    expect(buckets[1]).toBe(1);
    expect(buckets[47]).toBe(2);
    expect(buckets.reduce((a, b) => a + b)).toBe(5);
  });
});

describe("pushToasts", () => {
  it("puts the newest on top, the last of a frame above the first, and keeps six", () => {
    const first = pushToasts([], [at(1, "a"), at(2, "b")], 1000, 0);
    expect(first.map((t) => [t.id, t.happening.key, t.born])).toEqual([
      [1, "b", 1000],
      [0, "a", 1000],
    ]);
    const more = pushToasts(first, ["c", "d", "e", "f", "g"].map((key, i) => at(3 + i, key)), 2000, 2);
    expect(more.map((t) => t.happening.key)).toEqual(["g", "f", "e", "d", "c", "b"]);
  });
});

describe("expireToasts", () => {
  it("removes a toast 9s after it came, and fades it from 7.5s", () => {
    const toasts = [...pushToasts([], [at(1, "new")], 5000, 1), ...pushToasts([], [at(1, "old")], 0, 0)];
    expect(expireToasts(toasts, 9000)).toBe(toasts);
    expect(expireToasts(toasts, 9001).map((t) => t.happening.key)).toEqual(["new"]);
    expect(fading(toasts[1]!, 7500)).toBe(false);
    expect(fading(toasts[1]!, 7501)).toBe(true);
  });
});

describe("clockLabel", () => {
  it("names the weekday and the time in Bulgarian", () => {
    expect(clockLabel(new Date(2026, 9, 30, 14, 5).getTime())).toBe("пт, 14:05");
    expect(clockLabel(new Date(2026, 9, 31, 9, 0).getTime())).toBe("сб, 09:00");
  });
});

describe("hoursLeft", () => {
  it("rounds the hours to the end of the window, 0 at its end", () => {
    expect(hoursLeft(START, END)).toBe(48);
    expect(hoursLeft(END - 1.6 * HOUR, END)).toBe(2);
    expect(hoursLeft(END - 1.4 * HOUR, END)).toBe(1);
    expect(hoursLeft(END, END)).toBe(0);
  });
});
