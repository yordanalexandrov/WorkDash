import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomically } from "../../src/atomic-write.js";
import { fileTokenStore, type TokenStore } from "../../src/token-store.js";

/** The part of Electron's `safeStorage` the token store uses; usable only once the app is ready. */
export type Encryption = {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
};

/** Backends that do not lock the token with the OS keyring: `basic_text` is a key built into Chromium. */
const NO_KEYRING = new Set(["basic_text", "unknown"]);

/**
 * Where the desktop app keeps the GitHub token: encrypted with the OS keyring (`safeStorage`) in
 * `userData/github-token.enc`, or, when there is no unlocked keyring, in the same 0600 file as `npm start`.
 * Says in `log` which one it took. A plain-text token left from before the keyring is moved into it. A saved
 * token that cannot be read or decrypted counts as none, so the app asks for it again instead of not starting.
 */
export function openTokenStore(userData: string, encryption: Encryption, log: (line: string) => void): TokenStore {
  const plainPath = join(userData, "github-token");
  const available = encryption.isEncryptionAvailable();
  const backend = encryption.getSelectedStorageBackend();
  if (!available || NO_KEYRING.has(backend)) {
    const why = available ? `backend ${backend}` : `no encryption, backend ${backend}`;
    log(`GitHub token: no OS keyring (${why}), kept in the 0600 file ${plainPath}`);
    return fileTokenStore(plainPath);
  }
  const path = join(userData, "github-token.enc");
  log(`GitHub token: encrypted with the OS keyring (backend ${backend}) in ${path}`);
  const store: TokenStore = {
    get() {
      try {
        return encryption.decryptString(readFileSync(path)).trim() || null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        log(`GitHub token: could not read ${path}, asking for the token again (${(error as Error).message})`);
        return null;
      }
    },
    set(token) {
      writeFileAtomically(path, encryption.encryptString(token.trim()), 0o600);
      // A token saved in plain text before the keyring was there should not stay readable next to it.
      rmSync(plainPath, { force: true });
    },
  };
  if (!existsSync(path)) {
    const plain = fileTokenStore(plainPath).get();
    if (plain) {
      store.set(plain);
      log(`GitHub token: moved from the 0600 file ${plainPath} into the OS keyring`);
    }
  }
  return store;
}
