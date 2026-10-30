import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";

// Static files are kept in web/public; the bundle built from web/src lands in web/dist.
const WEB_ROOTS = ["../web/public/", "../web/dist/"].map((path) => fileURLToPath(new URL(path, import.meta.url)));

export function buildServer(options: {
  store: SnapshotStore;
  /** Read on every request, so a reloaded config.yaml takes effect right away. */
  rules: () => ClassifyRules;
  pollIntervalMs: () => number;
  lastPollError: () => string | null;
  /** Why the config.yaml on disk is not in effect; null when it is. */
  configError: () => string | null;
  logger?: boolean;
}): FastifyInstance {
  const { store, rules, pollIntervalMs, lastPollError, configError, logger = false } = options;
  const server = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }) });

  server.register(fastifyStatic, { root: WEB_ROOTS });

  server.get("/api/prs", async () => {
    const snapshot = store.loadSnapshot();
    return {
      viewer: snapshot?.viewer ?? null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      pollIntervalMs: pollIntervalMs(),
      error: lastPollError(),
      configError: configError(),
      sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules()),
    };
  });

  return server;
}
