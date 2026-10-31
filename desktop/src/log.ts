import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Empties the server's log in `userData/logs`, creating it when needed, and returns its path: each start logs anew. */
export function freshLog(userData: string): string {
  const dir = join(userData, "logs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "workdash.log");
  writeFileSync(path, "");
  return path;
}

/** Writes `message` to the log at `path` as an info line in the server's own (pino) format, for what happens before it starts. */
export function logInfo(path: string, message: string): void {
  appendFileSync(path, `${JSON.stringify({ level: 30, time: Date.now(), pid: process.pid, msg: message })}\n`);
}
