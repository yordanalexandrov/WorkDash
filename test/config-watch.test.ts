import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Config, ConfigError, type ConfigWatcher, parseConfig, watchConfig } from "../src/config.js";

const INTERVAL_MS = 20;

function yamlWithRepos(...repos: string[]): string {
  return `repos:\n${repos.map((repo) => `  - ${repo}`).join("\n")}\n`;
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

describe("watchConfig", () => {
  let dir: string;
  let path: string;
  let watcher: ConfigWatcher | undefined;
  let applied: Config[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "workdash-config-"));
    path = join(dir, "config.yaml");
    writeFileSync(path, yamlWithRepos("my-org/repo-a"));
    applied = [];
  });

  afterEach(() => {
    watcher?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function watch(apply: (config: Config) => void = (config) => applied.push(config)): ConfigWatcher {
    watcher = watchConfig(path, { current: parseConfig(yamlWithRepos("my-org/repo-a")), intervalMs: INTERVAL_MS, apply });
    return watcher;
  }

  it("applies the edited config when the file is rewritten in place", async () => {
    watch();

    writeFileSync(path, yamlWithRepos("my-org/repo-a", "my-org/repo-b"));

    await waitFor(() => applied.length === 1);
    expect(applied[0]?.repos).toEqual(["my-org/repo-a", "my-org/repo-b"]);
    expect(watcher?.error()).toBeNull();
  });

  it("applies the edited config when an editor replaces the file with a new one", async () => {
    watch();

    const temp = join(dir, "config.yaml.tmp");
    writeFileSync(temp, yamlWithRepos("my-org/repo-b"));
    renameSync(temp, path);

    await waitFor(() => applied.length === 1);
    expect(applied[0]?.repos).toEqual(["my-org/repo-b"]);
  });

  it("reports an invalid edit and keeps the last valid config, then recovers on the next valid edit", async () => {
    const w = watch();

    writeFileSync(path, "repos: []\n");

    await waitFor(() => w.error() !== null);
    expect(w.error()).toMatch(/repos: list at least one repo/);
    expect(applied).toEqual([]);

    writeFileSync(path, yamlWithRepos("my-org/repo-c"));

    await waitFor(() => applied.length === 1);
    expect(applied[0]?.repos).toEqual(["my-org/repo-c"]);
    expect(w.error()).toBeNull();
  });

  it("reports a deleted file as an error", async () => {
    const w = watch();

    rmSync(path);

    await waitFor(() => w.error() !== null);
    expect(w.error()).toMatch(/cannot read/);
  });

  it("reports a ConfigError thrown while applying and keeps the old config", async () => {
    const w = watch(() => {
      throw new ConfigError("github.token_env: environment variable OTHER_TOKEN is not set");
    });

    writeFileSync(path, yamlWithRepos("my-org/repo-b"));

    await waitFor(() => w.error() !== null);
    expect(w.error()).toMatch(/OTHER_TOKEN is not set/);
  });

  it("does not re-apply when the file is touched without a change in content", async () => {
    watch();

    writeFileSync(path, yamlWithRepos("my-org/repo-a") + "# comment\n");
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS * 10));

    expect(applied).toEqual([]);
  });
});
