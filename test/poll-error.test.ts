import { describe, expect, it } from "vitest";
import { classifyPollError, nextPollDelay } from "../src/domain/poll-error.js";
import { GitHubError } from "../src/github/client.js";

const now = new Date("2026-10-30T12:00:00Z");
const resetEpoch = String(Date.parse("2026-10-30T12:40:00Z") / 1000);

describe("classifyPollError", () => {
  it("reads a 401 as a bad or expired token", () => {
    const error = new GitHubError("GitHub API responded 401: Bad credentials", { status: 401 });

    expect(classifyPollError(error, now)).toEqual({
      kind: "auth",
      message: "GitHub API responded 401: Bad credentials",
      resetAt: null,
    });
  });

  it("reads a 403 that is not a rate limit as a token without access", () => {
    const error = new GitHubError("GitHub API responded 403: Resource protected by organization SAML enforcement", {
      status: 403,
      headers: { "x-ratelimit-remaining": "4999" },
    });

    expect(classifyPollError(error, now).kind).toBe("auth");
  });

  it("reads an exhausted primary rate limit with its reset time", () => {
    const error = new GitHubError("GitHub API responded 403: API rate limit exceeded", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetEpoch },
    });

    expect(classifyPollError(error, now)).toEqual({
      kind: "rate_limit",
      message: "GitHub API responded 403: API rate limit exceeded",
      resetAt: "2026-10-30T12:40:00.000Z",
    });
  });

  it("reads GraphQL's RATE_LIMITED error, which comes back with status 200", () => {
    const error = new GitHubError("GitHub GraphQL error: API rate limit exceeded", {
      status: 200,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetEpoch },
      errorTypes: ["RATE_LIMITED"],
    });

    expect(classifyPollError(error, now)).toMatchObject({ kind: "rate_limit", resetAt: "2026-10-30T12:40:00.000Z" });
  });

  it("reads a secondary rate limit's retry-after as the reset time", () => {
    const error = new GitHubError("GitHub API responded 429: You have exceeded a secondary rate limit", {
      status: 429,
      headers: { "retry-after": "90" },
    });

    expect(classifyPollError(error, now)).toMatchObject({ kind: "rate_limit", resetAt: "2026-10-30T12:01:30.000Z" });
  });

  it("has no reset time for a rate limit that does not say when it ends", () => {
    const error = new GitHubError("GitHub API responded 429: Too many requests", { status: 429 });

    expect(classifyPollError(error, now)).toMatchObject({ kind: "rate_limit", resetAt: null });
  });

  it.each([
    ["a server error", new GitHubError("GitHub API responded 502: Bad Gateway", { status: 502 })],
    ["a failed connection", new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND api.github.com") })],
    ["a timeout", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
  ])("reads %s as GitHub being unreachable", (_, error) => {
    expect(classifyPollError(error, now).kind).toBe("unreachable");
  });

  it("names the network cause of a failed connection", () => {
    const error = new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND api.github.com") });

    expect(classifyPollError(error, now).message).toBe("fetch failed: getaddrinfo ENOTFOUND api.github.com");
  });

  it("keeps anything else as a plain failure", () => {
    const error = new GitHubError("GitHub GraphQL error: Something went wrong", { status: 200 });

    expect(classifyPollError(error, now)).toEqual({
      kind: "other",
      message: "GitHub GraphQL error: Something went wrong",
      resetAt: null,
    });
  });
});

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
