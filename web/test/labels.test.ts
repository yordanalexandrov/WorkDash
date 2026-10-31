import { describe, expect, it } from "vitest";
import { labelChip } from "../src/labels.js";

describe("labelChip", () => {
  it("draws a label in its GitHub colour", () => {
    expect(labelChip({ name: "bug", color: "d73a4a" })).toMatchObject({ name: "bug", background: "#d73a4a" });
  });

  it("writes dark text on a light colour and light text on a dark one", () => {
    expect(labelChip({ name: "a", color: "ffffff" }).ink).toBe("dark");
    expect(labelChip({ name: "a", color: "fbca04" }).ink).toBe("dark");
    expect(labelChip({ name: "a", color: "a2eeef" }).ink).toBe("dark");
    expect(labelChip({ name: "a", color: "000000" }).ink).toBe("light");
    expect(labelChip({ name: "a", color: "5319e7" }).ink).toBe("light");
    expect(labelChip({ name: "a", color: "0075ca" }).ink).toBe("light");
  });

  it("reads the colour whatever its case", () => {
    expect(labelChip({ name: "a", color: "FFFFFF" })).toMatchObject({ background: "#ffffff", ink: "dark" });
  });

  it("draws a colour that is not six hex digits as GitHub's default grey, so nothing else reaches the style", () => {
    expect(labelChip({ name: "a", color: "red; background: url(x)" })).toMatchObject({ background: "#ededed", ink: "dark" });
  });
});
