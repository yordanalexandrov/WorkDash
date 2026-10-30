import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ConfigError, loadConfig } from "./config.js";
import { openStore } from "./db.js";
import { startPoller } from "./poller.js";
import { buildServer } from "./server.js";

const CONFIG_PATH = process.env.CONFIG_PATH ?? "config.yaml";
const DB_PATH = process.env.DB_PATH ?? "data/workdash.db";
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let config;
try {
  config = loadConfig(CONFIG_PATH);
} catch (error) {
  if (error instanceof ConfigError) fail(`${CONFIG_PATH}: ${error.message}`);
  throw error;
}

const token = process.env[config.github.tokenEnv];
if (!token) fail(`${CONFIG_PATH}: github.token_env: environment variable ${config.github.tokenEnv} is not set`);

mkdirSync(dirname(DB_PATH), { recursive: true });
const store = openStore(DB_PATH);

const server = buildServer({ store, pollIntervalMs: config.github.pollIntervalMs, lastPollError: () => poller.lastError(), logger: true });
const poller = startPoller({
  repos: config.repos,
  token,
  intervalMs: config.github.pollIntervalMs,
  store,
  log: server.log,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    poller.stop();
    await server.close();
    store.close();
    process.exit(0);
  });
}

await server.listen({ host: HOST, port: PORT });
