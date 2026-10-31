import Database from "better-sqlite3";
import type { SeenAt } from "./domain/classify.js";
import type { PrEvent } from "./domain/events.js";
import { POLL_MODES, type PollMode } from "./domain/poll-mode.js";
import type { ClosedPullRequest, PullRequest, Snapshot } from "./domain/types.js";

export type StoredSnapshot = Snapshot & { fetchedAt: string };

export type SnapshotStore = {
  saveSnapshot(snapshot: Snapshot, fetchedAt: Date): void;
  loadSnapshot(): StoredSnapshot | null;
  /** Replaces the list of recently merged or closed PRs, which is kept apart from the open ones. */
  saveRecentlyClosed(pullRequests: ClosedPullRequest[]): void;
  loadRecentlyClosed(): ClosedPullRequest[];
  /** Records that I have seen a PR as it was at `seenAt`; a later mark wins over an earlier one. */
  markSeen(repo: string, number: number, seenAt: Date): void;
  /** Marks PRs without a seen mark as seen at `at`, when first observed, so only later comments are unread. */
  markFirstSeen(pullRequests: { repo: string; number: number }[], at: Date): void;
  /** When each PR was last marked seen, as of this call. */
  loadSeen(): SeenAt;
  /** Saves the events; returns those it had not saved before, in the given order. */
  recordEvents(events: PrEvent[], at: Date): PrEvent[];
  /** The events no browser has shown yet, oldest first. */
  undeliveredEvents(): PrEvent[];
  markDelivered(ids: string[]): void;
  /** The poll mode last chosen; periodic until one is. */
  loadPollMode(): PollMode;
  savePollMode(mode: PollMode): void;
  close(): void;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS pr_snapshot (
    repo       TEXT    NOT NULL,
    number     INTEGER NOT NULL,
    data_json  TEXT    NOT NULL,
    fetched_at TEXT    NOT NULL,
    PRIMARY KEY (repo, number)
  );
  CREATE TABLE IF NOT EXISTS pr_closed (
    repo      TEXT    NOT NULL,
    number    INTEGER NOT NULL,
    data_json TEXT    NOT NULL,
    PRIMARY KEY (repo, number)
  );
  CREATE TABLE IF NOT EXISTS poll (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    viewer     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  -- Not a cache: kept when the snapshot format changes.
  CREATE TABLE IF NOT EXISTS pr_seen (
    repo    TEXT    NOT NULL,
    number  INTEGER NOT NULL,
    seen_at TEXT    NOT NULL,
    PRIMARY KEY (repo, number)
  );
  -- Not a cache either: an event id kept here is never notified again.
  CREATE TABLE IF NOT EXISTS event (
    id           TEXT    PRIMARY KEY,
    type         TEXT    NOT NULL,
    repo         TEXT    NOT NULL,
    number       INTEGER NOT NULL,
    created_at   TEXT    NOT NULL,
    payload_json TEXT    NOT NULL,
    delivered    INTEGER NOT NULL DEFAULT 0
  );
  -- Choices made on the dashboard, such as the poll mode; not a cache.
  CREATE TABLE IF NOT EXISTS setting (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * Bumped whenever the stored PullRequest shape changes. A snapshot in an older format is
 * dropped on open: it is only a cache, and the poller refetches it right away.
 */
const SNAPSHOT_FORMAT = 7;

/** Opens (and creates if needed) the SQLite file that holds the latest snapshot. */
export function openStore(path: string): SnapshotStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  if (db.pragma("user_version", { simple: true }) !== SNAPSHOT_FORMAT) {
    db.exec("DELETE FROM pr_snapshot; DELETE FROM pr_closed; DELETE FROM poll;");
    db.pragma(`user_version = ${SNAPSHOT_FORMAT}`);
  }

  const deletePullRequests = db.prepare("DELETE FROM pr_snapshot");
  const insertPullRequest = db.prepare(
    "INSERT INTO pr_snapshot (repo, number, data_json, fetched_at) VALUES (?, ?, ?, ?)",
  );
  const upsertPoll = db.prepare(
    "INSERT INTO poll (id, viewer, fetched_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET viewer = excluded.viewer, fetched_at = excluded.fetched_at",
  );
  const selectPoll = db.prepare<[], { viewer: string; fetched_at: string }>("SELECT viewer, fetched_at FROM poll WHERE id = 1");
  const selectPullRequests = db.prepare<[], { data_json: string }>("SELECT data_json FROM pr_snapshot ORDER BY rowid");

  const deleteClosed = db.prepare("DELETE FROM pr_closed");
  const insertClosed = db.prepare("INSERT INTO pr_closed (repo, number, data_json) VALUES (?, ?, ?)");
  const selectClosed = db.prepare<[], { data_json: string }>("SELECT data_json FROM pr_closed ORDER BY rowid");
  const saveClosed = db.transaction((pullRequests: ClosedPullRequest[]) => {
    deleteClosed.run();
    for (const pr of pullRequests) insertClosed.run(pr.repo, pr.number, JSON.stringify(pr));
  });
  // Both sides come from Date.toISOString, so comparing the strings compares the instants.
  const upsertSeen = db.prepare(
    "INSERT INTO pr_seen (repo, number, seen_at) VALUES (?, ?, ?) ON CONFLICT (repo, number) DO UPDATE SET seen_at = MAX(seen_at, excluded.seen_at)",
  );
  const insertFirstSeen = db.prepare("INSERT INTO pr_seen (repo, number, seen_at) VALUES (?, ?, ?) ON CONFLICT (repo, number) DO NOTHING");
  const firstSeen = db.transaction((pullRequests: { repo: string; number: number }[], at: string) => {
    for (const pr of pullRequests) insertFirstSeen.run(pr.repo, pr.number, at);
  });
  const selectSeen = db.prepare<[], { repo: string; number: number; seen_at: string }>("SELECT repo, number, seen_at FROM pr_seen");

  const insertEvent = db.prepare(
    "INSERT OR IGNORE INTO event (id, type, repo, number, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const selectUndelivered = db.prepare<[], { payload_json: string }>("SELECT payload_json FROM event WHERE delivered = 0 ORDER BY rowid");
  const updateDelivered = db.prepare("UPDATE event SET delivered = 1 WHERE id = ?");
  const record = db.transaction((events: PrEvent[], at: string) =>
    events.filter((event) => insertEvent.run(event.id, event.type, event.repo, event.number, at, JSON.stringify(event)).changes > 0),
  );
  const deliver = db.transaction((ids: string[]) => ids.forEach((id) => updateDelivered.run(id)));

  const selectSetting = db.prepare<[string], { value: string }>("SELECT value FROM setting WHERE key = ?");
  const upsertSetting = db.prepare("INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");

  const save = db.transaction((snapshot: Snapshot, fetchedAt: string) => {
    deletePullRequests.run();
    for (const pr of snapshot.pullRequests) {
      insertPullRequest.run(pr.repo, pr.number, JSON.stringify(pr), fetchedAt);
    }
    upsertPoll.run(snapshot.viewer, fetchedAt);
  });

  return {
    saveSnapshot(snapshot, fetchedAt) {
      save(snapshot, fetchedAt.toISOString());
    },
    loadSnapshot() {
      const poll = selectPoll.get();
      if (!poll) return null;
      const pullRequests = selectPullRequests.all().map((row) => JSON.parse(row.data_json) as PullRequest);
      return { viewer: poll.viewer, pullRequests, fetchedAt: poll.fetched_at };
    },
    saveRecentlyClosed(pullRequests) {
      saveClosed(pullRequests);
    },
    loadRecentlyClosed() {
      return selectClosed.all().map((row) => JSON.parse(row.data_json) as ClosedPullRequest);
    },
    markSeen(repo, number, seenAt) {
      upsertSeen.run(repo, number, seenAt.toISOString());
    },
    markFirstSeen(pullRequests, at) {
      firstSeen(pullRequests, at.toISOString());
    },
    loadSeen() {
      const seen = new Map(selectSeen.all().map((row) => [`${row.repo}#${row.number}`, row.seen_at]));
      return (pr) => seen.get(`${pr.repo}#${pr.number}`) ?? null;
    },
    recordEvents(events, at) {
      return record(events, at.toISOString());
    },
    undeliveredEvents() {
      return selectUndelivered.all().map((row) => JSON.parse(row.payload_json) as PrEvent);
    },
    markDelivered(ids) {
      deliver(ids);
    },
    loadPollMode() {
      const value = selectSetting.get("poll_mode")?.value;
      return POLL_MODES.find((mode) => mode === value) ?? "periodic";
    },
    savePollMode(mode) {
      upsertSetting.run("poll_mode", mode);
    },
    close() {
      db.close();
    },
  };
}
