import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import type { ClassifyRules } from "../src/domain/classify.js";
import type { EventType } from "../src/domain/events.js";
import { ALL_ENABLED, type Missed, type NotificationRules, parseQuietHours } from "../src/domain/notify.js";
import type { PollMode } from "../src/domain/poll-mode.js";
import type { PullRequest } from "../src/domain/types.js";
import { createNotifier } from "../src/notifier.js";
import { createEventHub, formatEvent } from "../src/sse.js";
import { pullRequest } from "./fixtures.js";

const rules: ClassifyRules = { team: ["colleague1"], requiredApprovals: 1 };

/** A stand-in for an open browser that collects what the hub writes to it. */
function browser() {
  const stream = new PassThrough();
  let text = "";
  stream.on("data", (chunk) => (text += chunk));
  return { stream, text: () => text };
}

/** The SSE events of one type a browser got, parsed. */
function received(text: string, type: string): unknown[] {
  return [...text.matchAll(new RegExp(`event: ${type}\\ndata: (.*)\\n\\n`, "g"))].map((match) => JSON.parse(match[1]!));
}

const at = "2026-10-30T10:00:00.000Z";
const before = { viewer: "me", pullRequests: [pullRequest({ author: "colleague1" })], fetchedAt: at };
const requested = (pr: Partial<PullRequest> = {}) => ({ viewer: "me", pullRequests: [pullRequest({ author: "colleague1", requestedReviewers: ["me"], ...pr })] });
/** Two PRs on which I was asked for a review, the previous poll having neither. */
const twoRequested = {
  viewer: "me",
  pullRequests: [pullRequest({ number: 1, author: "colleague1", requestedReviewers: ["me"] }), pullRequest({ number: 2, author: "colleague1", requestedReviewers: ["me"] })],
};
const beforeTwo = { viewer: "me", pullRequests: [pullRequest({ number: 1, author: "colleague1" }), pullRequest({ number: 2, author: "colleague1" })], fetchedAt: at };

const disabled = (...types: EventType[]): NotificationRules => ({
  ...ALL_ENABLED,
  enabled: { ...ALL_ENABLED.enabled, ...Object.fromEntries(types.map((type) => [type, false])) },
});
const quiet: NotificationRules = { ...ALL_ENABLED, quietHours: parseQuietHours("19:00-09:00") };
const evening = new Date("2026-10-30T20:00:00Z");
const morning = new Date("2026-10-31T09:00:00Z");

function setup(notifications: NotificationRules = ALL_ENABLED, start = new Date("2026-10-30T12:00:00Z")) {
  const store = openStore(":memory:");
  const hub = createEventHub();
  const clock = { now: start };
  const settings: { notifications: NotificationRules; pollMode: PollMode } = { notifications, pollMode: "periodic" };
  const notifier = createNotifier({
    store,
    events: hub,
    rules: () => rules,
    notifications: () => settings.notifications,
    pollMode: () => settings.pollMode,
    timeZone: "UTC",
    now: () => clock.now,
  });
  return { store, hub, notifier, clock, settings };
}

describe("createNotifier", () => {
  it("pushes a new event to the open browsers and marks it delivered once a browser says it showed it", () => {
    const { store, hub, notifier } = setup();
    const page = browser();
    hub.connect(page.stream);

    notifier.afterSnapshot(before, requested());

    expect(page.text()).toContain("event: notification\n");
    expect(page.text()).toContain('"id":"review_requested:my-org/repo-a#1:none"');
    expect(store.undeliveredEvents()).toHaveLength(1);
    notifier.acknowledge(["review_requested:my-org/repo-a#1:none"]);
    expect(store.undeliveredEvents()).toEqual([]);
    hub.close();
  });

  it("lists a pushed event no browser showed as missed, once its acknowledgement is overdue", () => {
    const { hub, notifier, clock } = setup();
    const page = browser();
    hub.connect(page.stream);
    notifier.afterSnapshot(before, requested());

    notifier.flushMissed();
    expect(received(page.text(), "missed")).toEqual([]);
    clock.now = new Date(clock.now.getTime() + 60_000);
    notifier.flushMissed();

    expect(received(page.text(), "missed")).toEqual([expect.objectContaining({ total: 1, events: [expect.objectContaining({ number: 1 })] })]);
    hub.close();
  });

  it("sends the same event only once, even after a restart", () => {
    const { store, hub, notifier } = setup();
    const page = browser();
    hub.connect(page.stream);
    notifier.afterSnapshot(before, requested());
    const restarted = createNotifier({ store, events: hub, rules: () => rules, notifications: () => ALL_ENABLED });

    restarted.afterSnapshot(before, requested());

    expect(page.text().split("event: notification\n")).toHaveLength(2);
    hub.close();
  });

  it("records nothing on the first poll ever", () => {
    const { store, notifier } = setup();

    notifier.afterSnapshot(null, requested());

    expect(store.undeliveredEvents()).toEqual([]);
    expect(notifier.takePending()).toEqual([]);
  });

  it("formats a pushed event as an SSE notification", () => {
    const { hub, notifier } = setup();
    const page = browser();
    hub.connect(page.stream);

    notifier.afterSnapshot(before, requested());

    expect(page.text()).toBe(
      "retry: 3000\n\n" +
        formatEvent("notification", {
          id: "review_requested:my-org/repo-a#1:none",
          type: "review_requested",
          repo: "my-org/repo-a",
          number: 1,
          title: "PR 1",
          url: "https://github.com/my-org/repo-a/pull/1",
          actor: "colleague1",
        }),
    );
    hub.close();
  });

  describe("event types turned off", () => {
    it("records the event but never notifies it", () => {
      const { hub, notifier, settings } = setup(disabled("review_requested"));
      const page = browser();
      hub.connect(page.stream);

      notifier.afterSnapshot(before, requested());
      // Recorded: turning the type back on does not bring the same event up again.
      settings.notifications = ALL_ENABLED;
      notifier.afterSnapshot(before, requested());

      expect(page.text()).toBe("retry: 3000\n\n");
      hub.close();
    });

    it("does not count it as missed", () => {
      const { notifier } = setup(disabled("review_requested"));

      notifier.afterSnapshot(before, requested());

      expect(notifier.takePending()).toEqual([]);
    });

    it("follows a config reload: a type turned off later is not handed over as missed", () => {
      const { notifier, settings } = setup();
      notifier.afterSnapshot(before, requested());

      settings.notifications = disabled("review_requested");

      expect(notifier.takePending()).toEqual([]);
    });
  });

  describe("missed events", () => {
    it("hands a browser that connects one summary of what happened while none was open", () => {
      const { store, notifier } = setup();
      notifier.afterSnapshot(beforeTwo, twoRequested);

      const pending = notifier.takePending();

      expect(pending).toEqual([
        {
          type: "missed",
          data: {
            total: 2,
            byType: { review_requested: 2 },
            events: [expect.objectContaining({ number: 2 }), expect.objectContaining({ number: 1 })],
            quiet: false,
          },
        },
      ]);
      expect(store.undeliveredEvents()).toEqual([]);
      expect(notifier.takePending()).toEqual([]);
    });

    it("lists only the newest 50 but counts them all", () => {
      const { notifier } = setup();
      const many = (requestedReviewers: string[]) =>
        Array.from({ length: 60 }, (_, index) => pullRequest({ number: index + 1, author: "colleague1", requestedReviewers }));
      notifier.afterSnapshot({ viewer: "me", pullRequests: many([]), fetchedAt: at }, { viewer: "me", pullRequests: many(["me"]) });

      const missed = notifier.takePending()[0]?.data as Missed;

      expect(missed.total).toBe(60);
      expect(missed.events).toHaveLength(50);
      expect(missed.events[0]!.number).toBe(60);
    });

    it("records events in quiet hours without notifying, and counts them as missed", () => {
      const { store, hub, notifier } = setup(quiet, evening);
      const page = browser();
      hub.connect(page.stream);

      notifier.afterSnapshot(before, requested());

      expect(page.text()).toBe("retry: 3000\n\n");
      expect(store.undeliveredEvents()).toHaveLength(1);
      hub.close();
    });

    it("lists the missed events for a browser that connects in quiet hours, without a desktop notification", () => {
      const { store, notifier } = setup(quiet, evening);
      notifier.afterSnapshot(before, requested());

      expect(notifier.takePending()).toEqual([
        { type: "missed", data: { total: 1, byType: { review_requested: 1 }, events: [expect.objectContaining({ number: 1 })], quiet: true } },
      ]);
      expect(store.undeliveredEvents()).toEqual([]);
    });

    it("sends the open browsers the summary once quiet hours are over", () => {
      const { hub, notifier, clock } = setup(quiet, evening);
      const page = browser();
      hub.connect(page.stream);
      notifier.afterSnapshot(before, requested());
      notifier.flushMissed();
      expect(received(page.text(), "missed")).toEqual([]);

      clock.now = morning;
      notifier.flushMissed();
      notifier.flushMissed();

      expect(received(page.text(), "missed")).toEqual([{ total: 1, byType: { review_requested: 1 }, events: [expect.objectContaining({ number: 1 })], quiet: false }]);
      hub.close();
    });

    it("after quiet hours, notifies a new event on its own and sums up the ones from the quiet hours", () => {
      const { hub, notifier, clock } = setup(quiet, evening);
      const page = browser();
      hub.connect(page.stream);
      notifier.afterSnapshot(beforeTwo, { viewer: "me", pullRequests: [twoRequested.pullRequests[0]!, beforeTwo.pullRequests[1]!] });

      clock.now = morning;
      notifier.afterSnapshot({ ...beforeTwo, pullRequests: [twoRequested.pullRequests[0]!, beforeTwo.pullRequests[1]!] }, twoRequested);

      expect(received(page.text(), "notification")).toEqual([expect.objectContaining({ number: 2 })]);
      expect(received(page.text(), "missed")).toEqual([expect.objectContaining({ total: 1, events: [expect.objectContaining({ number: 1 })] })]);
      hub.close();
    });

    it("sends no summary when there is no browser to show it", () => {
      const { store, notifier } = setup();
      notifier.afterSnapshot(before, requested());

      notifier.flushMissed();

      expect(store.undeliveredEvents()).toHaveLength(1);
    });
  });

  describe("while notifications are paused", () => {
    it("records an event without pushing it, and keeps it undelivered", () => {
      const { store, hub, notifier } = setup();
      const page = browser();
      hub.connect(page.stream);

      notifier.setPaused(true);
      notifier.afterSnapshot(before, requested());

      expect(page.text()).toBe("retry: 3000\n\n");
      expect(store.undeliveredEvents()).toHaveLength(1);
      hub.close();
    });
    it("lists the held-back events for a browser that connects, without a desktop notification", () => {
      const { notifier } = setup();
      notifier.setPaused(true);
      notifier.afterSnapshot(before, requested());

      expect(notifier.takePending()).toEqual([
        { type: "missed", data: { total: 1, byType: { review_requested: 1 }, events: [expect.objectContaining({ number: 1 })], quiet: true } },
      ]);
    });

    it("sends the open browsers one summary of what it held back once switched off", () => {
      const { hub, notifier } = setup();
      const page = browser();
      hub.connect(page.stream);
      notifier.setPaused(true);
      notifier.afterSnapshot(beforeTwo, twoRequested);
      notifier.flushMissed();
      expect(received(page.text(), "missed")).toEqual([]);

      notifier.setPaused(false);

      expect(received(page.text(), "notification")).toEqual([]);
      expect(received(page.text(), "missed")).toEqual([{ total: 2, byType: { review_requested: 2 }, events: [expect.objectContaining({ number: 2 }), expect.objectContaining({ number: 1 })], quiet: false }]);
      hub.close();
    });
  });

  describe("in On-demand", () => {
    /** `count` PRs on which I was asked for a review since the previous poll. */
    function requestedOn(count: number) {
      const prs = (requestedReviewers: string[]) =>
        Array.from({ length: count }, (_, index) => pullRequest({ number: index + 1, author: "colleague1", requestedReviewers }));
      return [{ viewer: "me", pullRequests: prs([]), fetchedAt: at }, { viewer: "me", pullRequests: prs(["me"]) }] as const;
    }

    it("sums up more than three events from one poll instead of notifying each", () => {
      const { store, hub, notifier, settings } = setup();
      settings.pollMode = "on_demand";
      const page = browser();
      hub.connect(page.stream);

      notifier.afterSnapshot(...requestedOn(4));

      expect(received(page.text(), "notification")).toEqual([]);
      expect(received(page.text(), "missed")).toEqual([expect.objectContaining({ total: 4, byType: { review_requested: 4 }, quiet: false })]);
      expect(store.undeliveredEvents()).toEqual([]);
      hub.close();
    });

    it("notifies up to three events from one poll each on its own", () => {
      const { hub, notifier, settings } = setup();
      settings.pollMode = "on_demand";
      const page = browser();
      hub.connect(page.stream);

      notifier.afterSnapshot(...requestedOn(3));

      expect(received(page.text(), "notification")).toHaveLength(3);
      expect(received(page.text(), "missed")).toEqual([]);
      hub.close();
    });

    it("leaves Periodic as it was: each event notifies on its own", () => {
      const { hub, notifier } = setup();
      const page = browser();
      hub.connect(page.stream);

      notifier.afterSnapshot(...requestedOn(4));

      expect(received(page.text(), "notification")).toHaveLength(4);
      hub.close();
    });
  });
});
