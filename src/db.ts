import Database from "better-sqlite3";
import type { PullRequest, Snapshot } from "./domain/types.js";

export type StoredSnapshot = Snapshot & { fetchedAt: string };

export type SnapshotStore = {
  saveSnapshot(snapshot: Snapshot, fetchedAt: Date): void;
  loadSnapshot(): StoredSnapshot | null;
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
  CREATE TABLE IF NOT EXISTS poll (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    viewer     TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
`;

/**
 * Bumped whenever the stored PullRequest shape changes. A snapshot in an older format is
 * dropped on open: it is only a cache, and the poller refetches it right away.
 */
const SNAPSHOT_FORMAT = 2;

/** Opens (and creates if needed) the SQLite file that holds the latest snapshot. */
export function openStore(path: string): SnapshotStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  if (db.pragma("user_version", { simple: true }) !== SNAPSHOT_FORMAT) {
    db.exec("DELETE FROM pr_snapshot; DELETE FROM poll;");
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
    close() {
      db.close();
    },
  };
}
