import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Banners } from "./components/Banners.js";
import { DashboardToggle } from "./components/DashboardToggle.js";
import { ISSUE_DASHBOARD_KEPT, IssueDashboard } from "./components/IssueDashboard.js";
import { PollControls } from "./components/PollControls.js";
import { PrDashboard } from "./components/PrDashboard.js";
import { Settings } from "./components/Settings.js";
import { TopBar } from "./components/TopBar.js";
import { ViewToggle } from "./components/ViewToggle.js";
import type { DashboardState } from "./api.js";
import { type Dashboard, type DashboardPlace, issueTabs, pickRepo, readDashboard, settledPlace, writeDashboard } from "./dashboard.js";
import { NO_FILTER } from "./filter.js";
import { configErrorText, errorText, intervalText, issueErrorText, issueStatusText, missingText, needsNewToken, pollButton, statusText } from "./format.js";
import { dropFlyers, type Flyer, finishLanding, land, liftFlyers, useBooted } from "./motion.js";
import { repoHues } from "./palette.js";
import { useDashboard } from "./useDashboard.js";
import { useIssues } from "./useIssues.js";
import { useNotifications } from "./useNotifications.js";
import { usePolling } from "./usePolling.js";
import { useSettingsRoute } from "./useSettingsRoute.js";
import { F, I, R, SLASH, T, useShortcuts } from "./useShortcuts.js";
import { readView, type View, writeView } from "./view.js";

/**
 * The project colours of both dashboards: one hue per repo with PRs (open or recently closed) or an issue tab, by name order,
 * so a repo has the same colour on the PR and the Issue dashboard.
 */
function projectHues(state: DashboardState | null): Map<string, number> {
  if (!state) return new Map();
  const prRepos = [...state.sections.flatMap((s) => s.pullRequests.map((pr) => pr.repo)), ...state.recentlyClosed.map((pr) => pr.repo)];
  return repoHues([...prRepos, ...state.issueRepos]);
}

/**
 * The app shell: the top bar with the dashboard and view toggles, the banners, Settings, and the dashboard shown. Its keys
 * (`t`, `i`, `r`) come after the dashboard's own, which may take them (`useShortcuts`).
 */
export function App() {
  const { state, stream, seen } = useDashboard();
  const notifications = useNotifications();
  const polling = usePolling(state, stream);
  const booted = useBooted();
  const settings = useSettingsRoute();
  const [place, setPlace] = useState<DashboardPlace>(() => readDashboard(location.search));
  // The Issue dashboard's open repo, while it shows: only then are its issues loaded and polled.
  const onIssues = state !== null && !settings.open && place.dashboard === "issues";
  const tabs = useMemo(() => (state ? issueTabs(state.issueRepos) : []), [state?.issueRepos]);
  const issueRepo = onIssues ? pickRepo(tabs, place.repo) : null;
  const issues = useIssues(issueRepo, state?.pollMode === "periodic");
  // The status line, the error banner and "Обнови" (and `r`) are of the dashboard shown: the PRs, or the open repo's issues.
  const pollNowButton = pollButton(onIssues ? issues.state : state, polling.now);
  const pollNow = () => !pollNowButton.disabled && (onIssues ? issues.pollNow() : polling.pollNow());
  const [view, setView] = useState<View>(() => readView(location.search));
  // The Issue dashboard's filter lives here: the dashboard unmounts behind the PRs and Settings, and the filter outlasts that.
  const [issueFilter, setIssueFilter] = useState(NO_FILTER);
  // So do its table settings and the size of its detail sheet.
  const [issueKept, setIssueKept] = useState(ISSUE_DASHBOARD_KEPT);
  const hues = useMemo(() => projectHues(state), [state]);
  // Where each dashboard puts its part of the top bar (the toolbar, the repo tabs), under the toggles.
  const [topSlot, setTopSlot] = useState<HTMLDivElement | null>(null);
  const viewRoot = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  // The cards or rows lifted off the view being left, to land once the next one is in.
  const lifted = useRef<Flyer[] | null>(null);
  // A switch while the last one still flies ends it at once and lifts from the real cards or rows.
  const switchView = (next: View) => {
    if (next === view) return;
    finishLanding();
    if (lifted.current) dropFlyers(lifted.current);
    lifted.current = viewRoot.current && fx.current ? liftFlyers(viewRoot.current, fx.current) : null;
    history.replaceState(history.state, "", writeView(location.href, next));
    setView(next);
  };
  useLayoutEffect(() => {
    const flyers = lifted.current;
    lifted.current = null;
    if (flyers && viewRoot.current) void land(viewRoot.current, flyers);
  }, [view]);
  // The view stays as it is across a switch of dashboard; so does the repo open on the Issue dashboard, while the page is open.
  const goTo = (next: DashboardPlace) => {
    history.replaceState(history.state, "", writeDashboard(location.href, next));
    setPlace(next);
  };
  // The URL names the tab that opened, when it named none, one without a tab or one in another case; so a reload or a link
  // copied from the address bar opens the same tab.
  useEffect(() => {
    const settled = onIssues ? settledPlace(place, tabs) : null;
    if (settled) goTo(settled);
  }, [onIssues, tabs, place]);
  const switchDashboard = (dashboard: Dashboard) => {
    if (dashboard !== place.dashboard) goTo({ ...place, dashboard });
  };
  // While Settings is open, it takes Esc itself and the dashboards' keys do nothing.
  useShortcuts(
    settings.open
      ? [{ matches: (event) => SLASH(event) || T(event) || I(event) || R(event) || F(event), run: () => {} }]
      : [
          { matches: T, run: () => switchView(view === "board" ? "table" : "board") },
          { matches: I, run: () => switchDashboard(place.dashboard === "prs" ? "issues" : "prs") },
          { matches: R, run: pollNow },
        ],
  );

  return (
    <>
      <div class="bg" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <TopBar
        status={issueRepo ? issueStatusText(issues.state, polling.now) : statusText(state, polling.now)}
        stream={stream}
        notifications={notifications}
        toggle={
          settings.open ? null : (
            <>
              <DashboardToggle dashboard={place.dashboard} onChange={switchDashboard} />
              <ViewToggle view={view} onChange={switchView} />
            </>
          )
        }
        settings={{ open: settings.open, onToggle: () => (settings.open ? settings.hide() : settings.show()) }}
        pollControls={
          state && (
            <PollControls
              mode={state.pollMode}
              interval={intervalText(state.pollIntervalMs)}
              busy={onIssues ? (issues.state?.polling ?? false) : state.polling}
              pollNowButton={pollNowButton}
              onMode={polling.setMode}
              onPollNow={pollNow}
            />
          )
        }
      >
        <div class="top-slot" ref={setTopSlot} />
      </TopBar>
      <Banners
        error={onIssues ? issueErrorText(issues.state, state.pollMode, stream) : errorText(state, stream)}
        errorInSettings={needsNewToken(onIssues ? issues.state : state) && !settings.open}
        configError={settings.open ? null : configErrorText(state)}
        setup={settings.open ? null : missingText(state)}
        missed={notifications.missed}
        onDismissMissed={notifications.dismissMissed}
      />
      {settings.open && <Settings onClose={settings.hide} />}
      <div class="view" ref={viewRoot}>
        {state && (
          <PrDashboard
            state={state}
            seen={seen}
            shown={!settings.open && place.dashboard === "prs"}
            view={view}
            hues={hues}
            topSlot={topSlot}
            fx={fx}
            booted={booted}
          />
        )}
        {state && !settings.open && place.dashboard === "issues" && (
          <IssueDashboard
            issueRepos={state.issueRepos}
            fetched={state.fetchedAt !== null}
            issues={issues.state}
            hues={hues}
            repo={place.repo}
            onRepo={(repo) => goTo({ dashboard: "issues", repo })}
            filter={issueFilter}
            onFilter={setIssueFilter}
            viewer={state.viewer}
            kept={issueKept}
            onKept={setIssueKept}
            view={view}
            topSlot={topSlot}
            fx={fx}
            booted={booted}
          />
        )}
      </div>
      <div class="fx" ref={fx} aria-hidden="true" />
    </>
  );
}
