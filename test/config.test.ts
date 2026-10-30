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
    expect(config.team).toEqual(["colleague1", "colleague2"]);
    expect(config.review.requiredApprovals).toBe(1);
    expect(config.review.recentlyClosedWindowMs).toBe(24 * 3_600_000);
    expect(config.jira).toEqual({ baseUrl: "https://example.atlassian.net/browse/", projectKeys: ["ABC"] });
  });

  it("leaves Jira out when it is not configured", () => {
    expect(parseConfig(minimal).jira).toEqual({ baseUrl: null, projectKeys: [] });
  });

  it("names the field when the Jira base URL is not a URL", () => {
    expect(() => parseConfig(`jira: { base_url: example }\n${minimal}`)).toThrow(/jira\.base_url/);
  });

  it("names the field when a Jira project key is malformed", () => {
    expect(() => parseConfig(`jira: { project_keys: [abc] }\n${minimal}`)).toThrow(/jira\.project_keys\[0\]/);
  });

  it("fills in defaults for the GitHub section", () => {
    const config = parseConfig(minimal);

    expect(config.github).toEqual({ tokenEnv: "GITHUB_TOKEN", pollIntervalMs: 60_000 });
  });

  it("defaults to no team and one required approval", () => {
    const config = parseConfig(minimal);

    expect(config.team).toEqual([]);
    expect(config.review).toEqual({ requiredApprovals: 1, recentlyClosedWindowMs: 24 * 3_600_000 });
  });

  it("reads recently_closed_window as a duration", () => {
    expect(parseConfig(`review: { recently_closed_window: 2h }\n${minimal}`).review.recentlyClosedWindowMs).toBe(7_200_000);
    expect(() => parseConfig(`review: { recently_closed_window: 2d }\n${minimal}`)).toThrow(/review\.recently_closed_window/);
  });

  it("reads required_approvals", () => {
    expect(parseConfig(`review: { required_approvals: 2 }\n${minimal}`).review.requiredApprovals).toBe(2);
  });

  it("names the field when required_approvals is not a positive whole number", () => {
    expect(() => parseConfig(`review: { required_approvals: 0 }\n${minimal}`)).toThrow(/review\.required_approvals/);
    expect(() => parseConfig(`review: { required_approvals: 1.5 }\n${minimal}`)).toThrow(/review\.required_approvals/);
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
