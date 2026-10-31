import { type Config, ConfigError, loadConfig, parseConfig, watchConfig } from "./config.js";
import { openDataDir } from "./data-dir.js";
import { openStore } from "./db.js";
import { createNotifier } from "./notifier.js";
import { type PollerSettings, startPoller } from "./poller.js";
import { buildServer, type DashboardSource, dashboardState, type Missing } from "./server.js";
import { createSettings } from "./settings.js";
import { createEventHub } from "./sse.js";

/** Where the database, the settings and the GitHub token live. */
const DATA_DIR = process.env.DATA_DIR ?? "data";
/** The config.yaml from before the settings lived in DATA_DIR, taken in on the first start. */
const LEGACY_CONFIG_PATH = process.env.CONFIG_PATH ?? "config.yaml";
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);
/** The zone quiet hours are read in; the machine's local time when TZ is not set. */
const TIME_ZONE = process.env.TZ || undefined;
/** How often to check whether quiet hours are over, so the missed events reach an open browser without waiting for a poll. */
const MISSED_CHECK_MS = 60_000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function pollerSettings(config: Config, token: string | null): PollerSettings {
  return { repos: config.repos, token, intervalMs: config.github.pollIntervalMs, recentlyClosedWindowMs: config.review.recentlyClosedWindowMs };
}

try {
  new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE });
} catch {
  fail(`TZ: unknown time zone "${TIME_ZONE}"; expected a name such as "America/New_York"`);
}

const data = openDataDir(DATA_DIR, { configPath: LEGACY_CONFIG_PATH, env: process.env });
let config: Config;
try {
  config = loadConfig(data.configPath);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  // Started with nothing set up; the watcher shows why the file is not in effect, and the Settings screen mends it.
  config = parseConfig("");
}
let token = data.tokens.get();

const store = openStore(data.dbPath);

const events = createEventHub();
const dashboard: DashboardSource = {
  store,
  rules: () => ({ team: config.team, requiredApprovals: config.review.requiredApprovals }),
  jira: () => config.jira,
  pollIntervalMs: () => config.github.pollIntervalMs,
  recentlyClosedWindowMs: () => config.review.recentlyClosedWindowMs,
  pollHealth: () => poller.health(),
  poller: {
    mode: () => poller.mode(),
    polling: () => poller.polling(),
    setMode: (mode) => poller.setMode(mode),
    demand: (demand) => poller.demand(demand),
  },
  configError: () => configWatcher.error(),
  missing: () => [...(token === null ? ["token" as const] : []), ...(config.repos.length === 0 ? ["repos" as const] : [])] satisfies Missing[],
};
/**
 * Pushes the dashboard as it is now to every open browser. With none open it does nothing, which also keeps the
 * first poll, started before the poller is assigned and the server listens, from reading the poller too early.
 */
const publishDashboard = () => {
  if (events.clientCount() > 0) events.broadcast("dashboard", dashboardState(dashboard));
};

// Desktop notifications: what changed between two polls, pushed to the open browsers by the rules in `notifications`.
const notifier = createNotifier({
  store,
  events,
  rules: dashboard.rules,
  notifications: () => config.notifications,
  pollMode: () => poller.mode(),
  timeZone: TIME_ZONE,
});
const missedTimer = setInterval(notifier.flushMissed, MISSED_CHECK_MS);
missedTimer.unref();

const settings = createSettings({
  configPath: data.configPath,
  tokens: data.tokens,
  fallback: () => config,
  onSaved: () => configWatcher.check(),
  onToken(next) {
    token = next;
    poller.reconfigure(pollerSettings(config, token));
    publishDashboard();
  },
});

const server = buildServer({
  ...dashboard,
  events,
  pendingNotifications: notifier.takePending,
  acknowledgeNotifications: notifier.acknowledge,
  settings,
  timeZone: TIME_ZONE,
  logger: true,
});
const poller = startPoller({
  ...pollerSettings(config, token),
  store,
  log: server.log,
  onPollStart: publishDashboard,
  onPoll: publishDashboard,
  onSnapshot: notifier.afterSnapshot,
});

// Saved settings, and edits to config.yaml by hand, apply without a restart; an invalid edit is shown in the UI and the last valid config stays.
const configWatcher = watchConfig(data.configPath, {
  current: config,
  apply(next) {
    config = next;
    poller.reconfigure(pollerSettings(config, token));
  },
  onChange: publishDashboard,
  log: server.log,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    configWatcher.close();
    clearInterval(missedTimer);
    poller.stop();
    await server.close();
    store.close();
    process.exit(0);
  });
}

await server.listen({ host: HOST, port: PORT });
