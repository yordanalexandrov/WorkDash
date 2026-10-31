import { describe, expect, it } from "vitest";
import type { DashboardState, IssueBoardState } from "../src/api.js";
import { age, configErrorText, errorText, intervalText, issueErrorText, issueStatusText, pollButton, statusText } from "../src/format.js";

const now = new Date("2026-10-30T12:00:00Z");

function dashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    viewer: "me",
    fetchedAt: "2026-10-30T10:00:00Z",
    pollIntervalMs: 60_000,
    error: null,
    problems: [],
    configError: null,
    missing: [],
    pollMode: "periodic",
    issueRepos: [],
    polling: false,
    sections: [],
    recentlyClosed: [],
    ...overrides,
  };
}

function issueBoard(overrides: Partial<IssueBoardState> = {}): IssueBoardState {
  return { repo: "my-org/repo-a", fetchedAt: "2026-10-30T11:35:00Z", stages: [], issues: [], closed: [], totalCount: 0, polling: false, error: null, ...overrides };
}

describe("statusText", () => {
  it("says it is loading before the server has answered", () => {
    expect(statusText(null, now)).toEqual({ text: "Зареждане…", stale: false });
  });

  it("says it waits for the first poll while nothing has been fetched", () => {
    expect(statusText(dashboard({ viewer: null, fetchedAt: null }), now)).toEqual({ text: "Чака първия poll…", stale: false });
  });

  it("names the viewer and when the snapshot was fetched", () => {
    const fetchedAt = "2026-10-30T10:00:00Z";
    expect(statusText(dashboard({ fetchedAt }), now)).toEqual({ text: `me · последен успешен poll в ${new Date(fetchedAt).toLocaleTimeString()}`, stale: false });
  });

  describe("in On-demand", () => {
    const at = (fetchedAt: string) => statusText(dashboard({ pollMode: "on_demand", fetchedAt }), now);

    it("says how long ago the last poll was, since nothing polls until I ask", () => {
      expect(at("2026-10-30T11:59:30Z")).toEqual({ text: "me · последен poll току-що", stale: false });
      expect(at("2026-10-30T11:35:00Z")).toEqual({ text: "me · последен poll преди 25 мин", stale: false });
    });

    it("marks the data stale once the last poll is an hour old", () => {
      expect(at("2026-10-30T11:00:01Z")).toEqual({ text: "me · последен poll преди 59 мин", stale: false });
      expect(at("2026-10-30T11:00:00Z")).toEqual({ text: "me · последен poll преди 1 ч", stale: true });
      expect(at("2026-10-28T09:00:00Z")).toEqual({ text: "me · последен poll преди 2 д", stale: true });
    });
  });
});

describe("issueStatusText", () => {
  it("says it is loading before the server has answered for the open repo", () => {
    expect(issueStatusText(null, now)).toEqual({ text: "Зареждане…", stale: false });
  });

  it("says it waits for the first poll while nothing is saved for the repo", () => {
    expect(issueStatusText(issueBoard({ fetchedAt: null }), now)).toEqual({ text: "Чака първия poll…", stale: false });
  });

  it("names the open repo and says how old its snapshot is, in either mode", () => {
    expect(issueStatusText(issueBoard({ fetchedAt: "2026-10-30T11:59:30Z" }), now)).toEqual({ text: "repo-a · последен poll току-що", stale: false });
    expect(issueStatusText(issueBoard({ fetchedAt: "2026-10-30T11:35:00Z" }), now)).toEqual({ text: "repo-a · последен poll преди 25 мин", stale: false });
  });

  it("marks the snapshot stale once it is an hour old", () => {
    expect(issueStatusText(issueBoard({ fetchedAt: "2026-10-30T11:00:01Z" }), now)).toEqual({ text: "repo-a · последен poll преди 59 мин", stale: false });
    expect(issueStatusText(issueBoard({ fetchedAt: "2026-10-30T11:00:00Z" }), now)).toEqual({ text: "repo-a · последен poll преди 1 ч", stale: true });
  });
});

describe("intervalText", () => {
  it("names the poll interval the way config.yaml would", () => {
    expect(intervalText(60_000)).toBe("60s");
    expect(intervalText(90_000)).toBe("90s");
    expect(intervalText(300_000)).toBe("5 мин");
    expect(intervalText(3_600_000)).toBe("1 ч");
  });
});

describe("pollButton", () => {
  it("is ready while nothing holds it back", () => {
    expect(pollButton(dashboard(), now)).toEqual({ label: "Обнови", disabled: false });
  });

  it("waits until a rate limit lifts, saying when", () => {
    const resetAt = "2026-10-30T12:40:00.000Z";
    const error = { kind: "rate_limit", message: "API rate limit exceeded", resetAt } as const;
    const time = new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    expect(pollButton(dashboard({ error }), now)).toEqual({ label: `Обнови (след ${time})`, disabled: true });
    expect(pollButton(dashboard({ error }), new Date(resetAt))).toEqual({ label: "Обнови", disabled: false });
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
      "GitHub отказва токена (невалиден или изтекъл), poll-ът е спрян до нов токен: GitHub API responded 401: Bad credentials",
    );
  });

  it("does not promise a new try in On-demand, where none comes until I ask", () => {
    const resetAt = "2026-10-30T12:40:00.000Z";
    const error = { kind: "rate_limit", message: "API rate limit exceeded", resetAt } as const;

    expect(errorText(dashboard({ error, pollMode: "on_demand" }), "open")).toBe(
      `Изчерпан rate limit на GitHub, „Обнови“ работи пак от ${new Date(resetAt).toLocaleTimeString()}`,
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

describe("configErrorText", () => {
  it("is empty before the server answers and while config.yaml is in effect", () => {
    expect(configErrorText(null)).toBeNull();
    expect(configErrorText(dashboard())).toBeNull();
  });

  it("reports why config.yaml is not in effect and that the last valid config still is", () => {
    expect(configErrorText(dashboard({ configError: "config.yaml: invalid YAML: bad indentation" }))).toBe(
      "config.yaml не е приложен, в сила е последната валидна конфигурация. config.yaml: invalid YAML: bad indentation",
    );
  });
});

describe("issueErrorText", () => {
  it("is null while the open repo's last poll succeeded", () => {
    expect(issueErrorText(issueBoard(), "periodic", "open")).toBeNull();
    expect(issueErrorText(null, "periodic", "open")).toBeNull();
  });

  it("says why the open repo's last poll failed, with issues saved or not", () => {
    const error = { kind: "unreachable", message: "fetch failed", resetAt: null } as const;

    expect(issueErrorText(issueBoard({ error }), "periodic", "open")).toBe("GitHub е недостъпен: fetch failed");
    expect(issueErrorText(issueBoard({ error, fetchedAt: null }), "periodic", "open")).toBe("GitHub е недостъпен: fetch failed");
  });

  it("says when \"Обнови\" works again in On-demand while a rate limit lasts", () => {
    const error = { kind: "rate_limit", message: "API rate limit exceeded", resetAt: "2026-10-30T12:20:00Z" } as const;

    expect(issueErrorText(issueBoard({ error }), "on_demand", "open")).toBe(
      `Изчерпан rate limit на GitHub, „Обнови“ работи пак от ${new Date("2026-10-30T12:20:00Z").toLocaleTimeString()}`,
    );
  });

  it("reports a lost server ahead of a poll failure", () => {
    const error = { kind: "auth", message: "401", resetAt: null } as const;

    expect(issueErrorText(issueBoard({ error }), "periodic", "reconnecting")).toBe("Няма връзка със сървъра, свързване отново…");
  });
});
