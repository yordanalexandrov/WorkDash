import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../src/config.js";

const minimal = `
repos:
  - my-org/repo-a
`;

describe("parseConfig", () => {
  it("accepts the example config", () => {
    const config = parseConfig(readFileSync("config.example.yaml", "utf8"));

    expect(config.repos).toEqual(["my-org/repo-a", "my-org/repo-b"]);
    expect(config.github.tokenEnv).toBe("GITHUB_TOKEN");
    expect(config.github.pollIntervalMs).toBe(60_000);
  });

  it("fills in defaults for the GitHub section", () => {
    const config = parseConfig(minimal);

    expect(config.github).toEqual({ tokenEnv: "GITHUB_TOKEN", pollIntervalMs: 60_000 });
  });

  it("reads poll intervals in seconds and minutes", () => {
    expect(parseConfig(`github: { poll_interval: 30s }\n${minimal}`).github.pollIntervalMs).toBe(30_000);
    expect(parseConfig(`github: { poll_interval: 2m }\n${minimal}`).github.pollIntervalMs).toBe(120_000);
  });

  it("names the field when a repo is not owner/name", () => {
    expect(() => parseConfig("repos:\n  - my-org/repo-a\n  - repo-b\n")).toThrow(/repos\[1\]/);
  });

  it("names the field when the poll interval is malformed", () => {
    expect(() => parseConfig(`github: { poll_interval: soon }\n${minimal}`)).toThrow(/github\.poll_interval/);
  });

  it("names a misspelled key in the github section", () => {
    expect(() => parseConfig(`github: { pol_interval: 5m }\n${minimal}`)).toThrow(/github.*pol_interval/);
  });

  it("requires at least one repo", () => {
    expect(() => parseConfig("repos: []\n")).toThrow(/repos/);
  });

  it("reports invalid YAML as a ConfigError", () => {
    expect(() => parseConfig("repos: [\n")).toThrow(ConfigError);
  });
});
