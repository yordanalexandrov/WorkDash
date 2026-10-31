import { describe, expect, it } from "vitest";
import { stageOf, stagesFor } from "../src/domain/issues.js";
import { issue } from "./fixtures.js";

const config = {
  columns: ["needs-triage", "ready-for-agent", "in-progress"],
  repos: { "my-org/repo-b": { columns: ["todo", "doing"] } },
};

describe("stagesFor", () => {
  it("gives a repo without a list of its own the common stage labels", () => {
    expect(stagesFor(config, "my-org/repo-a")).toEqual(["needs-triage", "ready-for-agent", "in-progress"]);
  });

  it("gives a repo its own list instead of the common one", () => {
    expect(stagesFor(config, "my-org/repo-b")).toEqual(["todo", "doing"]);
  });

  it("finds a repo's own list whatever the case GitHub writes its name in", () => {
    expect(stagesFor(config, "My-Org/Repo-B")).toEqual(["todo", "doing"]);
  });

  it("has no stages when none are configured", () => {
    expect(stagesFor({ columns: [], repos: {} }, "my-org/repo-a")).toEqual([]);
  });
});

describe("stageOf", () => {
  const stages = ["needs-triage", "ready-for-agent", "in-progress"];
  const labelled = (...names: string[]) => issue({ labels: names.map((name) => ({ name, color: "ededed" })) });

  it("puts an issue in the stage its stage label names", () => {
    expect(stageOf(labelled("bug", "ready-for-agent"), stages)).toBe("ready-for-agent");
  });

  it("puts an issue with several stage labels in the last of them by the configured order", () => {
    expect(stageOf(labelled("in-progress", "needs-triage"), stages)).toBe("in-progress");
    expect(stageOf(labelled("ready-for-agent", "needs-triage"), stages)).toBe("ready-for-agent");
  });

  it("matches a stage label whatever its case, as GitHub does, and names the stage as configured", () => {
    expect(stageOf(labelled("Ready-For-Agent"), stages)).toBe("ready-for-agent");
  });

  it("leaves an issue with only other labels without a stage", () => {
    expect(stageOf(labelled("bug", "docs"), stages)).toBeNull();
  });

  it("leaves an issue without labels without a stage", () => {
    expect(stageOf(labelled(), stages)).toBeNull();
  });
});
