import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFileAtomically } from "./atomic-write.js";
import { applySettings, type Config, ConfigError, formFromConfig, settingsForm } from "./config.js";
import { type FieldIssue, type SettingsForm, validateSettings } from "./domain/settings.js";
import { accessibleRepos, checkRepo, checkToken, checkUser, type NameCheck, type TokenCheck, type UserCheck } from "./github/rest.js";
import type { TokenStore } from "./token-store.js";

/** The settings as the Settings screen opens them, and the hash of the file they were read from. */
export type SettingsRead = {
  settings: SettingsForm;
  hash: string;
  /** Why the file on disk is not valid, when `settings` are the ones in effect instead; null when it is. */
  invalid: string | null;
};

export type SaveResult = { ok: true; hash: string } | { ok: false; reason: "conflict" } | { ok: false; reason: "invalid"; issues: FieldIssue[] };

/** Whether a token is saved, and how the screen shows it. The token itself never leaves the server. */
export type TokenStatus = { set: boolean; masked: string | null };

export type NamesCheck = { repos: Record<string, NameCheck>; team: Record<string, UserCheck> };

export type Settings = {
  read(): SettingsRead;
  /** Saves `form` over the file read with `hash`; refuses when the file changed since or `form` is not valid. */
  save(form: unknown, hash: string): SaveResult;
  token(): TokenStatus;
  /** Saves the token once GitHub takes it; a token GitHub refuses is not saved. */
  saveToken(token: string): Promise<TokenCheck>;
  checkToken(): Promise<TokenCheck>;
  /** Which repos and logins GitHub knows, by the saved token. */
  checkNames(names: { repos: string[]; team: string[] }): Promise<NamesCheck>;
  /** The repos the saved token can see, as hints. */
  suggestions(): Promise<string[]>;
};

const NO_TOKEN = { ok: false, message: "Няма записан токен" } as const;

/** "ghp_…1234": enough to tell two tokens apart, never enough to use one. */
function mask(token: string): string {
  return token.length >= 12 ? `${token.slice(0, 4)}…${token.slice(-4)}` : `…${token.slice(-2)}`;
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** The Settings screen's side on the server: config.yaml in the data directory, and the token store. */
export function createSettings(options: {
  configPath: string;
  tokens: TokenStore;
  /** The config in effect, shown when the file on disk is not valid. */
  fallback: () => Config;
  /** After the settings were written, so the change applies without waiting for the file watcher. */
  onSaved?: () => void;
  /** After a new token was saved. */
  onToken?: (token: string) => void;
  fetch?: typeof globalThis.fetch;
}): Settings {
  const { configPath, tokens, fallback, onSaved = () => {}, onToken = () => {}, fetch = globalThis.fetch } = options;

  const readText = () => {
    try {
      return readFileSync(configPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  };

  return {
    read() {
      const text = readText();
      try {
        return { settings: settingsForm(text), hash: hashOf(text), invalid: null };
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        return { settings: formFromConfig(fallback()), hash: hashOf(text), invalid: error.message };
      }
    },
    save(form, hash) {
      const text = readText();
      if (hashOf(text) !== hash) return { ok: false, reason: "conflict" };
      const result = validateSettings(form);
      if (!result.ok) return { ok: false, reason: "invalid", issues: result.issues };
      let next: string;
      try {
        next = applySettings(text, result.form);
      } catch (error) {
        // A file that is not even YAML has nothing worth keeping.
        if (!(error instanceof ConfigError)) throw error;
        next = applySettings("", result.form);
      }
      writeFileAtomically(configPath, next);
      onSaved();
      return { ok: true, hash: hashOf(next) };
    },
    token() {
      const token = tokens.get();
      return { set: token !== null, masked: token === null ? null : mask(token) };
    },
    async saveToken(token) {
      const check = await checkToken(token.trim(), fetch);
      if (check.ok) {
        tokens.set(token);
        onToken(token.trim());
      }
      return check;
    },
    async checkToken() {
      const token = tokens.get();
      return token === null ? NO_TOKEN : checkToken(token, fetch);
    },
    async checkNames({ repos, team }) {
      const token = tokens.get();
      const each = async <T>(names: string[], check: (name: string) => Promise<T>) =>
        Object.fromEntries(await Promise.all(names.map(async (name) => [name, await check(name)] as const)));
      return {
        repos: await each(repos, (repo) => (token === null ? Promise.resolve(NO_TOKEN) : checkRepo(repo, token, fetch))),
        team: await each(team, (login) => (token === null ? Promise.resolve(NO_TOKEN) : checkUser(login, token, fetch))),
      };
    },
    async suggestions() {
      const token = tokens.get();
      return token === null ? [] : accessibleRepos(token, fetch);
    },
  };
}
