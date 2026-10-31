import { describe, expect, it } from "vitest";
import { answerIssueDemand } from "../src/domain/issue-poll.js";

const now = new Date("2026-10-31T12:00:00Z");
const rateLimit = { kind: "rate_limit" as const, message: "API rate limit exceeded", resetAt: "2026-10-31T12:20:00Z" };

describe("answerIssueDemand", () => {
  it("polls a repo opened when its last poll is a minute old or more", () => {
    expect(answerIssueDemand({ demand: "open", polling: false, lastPolledAt: "2026-10-31T11:59:00Z", error: null, now })).toBe("poll");
  });

  it("shows what is saved for a repo opened again within a minute of its last poll", () => {
    expect(answerIssueDemand({ demand: "open", polling: false, lastPolledAt: "2026-10-31T11:59:01Z", error: null, now })).toBe("skip");
  });

  it("polls a repo opened for the first time", () => {
    expect(answerIssueDemand({ demand: "open", polling: false, lastPolledAt: null, error: null, now })).toBe("poll");
  });

  it("polls on the button however recent the last poll is", () => {
    expect(answerIssueDemand({ demand: "button", polling: false, lastPolledAt: "2026-10-31T11:59:59Z", error: null, now })).toBe("poll");
  });

  it("waits for the poll of the repo under way instead of starting a second one", () => {
    expect(answerIssueDemand({ demand: "open", polling: true, lastPolledAt: null, error: null, now })).toBe("join");
    expect(answerIssueDemand({ demand: "button", polling: true, lastPolledAt: null, error: null, now })).toBe("join");
  });

  it("does nothing, not even on the button, until a rate limit lifts", () => {
    expect(answerIssueDemand({ demand: "button", polling: false, lastPolledAt: "2026-10-31T11:00:00Z", error: rateLimit, now })).toBe("skip");
    expect(
      answerIssueDemand({ demand: "button", polling: false, lastPolledAt: "2026-10-31T11:00:00Z", error: rateLimit, now: new Date("2026-10-31T12:20:00Z") }),
    ).toBe("poll");
  });
});
