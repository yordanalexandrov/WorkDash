import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";
import { withinWindow } from "./domain/closed.js";

// Static files are kept in web/public; the bundle built from web/src lands in web/dist.
const WEB_ROOTS = ["../web/public/", "../web/dist/"].map((path) => fileURLToPath(new URL(path, import.meta.url)));

export function buildServer(options: {
  store: SnapshotStore;
  rules: ClassifyRules;
  pollIntervalMs: number;
  /** How long a merged or closed PR stays listed. */
  recentlyClosedWindowMs: number;
  lastPollError: () => string | null;
  logger?: boolean;
  now?: () => Date;
}): FastifyInstance {
  const { store, rules, pollIntervalMs, recentlyClosedWindowMs, lastPollError, logger = false, now = () => new Date() } = options;
  const server = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }) });

  server.register(fastifyStatic, { root: WEB_ROOTS });

  server.get("/api/prs", async () => {
    const snapshot = store.loadSnapshot();
    return {
      viewer: snapshot?.viewer ?? null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      pollIntervalMs,
      error: lastPollError(),
      sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules),
      // Filtered here too, so an entry expires on time even while polling fails.
      recentlyClosed: withinWindow(store.loadRecentlyClosed(), now(), recentlyClosedWindowMs),
    };
  });

  return server;
}
