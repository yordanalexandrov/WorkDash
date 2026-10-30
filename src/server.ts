import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";
import { type JiraConfig, jiraLinks } from "./domain/jira.js";

const NO_JIRA: JiraConfig = { baseUrl: null, projectKeys: [] };

// Static files are kept in web/public; the bundle built from web/src lands in web/dist.
const WEB_ROOTS = ["../web/public/", "../web/dist/"].map((path) => fileURLToPath(new URL(path, import.meta.url)));

export function buildServer(options: {
  store: SnapshotStore;
  rules: ClassifyRules;
  jira?: JiraConfig;
  pollIntervalMs: number;
  lastPollError: () => string | null;
  logger?: boolean;
}): FastifyInstance {
  const { store, rules, jira = NO_JIRA, pollIntervalMs, lastPollError, logger = false } = options;
  const server = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }) });

  server.register(fastifyStatic, { root: WEB_ROOTS });

  server.get("/api/prs", async () => {
    const snapshot = store.loadSnapshot();
    return {
      viewer: snapshot?.viewer ?? null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      pollIntervalMs,
      error: lastPollError(),
      sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules).map(({ section, pullRequests }) => ({
        section,
        pullRequests: pullRequests.map((pr) => ({ ...pr, jira: jiraLinks(pr, jira) })),
      })),
    };
  });

  return server;
}
