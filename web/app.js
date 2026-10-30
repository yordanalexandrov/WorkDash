const FALLBACK_REFRESH_MS = 60_000;
const MAX_REFRESH_MS = 10_000;

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const rowsEl = document.getElementById("prs");
const emptyEl = document.getElementById("empty");

function cell(content, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.append(content);
  return td;
}

function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

function render(state) {
  const prs = [...state.pullRequests].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  rowsEl.replaceChildren(
    ...prs.map((pr) => {
      const tr = document.createElement("tr");
      tr.append(
        cell(pr.repo),
        cell(link(pr.url, `#${pr.number}`), "number"),
        cell(link(pr.url, pr.title)),
        cell(pr.author),
      );
      return tr;
    }),
  );
  emptyEl.hidden = prs.length > 0 || state.fetchedAt === null;

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
