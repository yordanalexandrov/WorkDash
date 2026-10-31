import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { freshLog } from "../src/log.js";

describe("the server's log", () => {
  it("lives in userData/logs/workdash.log, created on the first start", () => {
    const userData = mkdtempSync(join(tmpdir(), "workdash-log-"));
    const path = freshLog(userData);
    expect(path).toBe(join(userData, "logs", "workdash.log"));
    expect(readFileSync(path, "utf8")).toBe("");
  });

  it("starts empty on every start", () => {
    const userData = mkdtempSync(join(tmpdir(), "workdash-log-"));
    mkdirSync(join(userData, "logs"));
    writeFileSync(join(userData, "logs", "workdash.log"), "the last run\n");
    expect(readFileSync(freshLog(userData), "utf8")).toBe("");
  });
});
