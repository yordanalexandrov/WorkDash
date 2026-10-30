import { afterEach, describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type Poller, startPoller } from "../src/poller.js";

type Call = { repos: string[]; token: string };

/** A stand-in for GitHub that records which repos each poll asked for, with which token. */
function fakeGitHub() {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const { variables } = JSON.parse(String(init?.body)) as { variables: Record<string, string> };
    const repos = Object.keys(variables)
      .filter((key) => key.startsWith("owner"))
      .map((key) => `${variables[key]}/${variables[key.replace("owner", "name")]}`);
    const token = (init?.headers as Record<string, string>).Authorization!.replace("Bearer ", "");
    calls.push({ repos, token });
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight--;
    return Response.json({ data: { viewer: { login: "me" } } });
  };
  return { fetch, calls, maxInFlight: () => maxInFlight };
}

const quietLog = { info() {}, error() {} };

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("startPoller", () => {
  let poller: Poller | undefined;
  afterEach(() => poller?.stop());

  it("polls again right away with the new repos and token after a reconfigure", async () => {
    const github = fakeGitHub();
    poller = startPoller({
      repos: ["my-org/repo-a"],
      token: "t1",
      intervalMs: 3_600_000,
      store: openStore(":memory:"),
      log: quietLog,
      fetch: github.fetch,
    });
    await waitFor(() => github.calls.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    poller.reconfigure({ repos: ["my-org/repo-a", "my-org/repo-b"], token: "t2", intervalMs: 3_600_000 });

    await waitFor(() => github.calls.length === 2);
    expect(github.calls).toEqual([
      { repos: ["my-org/repo-a"], token: "t1" },
      { repos: ["my-org/repo-a", "my-org/repo-b"], token: "t2" },
    ]);
  });

  it("finishes a poll already under way before polling with the new config", async () => {
    const github = fakeGitHub();
    poller = startPoller({
      repos: ["my-org/repo-a"],
      token: "t1",
      intervalMs: 3_600_000,
      store: openStore(":memory:"),
      log: quietLog,
      fetch: github.fetch,
    });

    poller.reconfigure({ repos: ["my-org/repo-b"], token: "t1", intervalMs: 3_600_000 });

    await waitFor(() => github.calls.length === 2);
    expect(github.calls.map((call) => call.repos)).toEqual([["my-org/repo-a"], ["my-org/repo-b"]]);
    expect(github.maxInFlight()).toBe(1);
  });
});
