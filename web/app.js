const FALLBACK_REFRESH_MS = 60_000;
const MAX_REFRESH_MS = 10_000;

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const reposEl = document.getElementById("repos");
const emptyEl = document.getElementById("empty");

const SECTION_TITLES = {
  waiting_on_me: "Чака теб",
  free_for_review: "Свободни за review",
  ready_to_merge: "Готови за merge",
  waiting_on_others: "Чакат други",
  team: "Екипът",
};

const REASON_LABELS = {
  ci_failed: "CI failed",
  changes_requested: "changes requested",
  conflict: "conflict",
  needs_rebase: "needs rebase",
  review_requested: "review requested",
};

const CI_LABELS = {
  SUCCESS: ["CI ✓", "ok"],
  FAILURE: ["CI ✗", "bad"],
  ERROR: ["CI ✗", "bad"],
  PENDING: ["CI …", "pending"],
  EXPECTED: ["CI …", "pending"],
};

// What the merge box would say: conflict, out of date, blocked by rules, or free to merge.
const MERGE_STATES = {
  DIRTY: ["conflict", "bad", "Има конфликт с base клона"],
  BEHIND: ["needs rebase", "pending", "Клонът е изостанал от base и трябва rebase преди merge"],
  BLOCKED: ["blocked", "muted", "Merge е блокиран от правилата на repo-то (review-та или задължителни проверки)"],
  CLEAN: ["mergeable", "ok", "Може да се merge-не"],
  HAS_HOOKS: ["mergeable", "ok", "Може да се merge-не"],
  UNSTABLE: ["mergeable", "ok", "Може да се merge-не, но незадължителни проверки не минават"],
};

const REVIEW_MARKS = { APPROVED: ["✓", "ok"], CHANGES_REQUESTED: ["✗", "bad"], COMMENTED: ["💬", "muted"] };

function element(tag, className, ...content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.append(...content);
  return el;
}

function badge(text, kind, title) {
  const el = element("span", `badge ${kind}`, text);
  if (title) el.title = title;
  return el;
}

function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

function age(since) {
  const hours = Math.floor((Date.now() - new Date(since).getTime()) / 3_600_000);
  if (hours < 1) return "<1ч";
  if (hours < 24) return `${hours}ч`;
  return `${Math.floor(hours / 24)}д`;
}

function statusBadges(pr) {
  const badges = [];
  if (pr.reason) badges.push(badge(REASON_LABELS[pr.reason] ?? pr.reason, "bad"));
  if (pr.isDraft) badges.push(badge("draft", "muted"));
  // GitHub may still be computing DIRTY while `mergeable` already says CONFLICTING.
  const state = pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.mergeStateStatus;
  const merge = MERGE_STATES[state];
  const saidByReason = (pr.reason === "conflict" && state === "DIRTY") || (pr.reason === "needs_rebase" && state === "BEHIND");
  if (merge && !saidByReason) badges.push(badge(...merge));
  return badges;
}

function ciBadge(ci) {
  if (!ci) return badge("без CI", "muted");
  const [text, kind] = CI_LABELS[ci] ?? [ci, "muted"];
  return badge(text, kind);
}

function reviewBadges(pr) {
  return pr.reviews
    .filter((review) => REVIEW_MARKS[review.state])
    .map((review) => {
      const [mark, kind] = REVIEW_MARKS[review.state];
      return badge(`${mark} ${review.author}`, kind);
    });
}

function prItem(pr) {
  const ageEl = element("span", "age", age(pr.createdAt));
  ageEl.title = `отворен ${new Date(pr.createdAt).toLocaleString()}`;
  return element(
    "li",
    "pr",
    element("div", "pr-title", element("span", "number", link(pr.url, `#${pr.number}`)), " ", link(pr.url, pr.title)),
    element(
      "div",
      "pr-meta",
      element("span", "author", pr.author),
      ...statusBadges(pr),
      ciBadge(pr.ci),
      ...reviewBadges(pr),
      ageEl,
    ),
  );
}

/**
 * Regroups the API's sections into one card per repo. Cards are ordered by the most urgent
 * section they hold, so a repo with something waiting on me comes first.
 */
function groupByRepo(sections) {
  const cards = new Map();
  sections.forEach(({ section, pullRequests }, urgency) => {
    for (const pr of pullRequests) {
      if (!cards.has(pr.repo)) cards.set(pr.repo, { repo: pr.repo, urgency, sections: new Map() });
      const card = cards.get(pr.repo);
      if (!card.sections.has(section)) card.sections.set(section, []);
      card.sections.get(section).push(pr);
    }
  });
  return [...cards.values()].sort((a, b) => a.urgency - b.urgency || a.repo.localeCompare(b.repo));
}

function repoCard({ repo, sections }) {
  const groups = [...sections].map(([section, pullRequests]) =>
    element(
      "section",
      `group ${section}`,
      element("h3", "", `${SECTION_TITLES[section] ?? section} (${pullRequests.length})`),
      element("ul", "", ...pullRequests.map(prItem)),
    ),
  );
  return element("article", "card", element("h2", "", repo), ...groups);
}

function render(state) {
  const cards = groupByRepo(state.sections);
  reposEl.replaceChildren(...cards.map(repoCard));
  emptyEl.hidden = cards.length > 0 || state.fetchedAt === null;

  statusEl.textContent = state.fetchedAt
    ? `${state.viewer} · обновено ${new Date(state.fetchedAt).toLocaleTimeString()}`
    : "Чака първия poll…";

  errorEl.hidden = !state.error;
  errorEl.textContent = state.error ? `Последният poll е неуспешен: ${state.error}` : "";
}

async function refresh() {
  let delay = FALLBACK_REFRESH_MS;
  try {
    const response = await fetch("/api/prs");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    render(state);
    // Reading the local API is cheap, so check more often than the server polls GitHub.
    if (state.pollIntervalMs > 0) delay = Math.min(state.pollIntervalMs, MAX_REFRESH_MS);
  } catch (error) {
    errorEl.hidden = false;
    errorEl.textContent = `Няма връзка със сървъра: ${error.message}`;
  }
  setTimeout(refresh, delay);
}

refresh();
