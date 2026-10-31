import { describe, expect, it } from "vitest";
import { prGroupOrder } from "../src/prTable.js";

describe("prGroupOrder", () => {
  it("orders section groups in section order", () => {
    const keys = ["team", "waiting_on_me", "ready_to_merge", "free_for_review", "waiting_on_others"];
    expect(keys.sort(prGroupOrder("section"))).toEqual(["waiting_on_me", "free_for_review", "ready_to_merge", "waiting_on_others", "team"]);
  });

  it("orders repo groups by the short name the head shows, whatever the owner", () => {
    expect(["z-org/alpha", "a-org/beta"].sort(prGroupOrder("repo"))).toEqual(["z-org/alpha", "a-org/beta"]);
  });

  it("orders author groups by login", () => {
    expect(["colleague2", "colleague1"].sort(prGroupOrder("author"))).toEqual(["colleague1", "colleague2"]);
  });
});
