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

function ok() {
  return Response.json({
    data: { viewer: { login: "me" }, r0: { nameWithOwner: "my-org/repo-a", pullRequests: { nodes: [], pageInfo: { hasNextPage: false } } } },
  });
}

/** Starts a poller whose GitHub answers with `responses` in turn, and resolves after `polls` polls. */
async function run(responses: (() => Response | Promise<Response>)[], polls: number) {
  const store = openStore(":memory:");
  const healths: ReturnType<Poller["health"]>[] = [];
  let poller!: Poller;
  let calls = 0;
  await new Promise<void>((resolve) => {
    poller = startPoller({
      repos: ["my-org/repo-a"],
      token: "t",
      intervalMs: 1,
      store,
      log: quietLog,
      fetch: async () => responses[Math.min(calls++, responses.length - 1)]!(),
      onPoll: () => {
        healths.push(poller.health());
        if (healths.length === polls) resolve();
      },
    });
  });
  poller.stop();
  return { store, healths };
}

describe("startPoller health", () => {
  it("saves each snapshot and reports a healthy poll", async () => {
    const { store, healths } = await run([ok], 1);

    expect(store.loadSnapshot()?.viewer).toBe("me");
    expect(healths).toEqual([{ error: null, problems: [] }]);
  });

  it("keeps the last good snapshot and goes on trying when GitHub refuses the token", async () => {
    const { store, healths } = await run([ok, () => Response.json({ message: "Bad credentials" }, { status: 401 }), ok], 3);

    expect(store.loadSnapshot()?.viewer).toBe("me");
    expect(healths.map((health) => health.error?.kind ?? null)).toEqual([null, "auth", null]);
  });

  it("tells a GitHub it cannot reach apart from other failures", async () => {
    const { healths } = await run([() => Promise.reject(new TypeError("fetch failed"))], 1);

    expect(healths[0]?.error).toMatchObject({ kind: "unreachable", message: "fetch failed" });
  });
});
