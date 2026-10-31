import { describe, expect, it } from "vitest";
import { repoHue, repoHues } from "../src/palette.js";

describe("repoHues", () => {
  it("gives the repos the palette's hues in name order", () => {
    expect(repoHues(["my-org/repo-c", "my-org/repo-a", "my-org/repo-b"])).toEqual(
      new Map([
        ["my-org/repo-a", 215],
        ["my-org/repo-b", 28],
        ["my-org/repo-c", 155],
      ]),
    );
  });

  it("gives the same hues whatever order the repos come in", () => {
    const repos = ["my-org/b", "my-org/a", "my-org/c", "my-org/a"];
    expect(repoHues(repos)).toEqual(repoHues(["my-org/c", "my-org/a", "my-org/b"]));
  });

  it("starts the palette over 17° further round after the eighth repo", () => {
    const repos = Array.from({ length: 10 }, (_, i) => `my-org/repo-${i}`);
    const hues = repoHues(repos);
    expect(hues.get("my-org/repo-8")).toBe(232);
    expect(hues.get("my-org/repo-9")).toBe(45);
  });
});

describe("repoHue", () => {
  it("takes a repo's hue from the set", () => {
    expect(repoHue(repoHues(["my-org/a", "my-org/b"]), "my-org/b")).toBe(28);
  });

  it("falls back to a hue from the name, the same every time, for a repo outside the set", () => {
    const hue = repoHue(repoHues(["my-org/a"]), "my-org/elsewhere");
    expect(hue).toBe(repoHue(new Map(), "my-org/elsewhere"));
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
    expect(repoHue(new Map(), "my-org/elsewhere-2")).not.toBe(hue);
  });
});
