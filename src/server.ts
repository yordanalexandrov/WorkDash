import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, LogController } from "fastify";
import { z } from "zod";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";
import { type JiraConfig, jiraLinks } from "./domain/jira.js";

const NO_JIRA: JiraConfig = { baseUrl: null, projectKeys: [] };

const SeenRequest = z.object({
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  number: z.number().int().positive(),
  at: z.iso.datetime({ offset: true }).optional(),
});

// Static files are kept in web/public; the bundle built from web/src lands in web/dist.
const WEB_ROOTS = ["../web/public/", "../web/dist/"].map((path) => fileURLToPath(new URL(path, import.meta.url)));

export function buildServer(options: {
  store: SnapshotStore;
  /** Read on every request, so a reloaded config.yaml takes effect right away. */
  rules: () => ClassifyRules;
  jira?: () => JiraConfig;
  pollIntervalMs: () => number;
  lastPollError: () => string | null;
  /** Why the config.yaml on disk is not in effect; null when it is. */
  configError: () => string | null;
  logger?: boolean;
}): FastifyInstance {
  const { store, rules, jira = () => NO_JIRA, pollIntervalMs, lastPollError, configError, logger = false } = options;
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
      sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules(), store.loadSeen()).map(({ section, pullRequests }) => ({
        section,
        pullRequests: pullRequests.map((pr) => ({ ...pr, jira: jiraLinks(pr, jira()) })),
      })),
    };
  });

  // "Видях": the page sends the fetchedAt of the snapshot it showed, so a comment that arrived
  // after that snapshot stays unread even though it was posted before the click.
  server.post("/api/seen", async (request, reply) => {
    const parsed = SeenRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    const { repo, number, at } = parsed.data;
    const now = Date.now();
    store.markSeen(repo, number, new Date(at ? Math.min(Date.parse(at), now) : now));
    return reply.code(204).send();
  });

  return server;
}
