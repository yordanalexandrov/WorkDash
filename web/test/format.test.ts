import { describe, expect, it } from "vitest";
import type { DashboardState } from "../src/api.js";
import { age, errorText, statusText } from "../src/format.js";

const now = new Date("2026-10-30T12:00:00Z");

function dashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    viewer: "me",
    fetchedAt: "2026-10-30T10:00:00Z",
    pollIntervalMs: 60_000,
    error: null,
    problems: [],
    sections: [],
    ...overrides,
  };
}

describe("statusText", () => {
  it("says it is loading before the server has answered", () => {
    expect(statusText(null)).toBe("Зареждане…");
  });

  it("says it waits for the first poll while nothing has been fetched", () => {
    expect(statusText(dashboard({ viewer: null, fetchedAt: null }))).toBe("Чака първия poll…");
  });

  it("names the viewer and when the snapshot was fetched", () => {
    const fetchedAt = "2026-10-30T10:00:00Z";
    expect(statusText(dashboard({ fetchedAt }))).toBe(`me · последен успешен poll в ${new Date(fetchedAt).toLocaleTimeString()}`);
  });
});

describe("errorText", () => {
  it("is empty while the stream is connected and the last poll succeeded", () => {
    expect(errorText(dashboard(), "open")).toBeNull();
  });

  it("is empty while connecting for the first time", () => {
    expect(errorText(null, "connecting")).toBeNull();
  });

  it("reports a token GitHub rejects", () => {
    const error = { kind: "auth", message: "GitHub API responded 401: Bad credentials", resetAt: null } as const;

    expect(errorText(dashboard({ error }), "open")).toBe(
      "GitHub отказва токена (невалиден или изтекъл): GitHub API responded 401: Bad credentials",
    );
  });

  it("reports a rate limit with the time it resets", () => {
    const resetAt = "2026-10-30T12:40:00.000Z";
    const error = { kind: "rate_limit", message: "API rate limit exceeded", resetAt } as const;

    expect(errorText(dashboard({ error }), "open")).toBe(
      `Изчерпан rate limit на GitHub, нов опит в ${new Date(resetAt).toLocaleTimeString()}`,
    );
  });

  it("reports a rate limit without a known reset time", () => {
    const error = { kind: "rate_limit", message: "API rate limit exceeded", resetAt: null } as const;

    expect(errorText(dashboard({ error }), "open")).toBe("Изчерпан rate limit на GitHub: API rate limit exceeded");
  });

  it("reports GitHub being unreachable", () => {
    const error = { kind: "unreachable", message: "fetch failed: getaddrinfo ENOTFOUND", resetAt: null } as const;

    expect(errorText(dashboard({ error }), "open")).toBe("GitHub е недостъпен: fetch failed: getaddrinfo ENOTFOUND");
  });

  it("reports any other failed poll", () => {
    const error = { kind: "other", message: "GitHub GraphQL error: boom", resetAt: null } as const;

    expect(errorText(dashboard({ error }), "open")).toBe("Последният poll е неуспешен: GitHub GraphQL error: boom");
  });

  it("reports what a successful poll could not fetch", () => {
    expect(errorText(dashboard({ problems: ["a", "b"] }), "open")).toBe("Последният poll е непълен: a; b");
  });

  it("reports a lost server ahead of an older poll failure", () => {
    const error = { kind: "auth", message: "401", resetAt: null } as const;

    expect(errorText(dashboard({ error }), "reconnecting")).toBe("Няма връзка със сървъра, свързване отново…");
  });
});

describe("age", () => {
  it.each([
    ["2026-10-30T11:30:00Z", "<1ч"],
    ["2026-10-30T07:00:00Z", "5ч"],
    ["2026-10-29T13:00:00Z", "23ч"],
    ["2026-10-27T11:00:00Z", "3д"],
  ])("shows a PR opened at %s as %s", (since, expected) => {
    expect(age(since, now)).toBe(expected);
  });
});
