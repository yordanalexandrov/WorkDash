import { describe, expect, it, vi } from "vitest";
import type { PrEvent } from "../../src/domain/events.js";
import { notificationPermission, notificationText, showNotification } from "../src/notifications.js";

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
