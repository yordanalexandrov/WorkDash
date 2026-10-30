import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Config, ConfigError, loadConfig, watchConfig } from "./config.js";
import { openStore } from "./db.js";
import { createNotifier } from "./notifier.js";
import { startPoller } from "./poller.js";
import { buildServer, type DashboardSource, dashboardState } from "./server.js";
import { createEventHub } from "./sse.js";

const CONFIG_PATH = process.env.CONFIG_PATH ?? "config.yaml";
const DB_PATH = process.env.DB_PATH ?? "data/workdash.db";
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

/** The GitHub token named by `github.token_env`; a ConfigError when that variable is not set. */
function tokenFor(config: Config): string {
  const token = process.env[config.github.tokenEnv];
  if (!token) throw new ConfigError(`github.token_env: environment variable ${config.github.tokenEnv} is not set`);
  return token;
}

try {
  new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE });
} catch {
  fail(`TZ: unknown time zone "${TIME_ZONE}"; expected a name such as "Europe/Sofia"`);
}

let config: Config;
let token: string;
try {
  config = loadConfig(CONFIG_PATH);
  token = tokenFor(config);
} catch (error) {
  if (error instanceof ConfigError) fail(`${CONFIG_PATH}: ${error.message}`);
  throw error;
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const store = openStore(DB_PATH);

const events = createEventHub();
const dashboard: DashboardSource = {
  store,
  rules: () => ({ team: config.team, requiredApprovals: config.review.requiredApprovals }),
  jira: () => config.jira,
  pollIntervalMs: () => config.github.pollIntervalMs,
  recentlyClosedWindowMs: () => config.review.recentlyClosedWindowMs,
  pollHealth: () => poller.health(),
  configError: () => configWatcher.error(),
};
/** Pushes the dashboard as it is now to every open browser. */
const publishDashboard = () => events.broadcast("dashboard", dashboardState(dashboard));

// Desktop notifications: what changed between two polls, pushed to the open browsers by the rules in `notifications`.
const notifier = createNotifier({ store, events, rules: dashboard.rules, notifications: () => config.notifications, timeZone: TIME_ZONE });
const missedTimer = setInterval(notifier.flushMissed, MISSED_CHECK_MS);
missedTimer.unref();

const server = buildServer({ ...dashboard, events, pendingNotifications: notifier.takePending, acknowledgeNotifications: notifier.acknowledge, logger: true });
const poller = startPoller({
  repos: config.repos,
  token,
  intervalMs: config.github.pollIntervalMs,
  recentlyClosedWindowMs: config.review.recentlyClosedWindowMs,
  store,
  log: server.log,
  onPoll: publishDashboard,
  onSnapshot: notifier.afterSnapshot,
});

// Edits to config.yaml apply without a restart; an invalid edit is shown in the UI and the last valid config stays.
const configWatcher = watchConfig(CONFIG_PATH, {
  current: config,
  apply(next) {
    const nextToken = tokenFor(next);
    config = next;
    token = nextToken;
    poller.reconfigure({
      repos: config.repos,
      token,
      intervalMs: config.github.pollIntervalMs,
      recentlyClosedWindowMs: config.review.recentlyClosedWindowMs,
    });
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
