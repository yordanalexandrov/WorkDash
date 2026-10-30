import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import type { ClassifyRules } from "../src/domain/classify.js";
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

const at = "2026-10-30T10:00:00.000Z";
const before = { viewer: "me", pullRequests: [pullRequest({ author: "colleague1" })], fetchedAt: at };
const requested = (pr: Partial<PullRequest> = {}) => ({ viewer: "me", pullRequests: [pullRequest({ author: "colleague1", requestedReviewers: ["me"], ...pr })] });

function setup(shouldNotify?: Parameters<typeof createNotifier>[0]["shouldNotify"]) {
  const store = openStore(":memory:");
  const hub = createEventHub();
  const notifier = createNotifier({ store, events: hub, rules: () => rules, shouldNotify });
  return { store, hub, notifier };
}

describe("createNotifier", () => {
  it("pushes a new event to the open browsers and marks it delivered", () => {
    const { store, hub, notifier } = setup();
    const page = browser();
    hub.connect(page.stream);

    notifier.afterSnapshot(before, requested());

    expect(page.text()).toContain("event: notification\n");
    expect(page.text()).toContain('"id":"review_requested:my-org/repo-a#1:none"');
    expect(store.undeliveredEvents(10)).toEqual([]);
    hub.close();
  });

  it("sends the same event only once, even after a restart", () => {
    const { store, hub, notifier } = setup();
    const page = browser();
    hub.connect(page.stream);
    notifier.afterSnapshot(before, requested());
    const restarted = createNotifier({ store, events: hub, rules: () => rules });

    restarted.afterSnapshot(before, requested());

    expect(page.text().split("event: notification\n")).toHaveLength(2);
    hub.close();
  });

  it("records nothing on the first poll ever", () => {
    const { store, notifier } = setup();

    notifier.afterSnapshot(null, requested());

    expect(store.undeliveredEvents(10)).toEqual([]);
    expect(notifier.takePending()).toEqual([]);
  });

  it("keeps events while no browser is open and hands them to the next one that connects", () => {
    const { store, notifier } = setup();
    notifier.afterSnapshot(before, requested());

    const pending = notifier.takePending();

    expect(pending).toEqual([{ type: "notification", data: expect.objectContaining({ type: "review_requested" }) }]);
    expect(store.undeliveredEvents(10)).toEqual([]);
    expect(notifier.takePending()).toEqual([]);
  });

  it("records but does not send an event the rules hold back", () => {
    const { store, hub, notifier } = setup(() => false);
    const page = browser();
    hub.connect(page.stream);

    notifier.afterSnapshot(before, requested());

    expect(page.text()).toBe("retry: 3000\n\n");
    expect(store.undeliveredEvents(10)).toHaveLength(1);
    expect(notifier.takePending()).toEqual([]);
    hub.close();
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
});
