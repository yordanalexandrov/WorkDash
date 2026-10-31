import { join } from "node:path";
import { app } from "electron";
import { startWorkDash, type WorkDash } from "../../src/workdash.js";
import { freshLog } from "./log.js";
import { openTokenStore } from "./tokens.js";

/** The page and its assets: `web/` next to `desktop/` while running from the repository. */
function webRoot(): string {
  return join(app.getAppPath(), "..", "web");
}

/**
 * Starts the dashboard in this process on a free port of 127.0.0.1, with its data in `userData`. Nothing is taken in
 * from the env or an old config.yaml: the token is entered on the Settings screen. Quiet hours follow the machine's
 * local time.
 */
export function startServer(): Promise<WorkDash> {
  const userData = app.getPath("userData");
  return startWorkDash({
    dataDir: userData,
    tokens: openTokenStore(userData),
    host: "127.0.0.1",
    port: 0,
    webRoot: webRoot(),
    logger: { file: freshLog(userData) },
  });
}
