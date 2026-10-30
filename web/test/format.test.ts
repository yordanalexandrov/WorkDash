import { describe, expect, it } from "vitest";
import type { DashboardState } from "../src/api.js";
import { age, configErrorText, errorText, statusText } from "../src/format.js";

const now = new Date("2026-10-30T12:00:00Z");

function dashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return { viewer: "me", fetchedAt: "2026-10-30T10:00:00Z", pollIntervalMs: 60_000, error: null, configError: null, sections: [], recentlyClosed: [], ...overrides };
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
    expect(statusText(dashboard({ fetchedAt }))).toBe(`me · обновено ${new Date(fetchedAt).toLocaleTimeString()}`);
  });
});

describe("errorText", () => {
  it("is empty while the server answers and the last poll succeeded", () => {
    expect(errorText(dashboard(), null)).toBeNull();
  });

  it("reports a failed poll", () => {
    expect(errorText(dashboard({ error: "GitHub API responded 401" }), null)).toBe(
      "Последният poll е неуспешен: GitHub API responded 401",
    );
  });

  it("reports a lost server ahead of an older poll failure", () => {
    expect(errorText(dashboard({ error: "GitHub API responded 401" }), "Failed to fetch")).toBe(
      "Няма връзка със сървъра: Failed to fetch",
    );
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
