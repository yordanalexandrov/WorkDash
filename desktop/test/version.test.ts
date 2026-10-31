import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const version = (path: string): unknown =>
  (JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as { version: unknown }).version;

describe("the desktop app's version", () => {
  // `npm version` in the root sets desktop/'s too (the root's "version" script); the deb is named after it.
  it("follows the root's", () => {
    expect(version("../package.json")).toBe(version("../../package.json"));
    expect(version("../package-lock.json")).toBe(version("../../package.json"));
  });
});
