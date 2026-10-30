import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";
import { withinWindow } from "./domain/closed.js";
import { type JiraConfig, jiraLinks } from "./domain/jira.js";

const NO_JIRA: JiraConfig = { baseUrl: null, projectKeys: [] };

// Static files are kept in web/public; the bundle built from web/src lands in web/dist.
const WEB_ROOTS = ["../web/public/", "../web/dist/"].map((path) => fileURLToPath(new URL(path, import.meta.url)));

export function buildServer(options: {
  store: SnapshotStore;
  /** Read on every request, so a reloaded config.yaml takes effect right away. */
  rules: () => ClassifyRules;
  jira?: () => JiraConfig;
  pollIntervalMs: () => number;
  /** How long a merged or closed PR stays listed. */
  recentlyClosedWindowMs: () => number;
  lastPollError: () => string | null;
  /** Why the config.yaml on disk is not in effect; null when it is. */
  configError: () => string | null;
  logger?: boolean;
  now?: () => Date;
}): FastifyInstance {
  const {
    store,
    rules,
    jira = () => NO_JIRA,
    pollIntervalMs,
    recentlyClosedWindowMs,
    lastPollError,
    configError,
    logger = false,
    now = () => new Date(),
  } = options;
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
      sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules()).map(({ section, pullRequests }) => ({
        section,
        pullRequests: pullRequests.map((pr) => ({ ...pr, jira: jiraLinks(pr, jira()) })),
      })),
      // Filtered here too, so an entry expires on time even while polling fails.
      recentlyClosed: withinWindow(store.loadRecentlyClosed(), now(), recentlyClosedWindowMs()),
    };
  });

  return server;
}
