import { describe, expect, it, vi } from "vitest";
import type { PrEvent } from "../../src/domain/events.js";
import type { Missed } from "../../src/domain/notify.js";
import { mergeMissed, missedText, notificationPermission, notificationText, showMissedNotification, showNotification } from "../src/notifications.js";

const event = (overrides: Partial<PrEvent> = {}): PrEvent => ({
  id: "mention:my-org/repo-a#7:c1",
  type: "mention",
  repo: "my-org/repo-a",
  number: 7,
  title: "Add login",
  url: "https://github.com/my-org/repo-a/pull/7",
  actor: "colleague1",
  ...overrides,
});

describe("notificationText", () => {
  it("titles the notification with the PR and says what happened", () => {
    expect(notificationText(event())).toEqual({ title: "Add login", body: "colleague1 те спомена · my-org/repo-a#7" });
  });

  it.each([
    [{ type: "review_requested" }, "colleague1 иска review от теб"],
    [{ type: "new_comment_on_my_pr" }, "Нов коментар от colleague1"],
    [{ type: "review_on_my_pr", review: "APPROVED" }, "colleague1 одобри"],
    [{ type: "review_on_my_pr", review: "CHANGES_REQUESTED" }, "colleague1 поиска промени"],
    [{ type: "review_on_my_pr", review: "COMMENTED" }, "colleague1 остави review"],
    [{ type: "ci_failed_on_my_pr" }, "CI се провали"],
    [{ type: "my_pr_ready_to_merge" }, "Готов за merge"],
    [{ type: "re_review_needed" }, "Има ново след твоето review"],
    [{ type: "team_pr_opened" }, "colleague1 отвори PR"],
  ] as [Partial<PrEvent>, string][])("describes %o as %s", (overrides, text) => {
    expect(notificationText(event(overrides)).body).toBe(`${text} · my-org/repo-a#7`);
  });
});

/** A stand-in for the browser's Notification constructor. */
function fakeNotification(permission: NotificationPermission) {
  const shown: { title: string; options?: NotificationOptions; onclick: (() => void) | null }[] = [];
  const Fake = function (this: (typeof shown)[number], title: string, options?: NotificationOptions) {
    Object.assign(this, { title, options, onclick: null, close() {} });
    shown.push(this);
  } as unknown as typeof Notification;
  Object.assign(Fake, { permission, requestPermission: vi.fn(async () => "granted") });
  return { Notification: Fake, shown };
}

describe("showNotification", () => {
  it("shows it through the service worker, which opens the PR on click", async () => {
    const registration = { showNotification: vi.fn(async () => {}) } as unknown as ServiceWorkerRegistration;
    const { Notification, shown } = fakeNotification("granted");

    expect(await showNotification(event(), { Notification, registration: Promise.resolve(registration) })).toBe(true);

    expect(registration.showNotification).toHaveBeenCalledWith("Add login", {
      body: "colleague1 те спомена · my-org/repo-a#7",
      tag: "mention:my-org/repo-a#7:c1",
      data: { url: "https://github.com/my-org/repo-a/pull/7" },
    });
    expect(shown).toEqual([]);
  });

  it("falls back to a plain notification that opens the PR on click", async () => {
    const { Notification, shown } = fakeNotification("granted");
    const open = vi.fn();

    expect(await showNotification(event(), { Notification, registration: Promise.resolve(null), open })).toBe(true);
    shown[0]!.onclick!();

    expect(shown[0]).toMatchObject({ title: "Add login", options: { body: "colleague1 те спомена · my-org/repo-a#7", tag: "mention:my-org/repo-a#7:c1" } });
    expect(open).toHaveBeenCalledWith("https://github.com/my-org/repo-a/pull/7");
  });

  it("shows nothing without permission", async () => {
    const { Notification, shown } = fakeNotification("denied");

    expect(await showNotification(event(), { Notification, registration: Promise.resolve(null) })).toBe(false);
    expect(shown).toEqual([]);
  });

  it("shows nothing in a browser without notifications", async () => {
    expect(await showNotification(event(), { Notification: undefined, registration: Promise.resolve(null) })).toBe(false);
  });
});

describe("notificationPermission", () => {
  it("reports the browser's permission, or unsupported when there are no notifications", () => {
    expect(notificationPermission(fakeNotification("denied").Notification)).toBe("denied");
    expect(notificationPermission(undefined)).toBe("unsupported");
  });
});

const missed = (overrides: Partial<Missed> = {}): Missed => ({
  total: 3,
  byType: { review_requested: 1, mention: 2 },
  events: [event({ id: "c", number: 3 }), event({ id: "b", number: 2 }), event({ id: "a", type: "review_requested", number: 1 })],
  ...overrides,
});

describe("missedText", () => {
  it("says how many were missed and of which kind, in the order of the event types", () => {
    expect(missedText(missed())).toEqual({ title: "3 пропуснати събития", body: "Искания за review: 1 · Споменавания: 2" });
  });

  it("uses the singular for one", () => {
    expect(missedText(missed({ total: 1, byType: { ci_failed_on_my_pr: 1 } })).title).toBe("1 пропуснато събитие");
  });
});

describe("showMissedNotification", () => {
  it("shows one summary notification that brings the dashboard forward", async () => {
    const registration = { showNotification: vi.fn(async () => {}) } as unknown as ServiceWorkerRegistration;
    const { Notification } = fakeNotification("granted");

    expect(await showMissedNotification(missed(), { Notification, registration: Promise.resolve(registration) })).toBe(true);

    expect(registration.showNotification).toHaveBeenCalledWith("3 пропуснати събития", {
      body: "Искания за review: 1 · Споменавания: 2",
      tag: "missed",
    });
  });

  it("shows nothing without permission", async () => {
    const { Notification, shown } = fakeNotification("denied");

    expect(await showMissedNotification(missed(), { Notification, registration: Promise.resolve(null) })).toBe(false);
    expect(shown).toEqual([]);
  });
});

describe("mergeMissed", () => {
  it("takes the first summary as it is", () => {
    expect(mergeMissed(null, missed())).toEqual(missed());
  });

  it("adds a later summary on top of the one still shown, newest first", () => {
    const later = missed({ total: 2, byType: { mention: 1, team_pr_opened: 1 }, events: [event({ id: "e", number: 5 }), event({ id: "d", number: 4 })] });

    expect(mergeMissed(missed(), later)).toEqual({
      total: 5,
      byType: { review_requested: 1, mention: 3, team_pr_opened: 1 },
      events: [...later.events, ...missed().events],
    });
  });
});
