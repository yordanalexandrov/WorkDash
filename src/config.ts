import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export type Config = {
  github: { tokenEnv: string; pollIntervalMs: number };
  repos: string[];
  team: string[];
  review: { requiredApprovals: number };
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
      })
      .prefault({}),
  })
  .transform(
    (raw): Config => ({
      github: { tokenEnv: raw.github.token_env, pollIntervalMs: raw.github.poll_interval },
      repos: raw.repos,
      team: raw.team,
      review: { requiredApprovals: raw.review.required_approvals },
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
