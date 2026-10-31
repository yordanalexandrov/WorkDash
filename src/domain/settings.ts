import { z } from "zod";
import { EVENT_TYPES, type EventType } from "./events.js";
import { parseQuietHours } from "./notify.js";

// config.yaml as the Settings screen shows and sends it, and the rules both it and the file are checked by.

const DURATION_UNITS_MS = { s: 1_000, m: 60_000, h: 3_600_000 } as const;

/** "60s", "5m" or "1h" in milliseconds. */
export function durationMs(value: string): number {
  const unit = value.at(-1) as keyof typeof DURATION_UNITS_MS;
  return Number(value.slice(0, -1)) * DURATION_UNITS_MS[unit];
}

/** Milliseconds as the largest unit that divides them: 3_600_000 is "1h", 90_000 is "90s". */
export function formatDuration(ms: number): string {
  if (ms % DURATION_UNITS_MS.h === 0) return `${ms / DURATION_UNITS_MS.h}h`;
  if (ms % DURATION_UNITS_MS.m === 0) return `${ms / DURATION_UNITS_MS.m}m`;
  return `${Math.round(ms / DURATION_UNITS_MS.s)}s`;
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const duration = z
  .string()
  .regex(/^\d+[smh]$/, 'expected a duration such as "60s", "5m" or "1h"')
  // Only once the format is right, so "soon" gets one message, not two.
  .refine((value) => !/^\d+[smh]$/.test(value) || durationMs(value) > 0, "must be greater than zero");

const quietHours = z.string().refine((value) => parseQuietHours(value) !== null, 'expected a time range such as "19:00-09:00"');

const notifications = z
  .strictObject({
    ...(Object.fromEntries(EVENT_TYPES.map((type) => [type, z.boolean().default(true)])) as Record<EventType, z.ZodDefault<z.ZodBoolean>>),
    quiet_hours: quietHours.nullable().default(null),
  })
  .prefault({});

/** config.yaml as written, with the defaults filled in: what the Settings screen edits. */
// Strict only where a stray key is a likely mistake (github, notifications) or a key the dashboard no longer
// takes (github.token_env); elsewhere an unknown key passes, as it always has.
export const settingsSchema = z.object({
  github: z
    .strictObject({
      poll_interval: duration.default("60s"),
    })
    .prefault({}),
  repos: z.array(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected "owner/name"')).default([]),
  team: z.array(z.string().min(1)).default([]),
  review: z
    .object({
      required_approvals: z.number().int().min(1).default(1),
      recently_closed_window: duration.default("24h"),
    })
    .prefault({}),
  jira: z
    .object({
      base_url: z.url().nullable().default(null),
      project_keys: z.array(z.string().regex(/^[A-Z][A-Z0-9]+$/, 'expected a project key such as "ABC"')).default([]),
    })
    .prefault({}),
  notifications,
});

/** The settings as the Settings screen shows and sends them: config.yaml's keys and values, defaults filled in. */
export type SettingsForm = z.output<typeof settingsSchema>;

/** A field of the settings that is wrong, by its path in config.yaml ("repos[1]"). */
export type FieldIssue = { path: string; message: string };

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === "number") return `${acc}[${key}]`;
    return acc ? `${acc}.${String(key)}` : String(key);
  }, "");
}

/** Checks settings sent by the Settings screen by the same rules as config.yaml. */
export function validateSettings(form: unknown): { ok: true; form: SettingsForm } | { ok: false; issues: FieldIssue[] } {
  const result = settingsSchema.safeParse(form);
  if (result.success) return { ok: true, form: result.data };
  return { ok: false, issues: result.error.issues.map((issue) => ({ path: formatPath(issue.path) || "(root)", message: issue.message })) };
}


export type SaveResult = { ok: true; hash: string } | { ok: false; reason: "conflict" } | { ok: false; reason: "invalid"; issues: FieldIssue[] };

/** Whether a token is saved, and how the screen shows it. The token itself never leaves the server. */
export type TokenStatus = { set: boolean; masked: string | null };

/** What the dashboard cannot do without, and the Settings screen asks for. */
export type Missing = "token" | "repos";
