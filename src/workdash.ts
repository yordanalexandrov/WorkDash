import type { AddressInfo } from "node:net";
import type { FastifyServerOptions } from "fastify";
import { type Config, ConfigError, loadConfig, parseConfig, watchConfig } from "./config.js";
import { type Legacy, openDataDir } from "./data-dir.js";
import { openStore } from "./db.js";
import { groupIntoSections, waitingOnMe } from "./domain/classify.js";
import type { Missing } from "./domain/settings.js";
import { createIssuePoller } from "./issue-poller.js";
import { createNotifier } from "./notifier.js";
import { type PollerSettings, startPoller } from "./poller.js";
import { buildServer, type DashboardSource, dashboardState, type IssueSource, issueBoardState } from "./server.js";
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
  /**
   * Calls `listener` with how many PRs wait on me (the Чака теб count) right away, then each time it changes: after a
   * poll, a PR marked seen or a change of settings. Returns what stops it.
   */
  onWaitingOnMe(listener: (count: number) => void): () => void;
  /** Whether the notification pause is on. */
  paused(): boolean;
  /**
   * Turns the notification pause on or off. While on, nothing is notified, as in quiet hours; switched off, what
   * happened meanwhile comes as one missed summary. It is off on every start.
   */
  setPaused(paused: boolean): void;
  /** Stops the config watcher, the pollers and the server, then closes the database. */
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
  // The Чака теб count, for whoever shows it outside the page (the desktop app's tray). Read from the store and the
  // rules alone, so it is right before the poller exists and with no browser open.
  const countWaiting = () => {
    const snapshot = store.loadSnapshot();
    return waitingOnMe(groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", dashboard.rules(), store.loadSeen()));
  };
  const waitingListeners = new Set<(count: number) => void>();
  let waiting = countWaiting();
  const refreshWaiting = () => {
    const count = countWaiting();
    if (count === waiting) return;
    waiting = count;
    for (const listener of waitingListeners) listener(count);
  };
  const onWaitingOnMe = (listener: (count: number) => void) => {
    waitingListeners.add(listener);
    listener(waiting);
    return () => void waitingListeners.delete(listener);
  };

  /**
   * Pushes the dashboard as it is now to every open browser. With none open it does nothing, which also keeps the
   * first poll, started before the poller is assigned and the server listens, from reading the poller too early.
   */
  const publishDashboard = () => {
    refreshWaiting();
    if (events.clientCount() > 0) events.broadcast("dashboard", dashboardState(dashboard));
  };

  // The Issue dashboard: the issues of a repo, polled when a page opens it, apart from the PRs.
  const issues: IssueSource = {
    repos: () => config.repos,
    config: () => config.issues,
    recentlyClosedWindowMs: () => config.review.recentlyClosedWindowMs,
    // The issue poller logs to the server's log, so it is made after the server; nothing asks for it before.
    get poller() {
      return issuePoller;
    },
  };
  /** Pushes a repo's issues as they are now to every open browser; the pages on that repo take them. */
  const publishIssues = (repo: string) => {
    if (events.clientCount() > 0) events.broadcast("issues", issueBoardState(store, issues, repo));
  };
  /** After a config change: the stages may have changed, so every followed repo with issues saved is pushed again. */
  const publishAllIssues = () => {
    for (const repo of config.repos) {
      const saved = store.loadIssues(repo);
      if (saved) publishIssues(saved.repo);
    }
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
    onSeen: refreshWaiting,
    settings,
    timeZone,
    issues,
    webRoot: options.webRoot,
    logger: options.logger,
  });
  const issuePoller = createIssuePoller({
    store,
    token: () => token,
    intervalMs: () => config.github.pollIntervalMs,
    log: server.log,
    onChange: publishIssues,
    recentlyClosedWindowMs: () => config.review.recentlyClosedWindowMs,
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
    onChange() {
      publishDashboard();
      publishAllIssues();
    },
    log: server.log,
  });

  const close = async () => {
    waitingListeners.clear();
    configWatcher.close();
    clearInterval(missedTimer);
    poller.stop();
    issuePoller.stop();
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
  return { url: `http://${host}:${port}`, onWaitingOnMe, paused: notifier.paused, setPaused: notifier.setPaused, close };
}
