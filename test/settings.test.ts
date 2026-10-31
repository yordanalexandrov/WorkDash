import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { createSettings } from "../src/settings.js";
import { fileTokenStore } from "../src/token-store.js";

const RATE = { "x-ratelimit-remaining": "4990", "x-ratelimit-limit": "5000", "x-ratelimit-reset": "1793440800" };

/** GitHub that knows one good token, "ghp_good1234", whose owner is "me". */
const github = (async (input: string | URL | Request, init?: RequestInit) => {
  const auth = (init!.headers as Record<string, string>).Authorization;
  if (auth !== "Bearer ghp_good1234") return Response.json({ message: "Bad credentials" }, { status: 401 });
  if (String(input).endsWith("/user")) return Response.json({ login: "me" }, { headers: { ...RATE, "x-oauth-scopes": "repo" } });
  if (String(input).endsWith("/repos/my-org/repo-a")) return Response.json({});
  if (String(input).endsWith("/repos/my-org/repo-a/labels?per_page=100")) return Response.json([{ name: "todo", color: "ededed" }]);
  if (String(input).endsWith("/users/colleague1")) return Response.json({ avatar_url: "https://avatars.example/u/1" });
  return new Response(null, { status: 404 });
}) as typeof globalThis.fetch;

describe("settings", () => {
  let dir: string;
  let configPath: string;
  let saved: number;
  let tokens: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "workdash-settings-"));
    configPath = join(dir, "config.yaml");
    writeFileSync(configPath, "# mine\nrepos:\n  - my-org/repo-a   # the main one\n");
    saved = 0;
    tokens = [];
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function open() {
    return createSettings({
      configPath,
      tokens: fileTokenStore(join(dir, "github-token")),
      fallback: () => parseConfig("repos: [my-org/in-effect]\n"),
      onSaved: () => saved++,
      onToken: (token) => tokens.push(token),
      fetch: github,
    });
  }

  it("reads the settings on disk", () => {
    expect(open().read().settings.repos).toEqual(["my-org/repo-a"]);
  });

  it("reads the settings in effect when the file on disk is not valid, and says why", () => {
    writeFileSync(configPath, "repos: [nope]\n");

    const { settings, invalid } = open().read();

    expect(settings.repos).toEqual(["my-org/in-effect"]);
    expect(invalid).toMatch(/repos\[0\]/);
  });

  it("saves the settings, keeping the comments, and says so", () => {
    const settings = open();
    const { settings: form, hash } = settings.read();

    const result = settings.save({ ...form, team: ["colleague1"] }, hash);

    expect(result.ok).toBe(true);
    const text = readFileSync(configPath, "utf8");
    expect(text).toMatch(/# the main one/);
    expect(parseConfig(text).team).toEqual(["colleague1"]);
    expect(saved).toBe(1);
    expect(result.ok && result.hash).toBe(settings.read().hash);
  });

  it("refuses to save over a file changed by hand since it was read", () => {
    const settings = open();
    const { settings: form, hash } = settings.read();
    writeFileSync(configPath, "repos: [my-org/repo-b]\n");

    expect(settings.save({ ...form, team: ["colleague1"] }, hash)).toEqual({ ok: false, reason: "conflict" });
    expect(readFileSync(configPath, "utf8")).toBe("repos: [my-org/repo-b]\n");
    expect(saved).toBe(0);
  });

  it("refuses invalid settings and names the fields", () => {
    const settings = open();
    const { settings: form, hash } = settings.read();

    expect(settings.save({ ...form, repos: ["nope"] }, hash)).toEqual({ ok: false, reason: "invalid", issues: [{ path: "repos[0]", message: 'expected "owner/name"' }] });
    expect(saved).toBe(0);
  });

  it("saves over a file on disk that is not valid", () => {
    writeFileSync(configPath, "repos: [\n");
    const settings = open();
    const { settings: form, hash } = settings.read();

    expect(settings.save({ ...form, repos: ["my-org/repo-c"] }, hash).ok).toBe(true);
    expect(parseConfig(readFileSync(configPath, "utf8")).repos).toEqual(["my-org/repo-c"]);
  });

  describe("the token", () => {
    it("has none at first", () => {
      expect(open().token()).toEqual({ set: false, masked: null });
    });

    it("saves a token GitHub takes, and shows it only masked", async () => {
      const settings = open();

      const result = await settings.saveToken("ghp_good1234");

      expect(result).toMatchObject({ ok: true, login: "me" });
      expect(settings.token()).toEqual({ set: true, masked: "ghp_…1234" });
      expect(tokens).toEqual(["ghp_good1234"]);
    });

    it("does not save a token GitHub refuses", async () => {
      const settings = open();
      await settings.saveToken("ghp_good1234");

      const result = await settings.saveToken("ghp_bad");

      expect(result).toEqual({ ok: false, message: "GitHub отказва токена: Bad credentials" });
      expect(settings.token().masked).toBe("ghp_…1234");
      expect(tokens).toEqual(["ghp_good1234"]);
    });

    it("checks the saved token", async () => {
      const settings = open();
      expect(await settings.checkToken()).toEqual({ ok: false, message: "Няма записан токен" });

      await settings.saveToken("ghp_good1234");

      expect(await settings.checkToken()).toMatchObject({ ok: true, login: "me", scopes: ["repo"] });
    });
  });

  it("checks repos and logins against GitHub with the saved token", async () => {
    const settings = open();
    await settings.saveToken("ghp_good1234");

    const result = await settings.checkNames({ repos: ["my-org/repo-a", "my-org/nope"], team: ["colleague1"] });

    expect(result).toEqual({
      repos: { "my-org/repo-a": { ok: true }, "my-org/nope": { ok: false, message: "Не съществува или токенът не го вижда" } },
      team: { colleague1: { ok: true, avatarUrl: "https://avatars.example/u/1" } },
    });
  });

  it("lists each repo's labels as hints for its stages, none for a repo GitHub does not answer about", async () => {
    const settings = open();
    expect(await settings.labels(["my-org/repo-a"])).toEqual({ "my-org/repo-a": null });

    await settings.saveToken("ghp_good1234");

    expect(await settings.labels(["my-org/repo-a", "my-org/nope"])).toEqual({ "my-org/repo-a": [{ name: "todo", color: "ededed" }], "my-org/nope": null });
  });
});
