import { join } from "node:path";
import { fileTokenStore, type TokenStore } from "../../src/token-store.js";

/** Where the desktop app keeps the GitHub token: for now the same 0600 file as `npm start`, in `userData`. */
export function openTokenStore(userData: string): TokenStore {
  return fileTokenStore(join(userData, "github-token"));
}
