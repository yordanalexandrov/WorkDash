import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyServerOptions, LogController } from "fastify";
import { z } from "zod";
import type { SnapshotStore } from "./db.js";
import { type ClassifyRules, groupIntoSections } from "./domain/classify.js";
import { withinWindow } from "./domain/closed.js";
import { type JiraConfig, jiraLinks } from "./domain/jira.js";
import { ISSUE_DEMANDS } from "./domain/issue-poll.js";
import { type IssueBoardState, type IssuesConfig, stageOf, stagesFor } from "./domain/issues.js";
import { classifyGitHubError } from "./domain/github-error.js";
import type { PollHealth } from "./domain/poll-error.js";
import type { IssueGraphs } from "./issue-graphs.js";
import type { IssuePoller } from "./issue-poller.js";
import { DEMANDS, POLL_MODES } from "./domain/poll-mode.js";
import type { Poller } from "./poller.js";
import type { Settings } from "./settings.js";
import type { Missing } from "./domain/settings.js";
import { createEventHub, type EventHub, type ServerEvent } from "./sse.js";
import { sameRepo } from "./domain/repos.js";

const NO_JIRA: JiraConfig = { baseUrl: null, projectKeys: [] };

const repoName = z.string().regex(/^[^/\s]+\/[^/\s]+$/);

const SeenRequest = z.object({
  repo: repoName,
  number: z.number().int().positive(),
  at: z.iso.datetime({ offset: true }).optional(),
});

const AckRequest = z.object({ ids: z.array(z.string()) });

const IssuesQuery = z.object({ repo: repoName });

const IssueGraphQuery = z.object({ repo: repoName, number: z.coerce.number().int().positive(), refresh: z.stringbool().optional() });

// The body names the demand `reason`, as the spec's API does.
const IssuePollRequest = z.object({ repo: repoName, reason: z.enum(ISSUE_DEMANDS) }).transform(({ repo, reason }) => ({ repo, demand: reason }));

const PollRequest = z.object({ demand: z.enum(DEMANDS) });

const PollModeRequest = z.object({ mode: z.enum(POLL_MODES) });

const SaveSettingsRequest = z.object({ settings: z.unknown(), hash: z.string() });

const TokenRequest = z.object({ token: z.string().trim().min(1) });

const CheckNamesRequest = z.object({ repos: z.array(z.string()).max(100), team: z.array(z.string()).max(100) });

const LabelsRequest = z.object({ repos: z.array(repoName).max(100) });

/** The names this machine answers to; a request under any other host name reached it by DNS rebinding. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostName(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
}

/** The part of the poller the dashboard drives: the poll mode and demands. */
type PollControl = Pick<Poller, "mode" | "polling" | "setMode" | "demand">;

/** For a dashboard without a poller: Periodic, never polling, deaf to demands. */
const NO_POLLER: PollControl = { mode: () => "periodic", polling: () => false, setMode: () => {}, demand: () => "skip" };

/** What the Issue dashboard is built from, besides the store. Read on every call, like DashboardSource. */
export type IssueSource = {
  /** The followed repos; only their issues are served and polled. */
  repos: () => string[];
  /** The stage labels in effect. */
  config: () => IssuesConfig;
  /** How far back closed issues still show (`recently_closed_window`). */
  recentlyClosedWindowMs: () => number;
  poller: Pick<IssuePoller, "demand" | "polling" | "error">;
  /** The Dependency graph's families, fetched apart from the poller. */
  graphs: IssueGraphs;
};

/** For a dashboard without issues: no repo followed, so every request for one is refused. */
const NO_ISSUES: IssueSource = {
  repos: () => [],
  config: () => ({ columns: [], repos: {} }),
  recentlyClosedWindowMs: () => 0,
  poller: { demand: () => ({ answer: "skip", dueAt: new Date(Date.now() + 3_600_000).toISOString() }), polling: () => false, error: () => null },
  graphs: { family: () => Promise.reject(new Error("no issues")) },
};

/**
 * What GET /api/issues returns and the `issues` event carries for `repo`: its saved issues, each in its stage, those closed
 * within the window as it is now, and how its poll goes.
 */
export function issueBoardState(store: SnapshotStore, source: IssueSource, repo: string, now = new Date()): IssueBoardState {
  const snapshot = store.loadIssues(repo);
  const stages = stagesFor(source.config(), repo);
  return {
    repo,
    fetchedAt: snapshot?.fetchedAt ?? null,
    stages,
    issues: (snapshot?.issues ?? []).map((issue) => ({ ...issue, stage: stageOf(issue, stages) })),
    totalCount: snapshot?.totalCount ?? 0,
    closed: withinWindow(snapshot?.closed ?? [], now, source.recentlyClosedWindowMs()),
    polling: source.poller.polling(repo),
    error: source.poller.error(repo),
  };
}

/** Whether `repo` is one of the followed repos, whatever the case of its name. */
function follows(source: IssueSource, repo: string): boolean {
  return source.repos().some((followed) => sameRepo(followed, repo));
}

/** Everything the dashboard is built from. Read on every call, so a reloaded config.yaml takes effect right away. */
export type DashboardSource = {
  store: SnapshotStore;
  rules: () => ClassifyRules;
  jira?: () => JiraConfig;
  pollIntervalMs: () => number;
  /** How long a merged or closed PR stays listed. */
  recentlyClosedWindowMs: () => number;
  pollHealth: () => PollHealth;
  /** The poll mode and demands; a dashboard without one is Periodic and ignores demands. */
  poller?: PollControl;
  /** Why the config.yaml on disk is not in effect; null when it is. */
  configError: () => string | null;
  /** What has to be set up before the dashboard can poll; nothing by default. */
  missing?: () => Missing[];
  now?: () => Date;
};

/** What GET /api/prs returns and the `dashboard` event carries. */
export function dashboardState({
  store,
  rules,
  jira = () => NO_JIRA,
  pollIntervalMs,
  recentlyClosedWindowMs,
  pollHealth,
  poller = NO_POLLER,
  configError,
  missing = () => [],
  now = () => new Date(),
}: DashboardSource) {
  const snapshot = store.loadSnapshot();
  const { error, problems } = pollHealth();
  return {
    viewer: snapshot?.viewer ?? null,
    fetchedAt: snapshot?.fetchedAt ?? null,
    pollIntervalMs: pollIntervalMs(),
    error,
    problems,
    configError: configError(),
    missing: missing(),
    pollMode: poller.mode(),
    /** Whether a poll is under way; every open page shows it. */
    polling: poller.polling(),
    sections: groupIntoSections(snapshot?.pullRequests ?? [], snapshot?.viewer ?? "", rules(), store.loadSeen()).map(({ section, pullRequests }) => ({
      section,
      pullRequests: pullRequests.map((pr) => ({ ...pr, jira: jiraLinks(pr, jira()) })),
    })),
    // Filtered here too, so an entry expires on time even while polling fails.
    recentlyClosed: withinWindow(store.loadRecentlyClosed(), now(), recentlyClosedWindowMs()),
    /** The followed repos whose issues are on in GitHub: the Issue dashboard's tabs. */
    issueRepos: store.loadIssueRepos(),
  };
}

export type DashboardState = ReturnType<typeof dashboardState>;

export function buildServer(
  options: DashboardSource & {
    /** The SSE channel behind GET /api/events; whoever polls broadcasts on it. */
    events?: EventHub;
    /** Notifications no browser has received yet; a connecting browser gets them after the dashboard. */
    pendingNotifications?: () => ServerEvent[];
    /** Takes the ids of the notifications a browser showed. */
    acknowledgeNotifications?: (ids: string[]) => void;
    /** Called once a PR is marked seen, after every open page has its new state. */
    onSeen?: () => void;
    /** The Settings screen's side; without it the dashboard has no /api/config or /api/token. */
    settings?: Settings;
    /** The zone quiet hours are read in, shown next to them. */
    timeZone?: string;
    /**
     * The directory the page is served from: its static files in `public/`, the bundle built from web/src in `dist/`.
     * Given by the caller, since where this module sits says nothing once it is bundled. Without it, only the API.
     */
    webRoot?: string;
    /** The Issue dashboard's side; without it no repo's issues are served. */
    issues?: IssueSource;
    logger?: FastifyServerOptions["logger"];
  },
): FastifyInstance {
  const { events = createEventHub(), pendingNotifications = () => [], acknowledgeNotifications = () => {}, logger = false } = options;
  const poller = options.poller ?? NO_POLLER;
  const server = Fastify({ logger, logController: new LogController({ disableRequestLogging: true }) });

  if (options.webRoot !== undefined) server.register(fastifyStatic, { root: ["public", "dist"].map((dir) => join(options.webRoot!, dir)) });

  // The API answers only this machine's own pages. A page on another site can still make the browser send requests
  // here: under its own host name after DNS rebinding (refused by the Host check), or as a form-like write with no
  // CORS preflight (refused by the Origin check and by taking JSON only, which a page elsewhere cannot send unasked).
  // A request with no Origin is not a browser's cross-site one (browsers send it on every POST and PUT), so it passes.
  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    const host = request.headers.host ?? "";
    if (!LOOPBACK.has(hostName(host))) return reply.code(403).send({ error: "unknown host" });
    if (request.method === "GET" || request.method === "HEAD") return;
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== `http://${host}` && origin !== `https://${host}`) return reply.code(403).send({ error: "cross-origin request" });
    if (!/^application\/json\s*(;|$)/i.test(request.headers["content-type"] ?? "")) return reply.code(403).send({ error: "expected application/json" });
  });

  server.get("/api/prs", async () => dashboardState(options));

  // "Видях": the page sends the fetchedAt of the snapshot it showed, so a comment that arrived
  // after that snapshot stays unread even though it was posted before the click. Every open page
  // gets the new state right away instead of after the next poll.
  server.post("/api/seen", async (request, reply) => {
    const parsed = SeenRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    const { repo, number, at } = parsed.data;
    const now = Date.now();
    options.store.markSeen(repo, number, new Date(at ? Math.min(Date.parse(at), now) : now));
    events.broadcast("dashboard", dashboardState(options));
    options.onSeen?.();
    return reply.code(204).send();
  });

  server.post("/api/notifications/ack", async (request, reply) => {
    const parsed = AckRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    acknowledgeNotifications(parsed.data.ids);
    return reply.code(204).send();
  });

  // A demand from a page: it coming back into view, or "Обнови". The poll's start and end reach every page over SSE.
  server.post("/api/poll", async (request, reply) => {
    const parsed = PollRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    return { answer: poller.demand(parsed.data.demand) };
  });

  server.put("/api/poll-mode", async (request, reply) => {
    const parsed = PollModeRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    poller.setMode(parsed.data.mode);
    events.broadcast("dashboard", dashboardState(options));
    return reply.code(204).send();
  });

  registerIssues(server, options.store, options.issues ?? NO_ISSUES);

  if (options.settings) registerSettings(server, options.settings, options.timeZone);

  server.get("/api/events", (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    events.connect(reply.raw, [{ type: "dashboard", data: dashboardState(options) }, ...pendingNotifications()]);
  });

  // An open event stream would keep server.close() waiting forever.
  server.addHook("preClose", async () => events.close());

  return server;
}

/**
 * The Issue dashboard's API: a repo's saved issues, and demands to poll them. A poll's start and end reach every page as
 * an `issues` event for the repo, sent by whoever runs the issue poller.
 */
function registerIssues(server: FastifyInstance, store: SnapshotStore, source: IssueSource): void {
  server.get("/api/issues", async (request, reply) => {
    const parsed = IssuesQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    if (!follows(source, parsed.data.repo)) return reply.code(404).send({ error: "not a followed repo" });
    return issueBoardState(store, source, parsed.data.repo);
  });

  server.post("/api/issues/poll", async (request, reply) => {
    const parsed = IssuePollRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    if (!follows(source, parsed.data.repo)) return reply.code(404).send({ error: "not a followed repo" });
    return source.poller.demand(parsed.data.repo, parsed.data.demand);
  });

  // An issue's Dependency graph, for its detail sheet. A failure is told to the page that asked and to nobody else: the
  // repo's poll health and the banner do not hear of it.
  server.get("/api/issues/graph", async (request, reply) => {
    const parsed = IssueGraphQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    const { repo, number, refresh } = parsed.data;
    if (!follows(source, repo)) return reply.code(404).send({ error: "not a followed repo" });
    try {
      return await source.graphs.family(repo, number, { refresh });
    } catch (error) {
      return reply.code(502).send({ error: classifyGitHubError(error, new Date()) });
    }
  });
}

/** The Settings screen's API. The token goes in, never out: only whether one is saved and its masked form. */
function registerSettings(server: FastifyInstance, settings: Settings, timeZone: string | undefined): void {
  server.get("/api/config", async () => ({ ...settings.read(), token: settings.token(), timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone }));

  server.put("/api/config", async (request, reply) => {
    const parsed = SaveSettingsRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    const result = settings.save(parsed.data.settings, parsed.data.hash);
    if (result.ok) return { hash: result.hash };
    if (result.reason === "conflict") return reply.code(409).send({ error: "config.yaml changed on disk since it was read" });
    return reply.code(422).send({ issues: result.issues });
  });

  server.get("/api/config/suggestions", async () => ({ repos: await settings.suggestions() }));

  server.post("/api/config/labels", async (request, reply) => {
    const parsed = LabelsRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    return settings.labels(parsed.data.repos);
  });

  server.post("/api/config/check", async (request, reply) => {
    const parsed = CheckNamesRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    return settings.checkNames(parsed.data);
  });

  server.put("/api/token", async (request, reply) => {
    const parsed = TokenRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: z.prettifyError(parsed.error) });
    const check = await settings.saveToken(parsed.data.token);
    if (!check.ok) return reply.code(422).send({ message: check.message });
    return { check, token: settings.token() };
  });

  server.post("/api/token/check", async () => settings.checkToken());
}
