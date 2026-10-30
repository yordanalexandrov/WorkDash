import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";
import { type JiraConfig, jiraLinks } from "./domain/jira.js";
import type { PollHealth } from "./domain/poll-error.js";
import { createEventHub, type EventHub } from "./sse.js";

const NO_JIRA: JiraConfig = { baseUrl: null, projectKeys: [] };

// Static files are kept in web/public; the bundle built from web/src lands in web/dist.
const WEB_ROOTS = ["../web/public/", "../web/dist/"].map((path) => fileURLToPath(new URL(path, import.meta.url)));

/** Everything the dashboard is built from. Read on every call, so a reloaded config.yaml takes effect right away. */
export type DashboardSource = {
  store: SnapshotStore;
  rules: () => ClassifyRules;
  jira?: () => JiraConfig;
  pollIntervalMs: () => number;
  pollHealth: () => PollHealth;
  /** Why the config.yaml on disk is not in effect; null when it is. */
  configError: () => string | null;
};

/** What GET /api/prs returns and the `dashboard` event carries. */
export function dashboardState({ store, rules, jira = () => NO_JIRA, pollIntervalMs, pollHealth, configError }: DashboardSource) {
  const snapshot = store.loadSnapshot();
  const { error, problems } = pollHealth();
  return {
    viewer: snapshot?.viewer ?? null,
    fetchedAt: snapshot?.fetchedAt ?? null,
    pollIntervalMs: pollIntervalMs(),
    error,
    problems,
    configError: configError(),
    sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules()).map(({ section, pullRequests }) => ({
      section,
      pullRequests: pullRequests.map((pr) => ({ ...pr, jira: jiraLinks(pr, jira()) })),
    })),
  };
}

export function buildServer(
  options: DashboardSource & {
    /** The SSE channel behind GET /api/events; whoever polls broadcasts on it. */
    events?: EventHub;
    logger?: boolean;
  },
): FastifyInstance {
  const { events = createEventHub(), logger = false } = options;
  const server = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }) });

  server.register(fastifyStatic, { root: WEB_ROOTS });

  server.get("/api/prs", async () => dashboardState(options));

  server.get("/api/events", (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    events.connect(reply.raw, [{ type: "dashboard", data: dashboardState(options) }]);
  });

  // An open event stream would keep server.close() waiting forever.
  server.addHook("preClose", async () => events.close());

  return server;
}
