import { readFileSync } from "node:fs";
import { writeFileAtomically } from "./atomic-write.js";

/** Where the GitHub token is kept, apart from the settings. The desktop app keeps it encrypted with the OS keyring when it can (desktop/src/tokens.ts). */
export type TokenStore = {
  /** The token, or null when none has been saved. */
  get(): string | null;
  set(token: string): void;
};

/** A token store in a plain-text file only its owner can read (mode 0600). */
export function fileTokenStore(path: string): TokenStore {
  return {
    get() {
      try {
        return readFileSync(path, "utf8").trim() || null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    set(token) {
      writeFileAtomically(path, `${token.trim()}\n`, 0o600);
    },
  };
}
