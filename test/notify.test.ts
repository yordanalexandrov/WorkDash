import { describe, expect, it } from "vitest";
import { EVENT_TYPES, type EventType, type PrEvent } from "../src/domain/events.js";
import { ALL_ENABLED, isQuietAt, type NotificationRules, parseQuietHours, summarizeMissed } from "../src/domain/notify.js";

const event = (n: number, type: EventType = "mention"): PrEvent => ({
  id: `${type}:my-org/repo-a#${n}:c${n}`,
  type,
  repo: "my-org/repo-a",
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/my-org/repo-a/pull/${n}`,
  actor: "colleague1",
});

const rules = (disabled: EventType[] = []): NotificationRules => ({
  enabled: Object.fromEntries(EVENT_TYPES.map((type) => [type, !disabled.includes(type)])) as NotificationRules["enabled"],
  quietHours: null,
});

describe("ALL_ENABLED", () => {
  it("turns every event type on, the team's new PRs too", () => {
    expect(ALL_ENABLED).toEqual(rules());
  });
});

describe("summarizeMissed", () => {
  it("counts the missed events by type and lists the newest first", () => {
    const missed = summarizeMissed([event(1), event(2, "review_requested"), event(3)], rules(), 50);

    expect(missed).toEqual({ total: 3, byType: { mention: 2, review_requested: 1 }, events: [event(3), event(2, "review_requested"), event(1)] });
  });

  it("lists at most `limit` events but counts them all", () => {
    const missed = summarizeMissed([event(68), event(69), event(70)], rules(), 2);

    expect(missed).toEqual({ total: 3, byType: { mention: 3 }, events: [event(70), event(69)] });
  });

  it("leaves out the types that are turned off", () => {
    const missed = summarizeMissed([event(1, "team_pr_opened"), event(2), event(3, "team_pr_opened")], rules(["team_pr_opened"]), 1);

    expect(missed).toEqual({ total: 1, byType: { mention: 1 }, events: [event(2)] });
  });

  it("is null when nothing was missed", () => {
    expect(summarizeMissed([], rules(), 50)).toBeNull();
    expect(summarizeMissed([event(1)], rules(["mention"]), 50)).toBeNull();
  });
});

describe("parseQuietHours", () => {
  it("reads HH:MM-HH:MM as minutes of the day", () => {
    expect(parseQuietHours("19:00-09:30")).toEqual({ start: 19 * 60, end: 9 * 60 + 30 });
  });

  it.each(["19-09", "25:00-09:00", "19:00-09:60", "19:00", "19:00-19:00", ""])("rejects %j", (text) => {
    expect(parseQuietHours(text)).toBeNull();
  });
});

describe("isQuietAt", () => {
  const utc = (hhmm: string) => new Date(`2026-10-30T${hhmm}:00Z`);

  it("is quiet inside a range within one day, up to but not including its end", () => {
    const quiet = parseQuietHours("12:00-14:00");
    expect(isQuietAt(quiet, utc("11:59"), "UTC")).toBe(false);
    expect(isQuietAt(quiet, utc("12:00"), "UTC")).toBe(true);
    expect(isQuietAt(quiet, utc("13:59"), "UTC")).toBe(true);
    expect(isQuietAt(quiet, utc("14:00"), "UTC")).toBe(false);
  });

  it("is quiet across midnight for a range such as 19:00-09:00", () => {
    const quiet = parseQuietHours("19:00-09:00");
    expect(isQuietAt(quiet, utc("18:59"), "UTC")).toBe(false);
    expect(isQuietAt(quiet, utc("19:00"), "UTC")).toBe(true);
    expect(isQuietAt(quiet, utc("23:59"), "UTC")).toBe(true);
    expect(isQuietAt(quiet, utc("00:00"), "UTC")).toBe(true);
    expect(isQuietAt(quiet, utc("08:59"), "UTC")).toBe(true);
    expect(isQuietAt(quiet, utc("09:00"), "UTC")).toBe(false);
    expect(isQuietAt(quiet, utc("12:00"), "UTC")).toBe(false);
  });

  it("reads the clock in the given time zone", () => {
    const quiet = parseQuietHours("19:00-09:00");
    // 17:30 UTC is 19:30 in Sofia (EET, UTC+2) at the end of October.
    expect(isQuietAt(quiet, utc("17:30"), "UTC")).toBe(false);
    expect(isQuietAt(quiet, utc("17:30"), "Europe/Sofia")).toBe(true);
  });

  it("is never quiet without quiet hours", () => {
    expect(isQuietAt(null, utc("03:00"), "UTC")).toBe(false);
  });
});
