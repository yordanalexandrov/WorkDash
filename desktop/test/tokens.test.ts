import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openTokenStore, type Encryption } from "../src/tokens.js";

const TOKEN = "ghp_secret123";

/** Stands in for Electron's safeStorage: "encrypts" by reversing the bytes, so the token is not in the saved bytes. */
function fakeEncryption(available: boolean, backend: string): Encryption {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (text) => Buffer.from(text, "utf8").reverse(),
    decryptString: (data) => Buffer.from(data).reverse().toString("utf8"),
  };
}

function open(encryption: Encryption) {
  const userData = mkdtempSync(join(tmpdir(), "workdash-tokens-"));
  const logged: string[] = [];
  const tokens = openTokenStore(userData, encryption, (line) => logged.push(line));
  return { userData, tokens, logged };
}

function filesIn(dir: string): string {
  return readdirSync(dir)
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

describe("the desktop app's token store", () => {
  it("keeps the token encrypted in userData when the keyring unlocks it", () => {
    const { userData, tokens, logged } = open(fakeEncryption(true, "gnome_libsecret"));
    tokens.set(TOKEN);
    expect(readdirSync(userData)).toEqual(["github-token.enc"]);
    expect(filesIn(userData)).not.toContain(TOKEN);
    expect(tokens.get()).toBe(TOKEN);
    expect(logged.join("\n")).toMatch(/keyring.*gnome_libsecret/);
  });

  it("reads the saved token again after a restart", () => {
    const encryption = fakeEncryption(true, "kwallet5");
    const { userData, tokens } = open(encryption);
    tokens.set(TOKEN);
    expect(openTokenStore(userData, encryption, () => {}).get()).toBe(TOKEN);
  });

  it("has no token before one is entered", () => {
    expect(open(fakeEncryption(true, "gnome_libsecret")).tokens.get()).toBeNull();
  });

  it("removes a plain-text token left from before, once the token is saved encrypted", () => {
    const userData = mkdtempSync(join(tmpdir(), "workdash-tokens-"));
    writeFileSync(join(userData, "github-token"), "ghp_old\n");
    openTokenStore(userData, fakeEncryption(true, "gnome_libsecret"), () => {}).set(TOKEN);
    expect(existsSync(join(userData, "github-token"))).toBe(false);
  });

  it.each([
    ["encryption is not available", fakeEncryption(false, "gnome_libsecret")],
    ["the backend is basic_text (no unlocked keyring)", fakeEncryption(true, "basic_text")],
    ["the backend is unknown", fakeEncryption(true, "unknown")],
  ])("falls back to the 0600 file when %s", (_, encryption) => {
    const { userData, tokens, logged } = open(encryption);
    tokens.set(TOKEN);
    expect(readdirSync(userData)).toEqual(["github-token"]);
    expect(statSync(join(userData, "github-token")).mode & 0o777).toBe(0o600);
    expect(tokens.get()).toBe(TOKEN);
    expect(logged.join("\n")).toMatch(/0600/);
  });
});

describe("the desktop app's token store, when the saved token cannot be read", () => {
  /** Encryption whose decrypt fails, as safeStorage does after the keyring was reset or the file was damaged. */
  function brokenDecryption(): Encryption {
    return {
      ...fakeEncryption(true, "gnome_libsecret"),
      decryptString: () => {
        throw new Error("Error while decrypting the ciphertext provided to safeStorage.decryptString.");
      },
    };
  }

  it("has no token, says so in the log, and a new token replaces the unreadable file", () => {
    const userData = mkdtempSync(join(tmpdir(), "workdash-tokens-"));
    writeFileSync(join(userData, "github-token.enc"), "garbage");
    const logged: string[] = [];
    const tokens = openTokenStore(userData, brokenDecryption(), (line) => logged.push(line));
    expect(tokens.get()).toBeNull();
    expect(logged.join("\n")).toMatch(/could not read/i);
    tokens.set(TOKEN);
    expect(openTokenStore(userData, fakeEncryption(true, "gnome_libsecret"), () => {}).get()).toBe(TOKEN);
  });
});

describe("the desktop app's token store, with a plain-text token from before the keyring", () => {
  it("moves the token into the keyring and deletes the plain file", () => {
    const userData = mkdtempSync(join(tmpdir(), "workdash-tokens-"));
    writeFileSync(join(userData, "github-token"), "ghp_old\n", { mode: 0o600 });
    const logged: string[] = [];
    const tokens = openTokenStore(userData, fakeEncryption(true, "gnome_libsecret"), (line) => logged.push(line));
    expect(tokens.get()).toBe("ghp_old");
    expect(readdirSync(userData)).toEqual(["github-token.enc"]);
    expect(filesIn(userData)).not.toContain("ghp_old");
    expect(logged.join("\n")).toMatch(/moved/i);
  });

  it("leaves the plain file alone when an encrypted token is already there", () => {
    const userData = mkdtempSync(join(tmpdir(), "workdash-tokens-"));
    openTokenStore(userData, fakeEncryption(true, "gnome_libsecret"), () => {}).set(TOKEN);
    writeFileSync(join(userData, "github-token"), "ghp_old\n", { mode: 0o600 });
    expect(openTokenStore(userData, fakeEncryption(true, "gnome_libsecret"), () => {}).get()).toBe(TOKEN);
  });
});
