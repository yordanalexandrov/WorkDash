import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";

const WEB_ROOT = fileURLToPath(new URL("../web/", import.meta.url));

export function buildServer(options: {
  store: SnapshotStore;
  rules: ClassifyRules;
  pollIntervalMs: number;
  lastPollError: () => string | null;
  logger?: boolean;
}): FastifyInstance {
  const { store, rules, pollIntervalMs, lastPollError, logger = false } = options;
  const server = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }) });

  server.register(fastifyStatic, { root: WEB_ROOT });

  server.get("/api/prs", async () => {
    const snapshot = store.loadSnapshot();
    return {
      viewer: snapshot?.viewer ?? null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      pollIntervalMs,
      error: lastPollError(),
      sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules),
    };
  });

  return server;
}
