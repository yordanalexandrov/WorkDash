import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySettings, ConfigError, formFromConfig, parseConfig, settingsForm } from "../src/config.js";
import { validateSettings } from "../src/domain/settings.js";
import { ALL_ENABLED } from "../src/domain/notify.js";

const minimal = `
repos:
  - my-org/repo-a
`;

describe("parseConfig", () => {
  it("accepts the example config", () => {
    const config = parseConfig(readFileSync("config.example.yaml", "utf8"));

    expect(config.repos).toEqual(["my-org/repo-a", "my-org/repo-b"]);
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

    expect(config.github).toEqual({ pollIntervalMs: 60_000 });
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

  it("accepts an empty file as a dashboard with nothing set up yet", () => {
    const config = parseConfig("");

    expect(config.repos).toEqual([]);
    expect(config.github.pollIntervalMs).toBe(60_000);
  });

  it("lets a key it does not know pass outside github and notifications, as before", () => {
    expect(parseConfig(`extra: 1\nreview: { extra: 1 }\njira: { extra: 1 }\n${minimal}`).repos).toEqual(["my-org/repo-a"]);
  });

  it("rejects github.token_env: the token is kept apart from the settings", () => {
    expect(() => parseConfig(`github: { token_env: GITHUB_TOKEN }\n${minimal}`)).toThrow(/github.*token_env/);
  });

  it("reports invalid YAML as a ConfigError", () => {
    expect(() => parseConfig("repos: [\n")).toThrow(ConfigError);
  });
});

describe("parseConfig notifications", () => {
  it("turns every event type on and has no quiet hours by default", () => {
    expect(parseConfig(minimal).notifications).toEqual(ALL_ENABLED);
  });

  it("reads the example's toggles and quiet hours across midnight", () => {
    const config = parseConfig(readFileSync("config.example.yaml", "utf8"));

    expect(config.notifications).toEqual({ ...ALL_ENABLED, quietHours: { start: 19 * 60, end: 9 * 60 } });
  });

  it("turns off the types set to false and keeps the rest on", () => {
    const { enabled } = parseConfig(`notifications: { team_pr_opened: false }\n${minimal}`).notifications;

    expect(enabled.team_pr_opened).toBe(false);
    expect(enabled.mention).toBe(true);
  });

  it("names the field when quiet_hours is malformed", () => {
    expect(() => parseConfig(`notifications: { quiet_hours: "7pm-9am" }\n${minimal}`)).toThrow(/notifications\.quiet_hours/);
  });

  it("names a misspelled event type", () => {
    expect(() => parseConfig(`notifications: { mentions: false }\n${minimal}`)).toThrow(/notifications.*mentions/);
  });
});

describe("settingsForm", () => {
  it("shows what the file says, with the defaults for what it leaves out", () => {
    const form = settingsForm("github:\n  poll_interval: 90s\nrepos: [my-org/repo-a]\n");

    expect(form).toEqual({
      github: { poll_interval: "90s" },
      repos: ["my-org/repo-a"],
      team: [],
      review: { required_approvals: 1, recently_closed_window: "24h" },
      jira: { base_url: null, project_keys: [] },
      notifications: { ...ALL_ENABLED.enabled, quiet_hours: null },
    });
  });

  it("keeps a duration as the file writes it", () => {
    expect(settingsForm("github: { poll_interval: 60s }\n").github.poll_interval).toBe("60s");
  });
});

describe("formFromConfig", () => {
  it("writes the config in effect back as a form that reads as the same config", () => {
    const config = parseConfig(readFileSync("config.example.yaml", "utf8"));

    const form = formFromConfig(config);

    expect(form.github.poll_interval).toBe("1m");
    expect(form.notifications.quiet_hours).toBe("19:00-09:00");
    expect(parseConfig(applySettings("", form))).toEqual(config);
  });

  it("writes an interval that is not whole minutes in seconds", () => {
    expect(formFromConfig(parseConfig("github: { poll_interval: 90s }\n")).github.poll_interval).toBe("90s");
  });
});

describe("validateSettings", () => {
  const valid = settingsForm(minimal);

  it("accepts a valid form", () => {
    expect(validateSettings(valid)).toEqual({ ok: true, form: valid });
  });

  it("names every field that is wrong, by its path", () => {
    const result = validateSettings({
      ...valid,
      repos: ["my-org/repo-a", "repo-b"],
      github: { poll_interval: "soon" },
      notifications: { ...valid.notifications, quiet_hours: "7pm-9am" },
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((issue) => issue.path).toSorted()).toEqual(["github.poll_interval", "notifications.quiet_hours", "repos[1]"]);
    expect(!result.ok && result.issues.find((issue) => issue.path === "repos[1]")?.message).toBe('expected "owner/name"');
  });
});

describe("applySettings", () => {
  const commented = `# my dashboard
github:
  poll_interval: 60s   # once a minute

repos:
  - my-org/repo-a      # the main one

team: [colleague1]
`;

  it("changes only what the form changed and keeps the comments and the order", () => {
    const form = settingsForm(commented);

    const text = applySettings(commented, { ...form, team: ["colleague1", "colleague2"] });

    expect(text).toContain("# my dashboard");
    expect(text).toMatch(/poll_interval: 60s +# once a minute/);
    expect(text).toMatch(/- my-org\/repo-a +# the main one/);
    expect(text.indexOf("github:")).toBeLessThan(text.indexOf("repos:"));
    expect(parseConfig(text).team).toEqual(["colleague1", "colleague2"]);
  });

  it("keeps the comments on a list and on its items when an item is added or removed", () => {
    const text = "team:                # whose PRs show in Екипът\n  - colleague1       # lead\n  - colleague2\n";

    const next = applySettings(text, { ...settingsForm(text), team: ["colleague1", "colleague3"] });

    // The yaml library puts a comment on the key's line on a line of its own; it is kept all the same.
    expect(next).toMatch(/team:\s+# whose PRs show in Екипът/);
    expect(next).toMatch(/- colleague1 +# lead/);
    expect(parseConfig(next).team).toEqual(["colleague1", "colleague3"]);
  });

  it("leaves the file as it is when nothing changed", () => {
    expect(applySettings(commented, settingsForm(commented))).toBe(commented);
  });

  it("writes into an empty file", () => {
    const form = settingsForm("");

    const text = applySettings("", { ...form, repos: ["my-org/repo-b"], jira: { base_url: "https://example.atlassian.net/browse/", project_keys: ["ABC"] } });

    expect(parseConfig(text).repos).toEqual(["my-org/repo-b"]);
    expect(parseConfig(text).jira.projectKeys).toEqual(["ABC"]);
  });
});
