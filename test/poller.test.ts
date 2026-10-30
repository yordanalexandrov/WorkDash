import { describe, expect, it } from "vitest";
import { openStore } from "../src/db.js";
import { type Poller, startPoller } from "../src/poller.js";

const silent = { info() {}, error() {} };

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
      log: silent,
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

describe("startPoller", () => {
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
