import { describe, expect, it } from "vitest";
import { answerDemand, delayAfterSwitch } from "../src/domain/poll-mode.js";

const now = new Date("2026-10-31T12:00:00Z");

describe("answerDemand", () => {
  it("polls on focus when the last successful poll is older than 30 seconds", () => {
    expect(answerDemand({ demand: "focus", polling: false, lastSuccessAt: "2026-10-31T11:59:29Z", error: null, now })).toBe("poll");
  });

  it("does nothing on focus within 30 seconds of a successful poll", () => {
    expect(answerDemand({ demand: "focus", polling: false, lastSuccessAt: "2026-10-31T11:59:31Z", error: null, now })).toBe("skip");
  });

  it("polls on focus when no poll has succeeded yet", () => {
    expect(answerDemand({ demand: "focus", polling: false, lastSuccessAt: null, error: null, now })).toBe("poll");
  });

  it("polls on the button however recent the last poll is", () => {
    expect(answerDemand({ demand: "button", polling: false, lastSuccessAt: "2026-10-31T11:59:59Z", error: null, now })).toBe("poll");
  });

  it("waits for a poll under way instead of starting a second one", () => {
    expect(answerDemand({ demand: "button", polling: true, lastSuccessAt: null, error: null, now })).toBe("join");
    expect(answerDemand({ demand: "focus", polling: true, lastSuccessAt: null, error: null, now })).toBe("join");
  });

  it("does nothing, not even on the button, until a rate limit lifts", () => {
    const error = { kind: "rate_limit" as const, message: "API rate limit exceeded", resetAt: "2026-10-31T12:20:00Z" };

    expect(answerDemand({ demand: "button", polling: false, lastSuccessAt: "2026-10-31T11:00:00Z", error, now })).toBe("skip");
    expect(answerDemand({ demand: "button", polling: false, lastSuccessAt: "2026-10-31T11:00:00Z", error, now: new Date("2026-10-31T12:20:00Z") })).toBe("poll");
  });

  it("polls after any other failure, so a demand is how On-demand tries again", () => {
    const error = { kind: "unreachable" as const, message: "fetch failed", resetAt: null };

    expect(answerDemand({ demand: "focus", polling: false, lastSuccessAt: "2026-10-31T11:00:00Z", error, now })).toBe("poll");
  });
});

describe("delayAfterSwitch", () => {
  const intervalMs = 60_000;

  it("waits out the rest of the interval since the last poll", () => {
    expect(delayAfterSwitch({ lastPollAt: "2026-10-31T11:59:40Z", intervalMs, error: null, now })).toBe(40_000);
  });

  it("polls right away when the data is already older than the interval", () => {
    expect(delayAfterSwitch({ lastPollAt: "2026-10-31T11:30:00Z", intervalMs, error: null, now })).toBe(0);
  });

  it("polls right away when there has been no poll", () => {
    expect(delayAfterSwitch({ lastPollAt: null, intervalMs, error: null, now })).toBe(0);
  });

  it("waits for a rate limit to lift", () => {
    const error = { kind: "rate_limit" as const, message: "API rate limit exceeded", resetAt: "2026-10-31T12:20:00Z" };

    expect(delayAfterSwitch({ lastPollAt: "2026-10-31T11:30:00Z", intervalMs, error, now })).toBe(20 * 60_000);
  });
});
