import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Empties the server's log in `userData/logs`, creating it when needed, and returns its path: each start logs anew. */
export function freshLog(userData: string): string {
  const dir = join(userData, "logs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "workdash.log");
  writeFileSync(path, "");
  return path;
}
