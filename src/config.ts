import { readFileSync, statSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { JiraConfig } from "./domain/jira.js";

export type Config = {
  github: { tokenEnv: string; pollIntervalMs: number };
  repos: string[];
  team: string[];
  review: { requiredApprovals: number; recentlyClosedWindowMs: number };
  jira: JiraConfig;
};

export class ConfigError extends Error {
  override name = "ConfigError";
}

const DURATION_UNITS_MS = { s: 1_000, m: 60_000, h: 3_600_000 } as const;

const duration = z
  .string()
  .regex(/^\d+[smh]$/, 'expected a duration such as "60s", "5m" or "1h"')
  .transform((value) => {
    const unit = value.at(-1) as keyof typeof DURATION_UNITS_MS;
    return Number(value.slice(0, -1)) * DURATION_UNITS_MS[unit];
  })
  .refine((ms) => ms > 0, "must be greater than zero");

const schema = z
  .object({
    github: z
      .strictObject({
        token_env: z.string().min(1).default("GITHUB_TOKEN"),
        poll_interval: duration.default(60_000),
      })
      .prefault({}),
    repos: z
      .array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected "owner/name"'))
      .min(1, "list at least one repo"),
    team: z.array(z.string().min(1)).default([]),
    review: z
      .object({
        required_approvals: z.number().int().min(1).default(1),
        recently_closed_window: duration.default(24 * 3_600_000),
      })
      .prefault({}),
    jira: z
      .object({
        base_url: z.url().nullable().default(null),
        project_keys: z.array(z.string().regex(/^[A-Z][A-Z0-9]+$/, 'expected a project key such as "ABC"')).default([]),
      })
      .prefault({}),
  })
  .transform(
    (raw): Config => ({
      github: { tokenEnv: raw.github.token_env, pollIntervalMs: raw.github.poll_interval },
      repos: raw.repos,
      team: raw.team,
      review: {
        requiredApprovals: raw.review.required_approvals,
        recentlyClosedWindowMs: raw.review.recently_closed_window,
      },
      jira: { baseUrl: raw.jira.base_url, projectKeys: raw.jira.project_keys },
    }),
  );

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === "number") return `${acc}[${key}]`;
    return acc ? `${acc}.${String(key)}` : String(key);
  }, "");
}

/** Parses and validates config.yaml content. Errors name the offending field. */
export function parseConfig(text: string): Config {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    throw new ConfigError(`invalid YAML: ${(error as Error).message}`);
  }

  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${formatPath(issue.path) || "(root)"}: ${issue.message}`);
    throw new ConfigError(`invalid configuration:\n${problems.join("\n")}`);
  }
  return result.data;
}

export function loadConfig(path: string): Config {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new ConfigError(`cannot read ${path}: ${(error as Error).message}`);
  }
  return parseConfig(text);
}

export type ConfigWatcher = {
  /** Why the file on disk is not in effect, or null when it is. */
  error(): string | null;
  close(): void;
};

/**
 * Watches the config file and hands every valid change to `apply`. An invalid change, or `apply` throwing a
 * ConfigError, leaves `current` in effect and is reported by `error()` until a later change is applied.
 *
 * The file is polled by path, so a change is seen even when an editor replaces the file with a new one.
 */
export function watchConfig(
  path: string,
  options: {
    current: Config;
    apply(config: Config): void;
    /** Called after a later change to the file was applied or rejected, so the UI can be told right away. */
    onChange?(): void;
    intervalMs?: number;
    log?: { info(msg: string): void; error(msg: string): void };
  },
): ConfigWatcher {
  const { apply, onChange = () => {}, intervalMs = 1_000, log } = options;
  let current = JSON.stringify(options.current);
  let error: string | null = null;

  function reload() {
    try {
      const config = loadConfig(path);
      const serialized = JSON.stringify(config);
      if (serialized !== current) {
        apply(config);
        current = serialized;
        log?.info(`${path}: reloaded`);
      } else if (error) {
        log?.info(`${path}: the config in effect is valid again`);
      }
      error = null;
    } catch (caught) {
      if (!(caught instanceof ConfigError)) throw caught;
      const message = `${path}: ${caught.message}`;
      if (message !== error) log?.error(`${message}\nkeeping the last valid config`);
      error = message;
    }
  }

  // Stat by path rather than fs.watch: a watch follows the inode, which is gone once an editor replaces the file.
  let stamp = fileStamp(path);
  reload();
  const timer = setInterval(() => {
    const next = fileStamp(path);
    if (next === stamp) return;
    stamp = next;
    const before = [current, error];
    reload();
    if (current !== before[0] || error !== before[1]) onChange();
  }, intervalMs);
  timer.unref();

  return {
    error: () => error,
    close: () => clearInterval(timer),
  };
}

function fileStamp(path: string): string {
  try {
    const stats = statSync(path);
    return `${stats.ino}:${stats.size}:${stats.mtimeMs}`;
  } catch {
    return "missing";
  }
}
