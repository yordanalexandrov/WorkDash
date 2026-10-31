import { renameSync, writeFileSync } from "node:fs";

/** Writes `text` to a temporary file next to `path` and renames it over `path`, so no reader ever sees half a file. */
export function writeFileAtomically(path: string, text: string, mode = 0o644): void {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text, { mode });
  renameSync(temp, path);
}
