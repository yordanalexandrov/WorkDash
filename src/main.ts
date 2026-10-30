import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Config, ConfigError, loadConfig, watchConfig } from "./config.js";
import { openStore } from "./db.js";
import { startPoller } from "./poller.js";
import { buildServer, type DashboardSource, dashboardState } from "./server.js";
import { createEventHub } from "./sse.js";

const CONFIG_PATH = process.env.CONFIG_PATH ?? "config.yaml";
const DB_PATH = process.env.DB_PATH ?? "data/workdash.db";
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);

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
  pollHealth: () => poller.health(),
  configError: () => configWatcher.error(),
};
/** Pushes the dashboard as it is now to every open browser. */
const publishDashboard = () => events.broadcast("dashboard", dashboardState(dashboard));

const server = buildServer({ ...dashboard, events, logger: true });
const poller = startPoller({
  repos: config.repos,
  token,
  intervalMs: config.github.pollIntervalMs,
  store,
  log: server.log,
  onPoll: publishDashboard,
});

// Edits to config.yaml apply without a restart; an invalid edit is shown in the UI and the last valid config stays.
const configWatcher = watchConfig(CONFIG_PATH, {
  current: config,
  apply(next) {
    const nextToken = tokenFor(next);
    config = next;
    token = nextToken;
    poller.reconfigure({ repos: config.repos, token, intervalMs: config.github.pollIntervalMs });
  },
  onChange: publishDashboard,
  log: server.log,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    configWatcher.close();
    poller.stop();
    await server.close();
    store.close();
    process.exit(0);
  });
}

await server.listen({ host: HOST, port: PORT });
