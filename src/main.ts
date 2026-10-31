import { fileURLToPath } from "node:url";
import { startWorkDash, TimeZoneError, type WorkDash } from "./workdash.js";

// `npm start` and the Docker image: the dashboard as the environment sets it up.
const env = process.env;

let workdash: WorkDash;
try {
  workdash = await startWorkDash({
    // Where the database, the settings and the GitHub token live.
    dataDir: env.DATA_DIR ?? "data",
    // The config.yaml from before the settings lived in DATA_DIR, and the token in the env, taken in on the first start.
    legacy: { configPath: env.CONFIG_PATH ?? "config.yaml", env },
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 3000),
    // The zone quiet hours are read in; the machine's local time when TZ is not set.
    timeZone: env.TZ || undefined,
    // dist/main.js sits next to web/, as src/main.ts does.
    webRoot: fileURLToPath(new URL("../web/", import.meta.url)),
    logger: true,
  });
} catch (error) {
  if (!(error instanceof TimeZoneError)) throw error;
  console.error(`TZ: ${error.message}`);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await workdash.close();
    process.exit(0);
  });
}
