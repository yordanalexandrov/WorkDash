import { describe, expect, it } from "vitest";
import { answerIssueDemand, nextIntervalPollAt } from "../src/domain/issue-poll.js";

const now = new Date("2026-10-31T12:00:00Z");
const rateLimit = { kind: "rate_limit" as const, message: "API rate limit exceeded", resetAt: "2026-10-31T12:20:00Z" };

describe("answerIssueDemand", () => {
  it("polls a repo opened when its last poll is a minute old or more", () => {
    expect(answerIssueDemand({ demand: "open", polling: false, lastPolledAt: "2026-10-31T11:59:00Z", error: null, intervalMs: 60_000, now })).toBe("poll");
  });

  it("shows what is saved for a repo opened again within a minute of its last poll", () => {
    expect(answerIssueDemand({ demand: "open", polling: false, lastPolledAt: "2026-10-31T11:59:01Z", error: null, intervalMs: 60_000, now })).toBe("skip");
  });

  it("polls a repo opened for the first time", () => {
    expect(answerIssueDemand({ demand: "open", polling: false, lastPolledAt: null, error: null, intervalMs: 60_000, now })).toBe("poll");
  });

  it("polls on the button however recent the last poll is", () => {
    expect(answerIssueDemand({ demand: "button", polling: false, lastPolledAt: "2026-10-31T11:59:59Z", error: null, intervalMs: 60_000, now })).toBe("poll");
  });

  it("waits for the poll of the repo under way instead of starting a second one", () => {
    expect(answerIssueDemand({ demand: "open", polling: true, lastPolledAt: null, error: null, intervalMs: 60_000, now })).toBe("join");
    expect(answerIssueDemand({ demand: "button", polling: true, lastPolledAt: null, error: null, intervalMs: 60_000, now })).toBe("join");
  });

  it("does nothing, not even on the button, until a rate limit lifts", () => {
    expect(answerIssueDemand({ demand: "button", polling: false, lastPolledAt: "2026-10-31T11:00:00Z", error: rateLimit, intervalMs: 60_000, now })).toBe("skip");
    expect(
      answerIssueDemand({ demand: "button", polling: false, lastPolledAt: "2026-10-31T11:00:00Z", error: rateLimit, intervalMs: 60_000, now: new Date("2026-10-31T12:20:00Z") }),
    ).toBe("poll");
  });

  it("polls on focus when the last poll is a minute old or more, and shows what is saved under a minute", () => {
    expect(answerIssueDemand({ demand: "focus", polling: false, lastPolledAt: "2026-10-31T11:59:00Z", error: null, intervalMs: 600_000, now })).toBe("poll");
    expect(answerIssueDemand({ demand: "focus", polling: false, lastPolledAt: "2026-10-31T11:59:30Z", error: null, intervalMs: 600_000, now })).toBe("skip");
  });

  it("polls on the interval once the poll interval has passed since the last poll", () => {
    expect(answerIssueDemand({ demand: "interval", polling: false, lastPolledAt: "2026-10-31T11:55:00Z", error: null, intervalMs: 300_000, now })).toBe("poll");
    expect(answerIssueDemand({ demand: "interval", polling: false, lastPolledAt: "2026-10-31T11:56:00Z", error: null, intervalMs: 300_000, now })).toBe("skip");
  });

  it("polls on the interval at most once a minute, however short the poll interval", () => {
    expect(answerIssueDemand({ demand: "interval", polling: false, lastPolledAt: "2026-10-31T11:59:30Z", error: null, intervalMs: 10_000, now })).toBe("skip");
    expect(answerIssueDemand({ demand: "interval", polling: false, lastPolledAt: "2026-10-31T11:59:00Z", error: null, intervalMs: 10_000, now })).toBe("poll");
  });
});

describe("nextIntervalPollAt", () => {
  it("is the poll interval after the last poll", () => {
    expect(nextIntervalPollAt({ lastPolledAt: "2026-10-31T11:58:00Z", error: null, intervalMs: 300_000, now })).toBe("2026-10-31T12:03:00.000Z");
  });

  it("is a minute after the last poll when the poll interval is shorter", () => {
    expect(nextIntervalPollAt({ lastPolledAt: "2026-10-31T11:59:30Z", error: null, intervalMs: 10_000, now })).toBe("2026-10-31T12:00:30.000Z");
  });

  it("waits for a rate limit to lift", () => {
    expect(nextIntervalPollAt({ lastPolledAt: "2026-10-31T11:59:30Z", error: rateLimit, intervalMs: 60_000, now })).toBe("2026-10-31T12:20:00.000Z");
  });

  it("is a whole interval from now when nothing is due before, so a demand that polled nothing is not repeated at once", () => {
    expect(nextIntervalPollAt({ lastPolledAt: null, error: null, intervalMs: 300_000, now })).toBe("2026-10-31T12:05:00.000Z");
    expect(nextIntervalPollAt({ lastPolledAt: "2026-10-31T10:00:00Z", error: null, intervalMs: 300_000, now })).toBe("2026-10-31T12:05:00.000Z");
  });
});
