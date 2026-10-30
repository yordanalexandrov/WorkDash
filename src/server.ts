import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";
import type { PollHealth } from "./domain/poll-error.js";
import { createEventHub, type EventHub } from "./sse.js";

// Static files are kept in web/public; the bundle built from web/src lands in web/dist.
const WEB_ROOTS = ["../web/public/", "../web/dist/"].map((path) => fileURLToPath(new URL(path, import.meta.url)));

export type DashboardSource = {
  store: SnapshotStore;
  rules: ClassifyRules;
  pollIntervalMs: number;
  pollHealth: () => PollHealth;
};

/** What GET /api/prs returns and the `dashboard` event carries. */
export function dashboardState({ store, rules, pollIntervalMs, pollHealth }: DashboardSource) {
  const snapshot = store.loadSnapshot();
  const { error, problems } = pollHealth();
  return {
    viewer: snapshot?.viewer ?? null,
    fetchedAt: snapshot?.fetchedAt ?? null,
    pollIntervalMs,
    error,
    problems,
    sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules),
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
