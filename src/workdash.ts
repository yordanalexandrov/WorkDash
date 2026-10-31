import type { AddressInfo } from "node:net";
import type { FastifyServerOptions } from "fastify";
import { type Config, ConfigError, loadConfig, parseConfig, watchConfig } from "./config.js";
import { type Legacy, openDataDir } from "./data-dir.js";
import { openStore } from "./db.js";
import type { Missing } from "./domain/settings.js";
import { createNotifier } from "./notifier.js";
import { type PollerSettings, startPoller } from "./poller.js";
import { buildServer, type DashboardSource, dashboardState } from "./server.js";
import { createSettings } from "./settings.js";
import { createEventHub } from "./sse.js";
import type { TokenStore } from "./token-store.js";

/** How often to check whether quiet hours are over, so the missed events reach an open browser without waiting for a poll. */
const MISSED_CHECK_MS = 60_000;

/** Everything the dashboard needs from whoever runs it: the env for `npm start` and Docker, the desktop app's own. */
export type WorkDashOptions = {
  /** Where the database, the settings and, without `tokens`, the GitHub token live. */
  dataDir: string;
  /** Where the GitHub token is kept; a plain file in `dataDir` when not given. */
  tokens?: TokenStore;
  /** The old config.yaml and env, taken in on the first start (ADR 0001); nothing is taken in without it. */
  legacy?: Legacy;
  host: string;
  /** 0 picks a free port; `url` tells which. */
  port: number;
  /** The zone quiet hours are read in; the machine's local time when not given. */
  timeZone?: string;
  /** The directory the page is served from, holding `public/` and `dist/`. */
  webRoot: string;
  logger?: FastifyServerOptions["logger"];
};

/** A running dashboard. */
export type WorkDash = {
  /** Where it answers, with the port it actually listens on. */
  url: string;
  /** Stops the config watcher, the poller and the server, then closes the database. */
  close(): Promise<void>;
};

function pollerSettings(config: Config, token: string | null): PollerSettings {
  return { repos: config.repos, token, intervalMs: config.github.pollIntervalMs, recentlyClosedWindowMs: config.review.recentlyClosedWindowMs };
}

/** The time zone given is not one this machine knows. */
export class TimeZoneError extends Error {}

function checkTimeZone(timeZone: string | undefined): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new TimeZoneError(`unknown time zone "${timeZone}"; expected a name such as "America/New_York"`);
  }
}

/** Starts the dashboard: opens the data directory, polls GitHub, watches the settings and serves the page and the API. */
export async function startWorkDash(options: WorkDashOptions): Promise<WorkDash> {
  const { timeZone } = options;
  checkTimeZone(timeZone);

  const data = openDataDir(options.dataDir, options.legacy, options.tokens);
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
    timeZone,
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
    timeZone,
    webRoot: options.webRoot,
    logger: options.logger,
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

  const close = async () => {
    configWatcher.close();
    clearInterval(missedTimer);
    poller.stop();
    await server.close();
    store.close();
  };

  try {
    await server.listen({ host: options.host, port: options.port });
  } catch (error) {
    await close();
    throw error;
  }
  const { port } = server.server.address() as AddressInfo;
  const host = options.host.includes(":") ? `[${options.host}]` : options.host;
  return { url: `http://${host}:${port}`, close };
}
