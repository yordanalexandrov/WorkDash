import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, parseDocument } from "yaml";
import { writeFileAtomically } from "./atomic-write.js";
import { fileTokenStore, type TokenStore } from "./token-store.js";

/** Everything the dashboard keeps: the database, the settings and the GitHub token, in one directory. */
export type DataDir = {
  dbPath: string;
  configPath: string;
  tokens: TokenStore;
};

const EMPTY_SETTINGS = "# WorkDash settings: change them from the dashboard's Settings screen (⚙).\n";

/** Where the settings and the token came from before they lived in the data directory: read once, on the first start. */
export type Legacy = {
  /** The config.yaml that used to sit next to docker-compose.yml. */
  configPath: string;
  env: Record<string, string | undefined>;
};

/**
 * Opens the data directory, creating it when needed. On the first start it takes the old config.yaml in (without
 * `github.token_env`, which named the variable holding the token) and, while no token is saved, the token from that
 * variable (GITHUB_TOKEN by default). What the directory already holds is never replaced.
 */
export function openDataDir(dir: string, legacy: Legacy): DataDir {
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, "config.yaml");
  const tokens = fileTokenStore(join(dir, "github-token"));

  const old = existsSync(legacy.configPath) ? readFileSync(legacy.configPath, "utf8") : null;
  const { text, tokenEnv } = old === null ? { text: EMPTY_SETTINGS, tokenEnv: "GITHUB_TOKEN" } : withoutTokenEnv(old);
  if (!existsSync(configPath)) writeFileAtomically(configPath, text);

  const envToken = legacy.env[tokenEnv];
  if (tokens.get() === null && envToken) tokens.set(envToken);

  return { dbPath: join(dir, "workdash.db"), configPath, tokens };
}

/** The old config without `github.token_env`, and the variable it named. */
function withoutTokenEnv(text: string): { text: string; tokenEnv: string } {
  const doc = parseDocument(text);
  const named = doc.getIn(["github", "token_env"]);
  if (named === undefined) return { text, tokenEnv: "GITHUB_TOKEN" };
  doc.deleteIn(["github", "token_env"]);
  const github = doc.get("github");
  if (isMap(github) && github.items.length === 0) doc.delete("github");
  return { text: doc.toString(), tokenEnv: typeof named === "string" && named ? named : "GITHUB_TOKEN" };
}
