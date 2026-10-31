import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { openDataDir } from "../src/data-dir.js";

describe("openDataDir", () => {
  let root: string;
  let dataDir: string;
  let legacyConfig: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "workdash-data-"));
    dataDir = join(root, "data");
    legacyConfig = join(root, "config.yaml");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("starts an empty data directory with empty settings and no token", () => {
    const data = openDataDir(dataDir, { configPath: legacyConfig, env: {} });

    expect(parseConfig(readFileSync(data.configPath, "utf8")).repos).toEqual([]);
    expect(data.tokens.get()).toBeNull();
    expect(data.dbPath).toBe(join(dataDir, "workdash.db"));
  });

  it("moves the old config.yaml in once, without token_env, and keeps its comments", () => {
    writeFileSync(legacyConfig, "github:\n  token_env: GITHUB_TOKEN   # in .env\n  poll_interval: 5m\n\nrepos:\n  - my-org/repo-a   # the main one\n");

    const data = openDataDir(dataDir, { configPath: legacyConfig, env: {} });

    const text = readFileSync(data.configPath, "utf8");
    expect(text).not.toContain("token_env");
    expect(text).toMatch(/# the main one/);
    expect(parseConfig(text).github.pollIntervalMs).toBe(300_000);
  });

  it("drops the github section when token_env was all it held", () => {
    writeFileSync(legacyConfig, "github:\n  token_env: GITHUB_TOKEN\nrepos: [my-org/repo-a]\n");

    const data = openDataDir(dataDir, { configPath: legacyConfig, env: {} });

    expect(readFileSync(data.configPath, "utf8")).not.toContain("github");
  });

  it("takes the token from the variable the old config names, once", () => {
    writeFileSync(legacyConfig, "github: { token_env: MY_TOKEN }\nrepos: [my-org/repo-a]\n");

    const data = openDataDir(dataDir, { configPath: legacyConfig, env: { MY_TOKEN: "ghp_first", GITHUB_TOKEN: "ghp_other" } });

    expect(data.tokens.get()).toBe("ghp_first");
  });

  it("takes GITHUB_TOKEN when there is no old config", () => {
    expect(openDataDir(dataDir, { configPath: legacyConfig, env: { GITHUB_TOKEN: "ghp_env" } }).tokens.get()).toBe("ghp_env");
  });

  it("leaves what the data directory holds alone on a later start", () => {
    writeFileSync(legacyConfig, "repos: [my-org/repo-a]\n");
    const first = openDataDir(dataDir, { configPath: legacyConfig, env: { GITHUB_TOKEN: "ghp_env" } });
    first.tokens.set("ghp_saved");
    writeFileSync(first.configPath, "repos: [my-org/repo-b]\n");
    writeFileSync(legacyConfig, "repos: [my-org/repo-c]\n");

    const again = openDataDir(dataDir, { configPath: legacyConfig, env: { GITHUB_TOKEN: "ghp_env" } });

    expect(parseConfig(readFileSync(again.configPath, "utf8")).repos).toEqual(["my-org/repo-b"]);
    expect(again.tokens.get()).toBe("ghp_saved");
  });
});

describe("the token store", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "workdash-token-"));
  });

  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  it("keeps the token in a file only its owner can read", () => {
    const { tokens } = openDataDir(dataDir, { configPath: join(dataDir, "none.yaml"), env: {} });

    tokens.set("ghp_secret");

    const file = join(dataDir, "github-token");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(tokens.get()).toBe("ghp_secret");
  });

  it("replaces the token", () => {
    const { tokens } = openDataDir(dataDir, { configPath: join(dataDir, "none.yaml"), env: {} });

    tokens.set("ghp_one");
    tokens.set("ghp_two");

    expect(tokens.get()).toBe("ghp_two");
  });
});
