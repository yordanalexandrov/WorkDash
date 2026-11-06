import { readFileSync, statSync } from "node:fs";
import { isMap, isNode, isSeq, parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";
import { EVENT_TYPES, type EventType } from "./domain/events.js";
import type { IssuesConfig } from "./domain/issues.js";
import type { JiraConfig } from "./domain/jira.js";
import { type NotificationRules, parseQuietHours, type QuietHours } from "./domain/notify.js";
import { durationMs, type FieldIssue, formatClock, formatDuration, type SettingsForm, settingsSchema, validateSettings } from "./domain/settings.js";

export type Config = {
  github: { pollIntervalMs: number };
  repos: string[];
  team: string[];
  review: { requiredApprovals: number; recentlyClosedWindowMs: number; hideInactiveAfterDays: number | null };
  jira: JiraConfig;
  notifications: NotificationRules;
  issues: IssuesConfig;
};

export class ConfigError extends Error {
  override name = "ConfigError";
}

function toConfig(raw: SettingsForm): Config {
  return {
    github: { pollIntervalMs: durationMs(raw.github.poll_interval) },
    repos: raw.repos,
    team: raw.team,
    review: {
      requiredApprovals: raw.review.required_approvals,
      recentlyClosedWindowMs: durationMs(raw.review.recently_closed_window),
      hideInactiveAfterDays: raw.review.hide_inactive_after_days,
    },
    jira: { baseUrl: raw.jira.base_url, projectKeys: raw.jira.project_keys },
    notifications: {
      enabled: Object.fromEntries(EVENT_TYPES.map((type) => [type, raw.notifications[type]])) as Record<EventType, boolean>,
      quietHours: raw.notifications.quiet_hours === null ? null : (parseQuietHours(raw.notifications.quiet_hours) as QuietHours),
    },
    issues: raw.issues,
  };
}

/** config.yaml content as YAML, before its settings are checked; a ConfigError when it is not YAML. */
function parseSettingsYaml(text: string): unknown {
  try {
    return parseYaml(text) ?? {};
  } catch (error) {
    throw new ConfigError(`invalid YAML: ${(error as Error).message}`);
  }
}

/** Reads config.yaml content as the Settings screen shows it; a ConfigError when it is not valid. */
export function settingsForm(text: string): SettingsForm {
  const result = validateSettings(parseSettingsYaml(text));
  if (!result.ok) throw new ConfigError(`invalid configuration:\n${result.issues.map(({ path, message }) => `  ${path}: ${message}`).join("\n")}`);
  return result.form;
}

/** A key that names or holds a token: never written to an exported file, and dropped from an imported one. */
const TOKEN_KEY = /token/i;

/**
 * The settings as a file to take elsewhere: every key, defaults too, so it reads the same wherever the defaults change.
 * Only the settings: the token lives in its own store and never goes in.
 */
export function exportSettings(form: SettingsForm): string {
  return `# WorkDash settings. The GitHub token is not in this file.\n${stringifyYaml(form)}`;
}

export type ImportResult = { ok: true; settings: SettingsForm; ignored: string[] } | { ok: false; issues: FieldIssue[] };

const isMapValue = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** `value` without the keys that look like a token, at any depth, each dropped key's path added to `ignored`. */
function withoutTokens(value: unknown, path: string, ignored: string[]): unknown {
  if (!isMapValue(value)) return value;
  // The keys of a map keyed by name are repo names, never a token, however they are spelled.
  const byName = KEYED_BY_NAME.has(path);
  const kept: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key;
    if (!byName && TOKEN_KEY.test(key)) ignored.push(at);
    else kept[key] = withoutTokens(inner, byName ? `${path}.*` : at, ignored);
  }
  return kept;
}

/**
 * Reads an exported (or hand-written) settings file, checked by the same rules as config.yaml. A key that looks like a
 * token, in any section, is dropped and named in `ignored`: an import never brings a token in. A file without any of the
 * settings is refused, so a wrong file never empties them.
 */
export function importSettings(text: string): ImportResult {
  const refuse = (message: string): ImportResult => ({ ok: false, issues: [{ path: "(file)", message }] });
  let raw: unknown;
  try {
    raw = parseSettingsYaml(text);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return refuse(error.message);
  }
  if (!isMapValue(raw)) return refuse("expected a map of settings");
  const ignored: string[] = [];
  const settings = withoutTokens(raw, "", ignored) as Record<string, unknown>;
  if (!Object.keys(settingsSchema.shape).some((key) => Object.hasOwn(settings, key))) return refuse("no WorkDash settings in this file");
  const result = validateSettings(settings);
  return result.ok ? { ok: true, settings: result.form, ignored } : { ok: false, issues: result.issues };
}

/** The config in effect written back as settings, for when the file on disk is not valid. */
export function formFromConfig(config: Config): SettingsForm {
  const { quietHours } = config.notifications;
  return {
    github: { poll_interval: formatDuration(config.github.pollIntervalMs) },
    repos: config.repos,
    team: config.team,
    review: {
      required_approvals: config.review.requiredApprovals,
      recently_closed_window: formatDuration(config.review.recentlyClosedWindowMs),
      hide_inactive_after_days: config.review.hideInactiveAfterDays,
    },
    jira: { base_url: config.jira.baseUrl, project_keys: config.jira.projectKeys },
    notifications: {
      ...config.notifications.enabled,
      quiet_hours: quietHours ? `${formatClock(quietHours.start)}-${formatClock(quietHours.end)}` : null,
    },
    issues: config.issues,
  };
}

/** The maps of config.yaml keyed by a name (a repo) rather than by fixed keys: a name the form leaves out is deleted. */
const KEYED_BY_NAME = new Set(["issues.repos"]);

/**
 * Writes `form` into config.yaml content: only the values that differ are set, so comments, order and the way
 * the file writes what did not change stay as they are.
 */
export function applySettings(text: string, form: SettingsForm): string {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new ConfigError(`invalid YAML: ${doc.errors[0]!.message}`);
  // An empty file (or one with only comments) has no map to set keys in yet.
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  const defaults = settingsSchema.parse({});
  const defaultAt = (path: string[]) => path.reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], defaults);
  let changed = false;
  const visit = (path: string[], value: unknown) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const node = doc.getIn(path, true);
      if (isMap(node) && KEYED_BY_NAME.has(path.join("."))) {
        // A repo the form no longer has a list for is gone from the file too; the others keep their comments.
        const gone = node.items.map((pair) => (isNode(pair.key) ? pair.key.toJSON() : pair.key)).filter((key) => !Object.hasOwn(value, String(key)));
        for (const key of gone) node.delete(key);
        if (gone.length) changed = true;
        // With no repo left, the key goes too, as if it had never been written.
        if (gone.length && node.items.length === 0) {
          doc.deleteIn(path);
          return;
        }
      }
      for (const [key, inner] of Object.entries(value)) visit([...path, key], inner);
      return;
    }
    const node = doc.getIn(path, true);
    const current = isNode(node) ? node.toJSON() : node;
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    // A key the file leaves out stays out while the form keeps its default.
    if (current === undefined && JSON.stringify(defaultAt(path)) === JSON.stringify(value)) return;
    if (isSeq(node) && Array.isArray(value)) {
      // Edited in place, so the list keeps its own comments and an item that stays keeps its own.
      const kept = new Map(node.items.map((item) => [JSON.stringify(isNode(item) ? item.toJSON() : item), item]));
      node.items = value.map((item) => kept.get(JSON.stringify(item)) ?? doc.createNode(item));
    } else {
      doc.setIn(path, value);
    }
    changed = true;
  };
  visit([], form);
  return changed ? doc.toString() : text;
}

/** Parses and validates config.yaml content. Errors name the offending field. */
export function parseConfig(text: string): Config {
  return toConfig(settingsForm(text));
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
  /** Looks at the file now instead of at the next interval, as after the Settings screen wrote it. */
  check(): void;
  close(): void;
};

/** Hands every valid change of the config file to `apply`; an invalid one keeps `current` and shows in `error()`. */
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
  const check = () => {
    const next = fileStamp(path);
    if (next === stamp) return;
    stamp = next;
    const before = [current, error];
    reload();
    if (current !== before[0] || error !== before[1]) onChange();
  };
  const timer = setInterval(check, intervalMs);
  timer.unref();

  return {
    error: () => error,
    check,
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
