import { describe, expect, it } from "vitest";
import { nextPollDelay } from "../src/domain/poll-error.js";

const now = new Date("2026-10-30T12:00:00Z");

describe("nextPollDelay", () => {
  it("waits the poll interval after a success or an ordinary failure", () => {
    expect(nextPollDelay(null, 60_000, now)).toBe(60_000);
    expect(nextPollDelay({ kind: "unreachable", message: "x", resetAt: null }, 60_000, now)).toBe(60_000);
  });

  it("waits until a rate limit resets when that is later than the next poll", () => {
    const error = { kind: "rate_limit", message: "x", resetAt: "2026-10-30T12:40:00.000Z" } as const;

    expect(nextPollDelay(error, 60_000, now)).toBe(40 * 60_000);
  });

  it("does not poll sooner than the interval when the rate limit resets earlier", () => {
    const error = { kind: "rate_limit", message: "x", resetAt: "2026-10-30T12:00:10.000Z" } as const;

    expect(nextPollDelay(error, 60_000, now)).toBe(60_000);
  });
});
