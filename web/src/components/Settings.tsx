import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { EVENT_TYPES } from "../../../src/domain/events.js";
import {
  checkNames,
  checkToken,
  type FieldIssue,
  loadSettings,
  type NameCheck,
  repoSuggestions,
  saveSettings,
  saveToken,
  type SettingsForm,
  type SettingsRead,
  type TokenCheck,
  type UserCheck,
} from "../api.js";
import { eventLabel } from "../notifications.js";
import { changed, issueAt, readQuiet, strayIssues, withItem, writeQuiet } from "../settingsDraft.js";
import { ESCAPE, useShortcuts } from "../useShortcuts.js";
import { Avatar } from "./Avatar.js";

type Checks = { repos: Record<string, NameCheck>; team: Record<string, UserCheck> };

/** The paths of the fields the screen shows an issue next to; any other issue is listed on top. */
const FIELD_PATHS = [
  /^github\.poll_interval$/,
  /^repos(\[\d+\])?$/,
  /^team(\[\d+\])?$/,
  /^jira\.(base_url|project_keys)(\[\d+\])?$/,
  /^review\.(required_approvals|recently_closed_window)$/,
  /^notifications\.quiet_hours$/,
];

const shownByField = (path: string) => FIELD_PATHS.some((pattern) => pattern.test(path));

/** The Settings screen: one draft of everything in config.yaml, saved at once, and the token, saved on its own. */
export function Settings({ onClose }: { onClose(): void }) {
  const [read, setRead] = useState<SettingsRead | null>(null);
  const [draft, setDraft] = useState<SettingsForm | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [checks, setChecks] = useState<Checks>({ repos: {}, team: {} });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tokenCheck, setTokenCheck] = useState<TokenCheck | "checking" | null>(null);

  const dirty = read !== null && draft !== null && changed(draft, read.settings);

  /** Asks GitHub about every repo and login in `form`, and for repo hints, once a token is saved. */
  const lookUp = (form: SettingsForm) => {
    checkNames({ repos: form.repos, team: form.team })
      .then(setChecks)
      .catch(() => {});
    repoSuggestions()
      .then(setSuggestions)
      .catch(() => {});
  };

  const verifyToken = () => {
    setTokenCheck("checking");
    checkToken()
      .then(setTokenCheck)
      .catch((error: Error) => setTokenCheck({ ok: false, message: error.message }));
  };

  const load = async () => {
    let next: SettingsRead;
    try {
      next = await loadSettings();
    } catch (error) {
      setFailure(`Настройките не се заредиха: ${(error as Error).message}`);
      return;
    }
    setRead(next);
    setDraft(next.settings);
    setIssues([]);
    setConflict(false);
    setFailure(null);
    if (next.token.set) {
      verifyToken();
      lookUp(next.settings);
    }
  };
  useEffect(() => void load(), []);

  const close = () => {
    if (dirty && !confirm("Има незаписани промени. Да се откажа ли от тях?")) return;
    onClose();
  };
  useShortcuts([{ matches: ESCAPE, run: close }]);

  if (!read || !draft) {
    return (
      <section class="settings" aria-label="Настройки">
        <p class="set-loading">{failure ?? "Зареждане…"}</p>
      </section>
    );
  }

  const edit = (next: Partial<SettingsForm>) => {
    setDraft({ ...draft, ...next });
    setSaved(false);
  };

  const addName = (list: "repos" | "team", name: string) => {
    const next = withItem(draft[list], name);
    if (next === draft[list]) return;
    edit({ [list]: next });
    const added = next.at(-1)!;
    if (read.token.set) {
      checkNames(list === "repos" ? { repos: [added], team: [] } : { repos: [], team: [added] })
        .then((found) => setChecks((current) => ({ repos: { ...current.repos, ...found.repos }, team: { ...current.team, ...found.team } })))
        .catch(() => {});
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveSettings(draft, read.hash);
      if (result.ok) {
        setRead({ ...read, settings: draft, hash: result.hash, invalid: null });
        setIssues([]);
        setSaved(true);
      } else if (result.reason === "conflict") {
        setConflict(true);
      } else {
        setIssues(result.issues);
      }
      setFailure(null);
    } catch (error) {
      setFailure(`Не се записа: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const onTokenSaved = (check: TokenCheck) => {
    setTokenCheck(check);
    if (!check.ok) return;
    setRead((current) => current && { ...current, token: { set: true, masked: null } });
    // The masked form comes from the server; read it again without touching the draft.
    loadSettings()
      .then((next) => setRead((current) => current && { ...current, token: next.token }))
      .catch(() => {});
    lookUp(draft);
  };

  const stray = strayIssues(issues, shownByField);
  const quiet = readQuiet(draft.notifications.quiet_hours);
  const setQuiet = (next: Partial<typeof quiet>) => edit({ notifications: { ...draft.notifications, quiet_hours: writeQuiet({ ...quiet, ...next }) } });

  return (
    <section class="settings" aria-label="Настройки">
      <header class="set-head">
        <h2>Настройки</h2>
        <button type="button" class="chip set-x" title="Затвори (Esc)" aria-label="Затвори" onClick={close}>
          ✕
        </button>
      </header>

      {conflict && (
        <p class="banner pending set-note" role="alert">
          <span>config.yaml е променен на диска, след като отвори Настройки. Не е презаписан.</span>
          <button type="button" class="chip" onClick={() => void load()}>
            Зареди наново
          </button>
        </p>
      )}
      {read.invalid && !conflict && (
        <p class="banner pending set-note">
          <span>Файлът на диска не е валиден, затова виждаш настройките в сила. „Запази“ ще го поправи. {read.invalid}</span>
        </p>
      )}
      {failure && <p class="banner bad set-note">{failure}</p>}
      {stray.length > 0 && (
        <p class="banner bad set-note">
          {stray.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}
        </p>
      )}

      <div class="set-grid">
        <Card title="GitHub" index={0}>
          <TokenField status={read.token} check={tokenCheck} onCheck={verifyToken} onSaved={onTokenSaved} />
          <Field label="Poll интервал" hint="Колко често пита GitHub в режим „На всеки“: 60s, 5m, 1h." issue={issueAt(issues, "github.poll_interval")}>
            <input class="set-input short" value={draft.github.poll_interval} onInput={(e) => edit({ github: { poll_interval: e.currentTarget.value } })} />
          </Field>
        </Card>

        <Card title="Repos" index={1}>
          <NameList
            items={draft.repos}
            path="repos"
            issues={issues}
            placeholder="owner/name"
            suggestions={suggestions.filter((repo) => !draft.repos.includes(repo))}
            warning={(repo) => {
              const check = checks.repos[repo];
              return check && !check.ok ? check.message : null;
            }}
            onAdd={(repo) => addName("repos", repo)}
            onRemove={(repo) => edit({ repos: draft.repos.filter((r) => r !== repo) })}
            empty="Още няма repo-та: таблото няма какво да следи."
          />
        </Card>

        <Card title="Екипът" index={2}>
          <NameList
            items={draft.team}
            path="team"
            issues={issues}
            placeholder="GitHub login"
            lead={(login) => {
              const check = checks.team[login];
              return check?.ok ? <img class="av" src={check.avatarUrl} alt="" loading="lazy" /> : <Avatar login={login} />;
            }}
            warning={(login) => {
              const check = checks.team[login];
              return check && !check.ok ? check.message : null;
            }}
            onAdd={(login) => addName("team", login)}
            onRemove={(login) => edit({ team: draft.team.filter((l) => l !== login) })}
            empty="Никой: секция „Екипът“ остава празна."
          />
        </Card>

        <Card title="Jira" index={3}>
          <Field label="Base URL" hint="Към него се добавя ключът на тикета." issue={issueAt(issues, "jira.base_url")}>
            <input
              class="set-input"
              type="url"
              placeholder="https://example.atlassian.net/browse/"
              value={draft.jira.base_url ?? ""}
              onInput={(e) => edit({ jira: { ...draft.jira, base_url: e.currentTarget.value.trim() || null } })}
            />
          </Field>
          <Field label="Project keys" hint="Празно: всеки ключ от вида ABC-123.">
            <NameList
              items={draft.jira.project_keys}
              path="jira.project_keys"
              issues={issues}
              placeholder="ABC"
              mono
              onAdd={(key) => edit({ jira: { ...draft.jira, project_keys: withItem(draft.jira.project_keys, key.toUpperCase()) } })}
              onRemove={(key) => edit({ jira: { ...draft.jira, project_keys: draft.jira.project_keys.filter((k) => k !== key) } })}
            />
          </Field>
        </Card>

        <Card title="Review" index={4}>
          <Field label="Нужни approvals" hint="Когато repo-то няма branch protection за review." issue={issueAt(issues, "review.required_approvals")}>
            <input
              class="set-input short"
              type="number"
              min={1}
              step={1}
              value={draft.review.required_approvals}
              onInput={(e) => edit({ review: { ...draft.review, required_approvals: e.currentTarget.valueAsNumber } })}
            />
          </Field>
          <Field label="Затворените се виждат" hint="Колко дълго остават merged и closed PR-ите: 24h, 90m." issue={issueAt(issues, "review.recently_closed_window")}>
            <input
              class="set-input short"
              value={draft.review.recently_closed_window}
              onInput={(e) => edit({ review: { ...draft.review, recently_closed_window: e.currentTarget.value } })}
            />
          </Field>
        </Card>

        <Card title="Нотификации" index={5}>
          <ul class="set-toggles">
            {EVENT_TYPES.map((type) => (
              <li key={type}>
                <label class="switch">
                  <input
                    type="checkbox"
                    checked={draft.notifications[type]}
                    onChange={(e) => edit({ notifications: { ...draft.notifications, [type]: e.currentTarget.checked } })}
                  />
                  <span class="track" aria-hidden="true" />
                  {eventLabel(type)}
                </label>
              </li>
            ))}
          </ul>
          <Field label="Тихи часове" hint={`Без нотификации; пропуснатото идва обобщено после. По часовата зона ${read.timeZone}.`} issue={issueAt(issues, "notifications.quiet_hours")}>
            <div class="set-quiet">
              <label class="switch">
                <input type="checkbox" checked={quiet.on} onChange={(e) => setQuiet({ on: e.currentTarget.checked })} />
                <span class="track" aria-hidden="true" />
                {quiet.on ? "от" : "изключени"}
              </label>
              {quiet.on && (
                <>
                  <input class="set-input time" type="time" value={quiet.from} aria-label="От" onInput={(e) => setQuiet({ from: e.currentTarget.value })} />
                  <span>до</span>
                  <input class="set-input time" type="time" value={quiet.to} aria-label="До" onInput={(e) => setQuiet({ to: e.currentTarget.value })} />
                </>
              )}
            </div>
          </Field>
        </Card>
      </div>

      <footer class={`set-actions${dirty ? " dirty" : ""}`}>
        <span class="set-state" aria-live="polite">
          {dirty ? "Незаписани промени" : saved ? "Запазено ✓ Влиза в сила веднага." : "Няма промени"}
        </span>
        <button type="button" class="chip" disabled={!dirty || saving} onClick={() => setDraft(read.settings)}>
          Отказ
        </button>
        <button type="button" class="chip primary" disabled={!dirty || saving || conflict} onClick={() => void save()}>
          {saving ? "Записване…" : "Запази"}
        </button>
      </footer>
    </section>
  );
}

function Card({ title, index, children }: { title: string; index: number; children: ComponentChildren }) {
  return (
    <section class="set-card" style={{ "--ci": index }}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, hint, issue, children }: { label: string; hint?: string; issue?: string | undefined; children: ComponentChildren }) {
  return (
    <div class={`set-field${issue ? " bad" : ""}`}>
      <span class="set-label">{label}</span>
      {children}
      {issue ? <span class="set-issue">{issue}</span> : hint && <span class="set-hint">{hint}</span>}
    </div>
  );
}

type NameListProps = {
  items: string[];
  /** The path of the list in config.yaml, for its issues: "repos", then "repos[1]" for an item. */
  path: string;
  issues: FieldIssue[];
  placeholder: string;
  suggestions?: string[];
  mono?: boolean;
  lead?: (item: string) => ComponentChildren;
  warning?: (item: string) => string | null;
  empty?: string;
  onAdd(item: string): void;
  onRemove(item: string): void;
};

/** A list of names with a ✕ on each and a field to add one; an item GitHub does not know gets a warning, not a block. */
function NameList({ items, path, issues, placeholder, suggestions = [], mono, lead, warning, empty, onAdd, onRemove }: NameListProps) {
  const [value, setValue] = useState("");
  const listId = `${path}-hints`;
  const add = () => {
    onAdd(value);
    setValue("");
  };
  const listIssue = issueAt(issues, path);
  return (
    <div class="names">
      {items.length === 0 && empty ? <p class="set-hint">{empty}</p> : null}
      <ul>
        {items.map((item, index) => {
          const issue = issueAt(issues, `${path}[${index}]`);
          const warn = issue ? null : (warning?.(item) ?? null);
          return (
            <li key={item} class={issue ? "bad" : warn ? "warn" : ""}>
              {lead?.(item)}
              <span class={mono ? "name mono" : "name"}>{item}</span>
              {(issue ?? warn) && <span class={issue ? "set-issue" : "set-warn"}>{issue ?? `⚠ ${warn}`}</span>}
              <button type="button" class="x" aria-label={`Махни ${item}`} title="Махни" onClick={() => onRemove(item)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <form
        class="names-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          class={mono ? "set-input mono" : "set-input"}
          value={value}
          placeholder={placeholder}
          list={suggestions.length ? listId : undefined}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        <button type="submit" class="chip" disabled={!value.trim()}>
          Добави
        </button>
      </form>
      {listIssue && <span class="set-issue">{listIssue}</span>}
    </div>
  );
}

type TokenFieldProps = {
  status: SettingsRead["token"];
  check: TokenCheck | "checking" | null;
  onCheck(): void;
  onSaved(check: TokenCheck): void;
};

/** The token: whether one is saved (only masked), what GitHub says about it, and a field to put a new one in. */
function TokenField({ status, check, onCheck, onSaved }: TokenFieldProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await saveToken(value.trim());
      if (result.check.ok) {
        setValue("");
        setRefused(null);
        onSaved(result.check);
      } else {
        setRefused(result.check.message);
      }
    } catch (error) {
      setRefused((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class={`set-field${refused ? " bad" : ""}`}>
      <span class="set-label">Токен</span>
      <div class="token-status">
        {status.set ? <code class="mono">{status.masked ?? "…"}</code> : <span class="token-none">Няма записан токен</span>}
        {status.set && (
          <button type="button" class="chip" disabled={check === "checking"} onClick={onCheck}>
            Провери
          </button>
        )}
      </div>
      {status.set && <TokenCheckView check={check} />}
      <form
        class="names-add"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          class="set-input mono"
          type="password"
          autocomplete="off"
          placeholder={status.set ? "Нов токен" : "ghp_… или github_pat_…"}
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <button type="submit" class="chip" disabled={!value.trim() || busy}>
          {busy ? "Проверка…" : status.set ? "Смени" : "Запази"}
        </button>
      </form>
      {refused ? (
        <span class="set-issue">{refused}</span>
      ) : (
        <span class="set-hint">Проверява се в GitHub преди запис. Пази се на сървъра и не се връща към браузъра.</span>
      )}
    </div>
  );
}

function TokenCheckView({ check }: { check: TokenCheck | "checking" | null }) {
  if (check === null) return null;
  if (check === "checking") return <p class="token-check">Проверка…</p>;
  if (!check.ok) return <p class="token-check bad">✗ {check.message}</p>;
  const { remaining, limit, resetAt } = check.rateLimit;
  return (
    <p class="token-check ok">
      ✓ {check.login} · {check.scopes === null ? "fine-grained токен" : `scopes: ${check.scopes.join(", ") || "няма"}`} · rate limit {remaining}/{limit}
      {resetAt ? `, нов в ${new Date(resetAt).toLocaleTimeString()}` : ""}
    </p>
  );
}
