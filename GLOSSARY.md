# WorkDash

A local dashboard of the GitHub pull requests that concern me, ordered by what needs my attention, and of the issues of the repos I follow, by stage.

## Language

**Dashboard** (Табло):
One of the two halves of the app, switched at the top: the **PR dashboard** (PR-и) and the **Issue dashboard** (Issues). Each has a board and a table.
_Avoid_: Page, tab, mode

**Poll**:
One fetch from GitHub that replaces what a dashboard shows: the pull requests of every followed repo, or the issues of the one repo open on the Issue dashboard, and only while it is open.
_Avoid_: Refresh, sync, reload

**Poll mode**:
When polls happen, the same for every open dashboard: **Periodic** (на всеки интервал) or **On-demand** (при поискване: when I come back to the dashboard or press "Обнови").
_Avoid_: Refresh mode, auto-refresh

**Desktop app**:
The dashboard as an application of its own, with a window and a tray icon, beside the Docker one; both show the same dashboard.
_Avoid_: Electron app, native app, client

**Notification pause** (Пауза на нотификациите):
A switch in the desktop app's tray that holds notifications back until it is switched off; what happened meanwhile then comes as one missed summary, as after quiet hours.
_Avoid_: Mute, do not disturb, snooze

**Settings** (Настройки):
What I set up once for the dashboard and change from its Settings screen: the GitHub token, the poll interval, the repos, the team, Jira, review and notifications. The poll mode is not a setting: it is switched from the toolbar.
_Avoid_: Config, preferences, options

**Section**:
The group a pull request falls into by what it needs from me: Чака теб, Свободни за review, Готови за merge, Чакат други, Екипът, plus Затворени for recently closed ones.
_Avoid_: Status, lane, bucket

**Issue**:
A GitHub issue of a followed repo. Never a pull request, and never a Jira issue (that is a Jira ticket).
_Avoid_: Ticket, task

**Stage** (Етап):
The column an issue falls into by its labels: Без етап, then one per stage label configured for its repo, then Затворени for recently closed ones. An issue with several stage labels is in the last of them. Stages belong to issues; sections belong to pull requests.
_Avoid_: Status, section, lane

**Stage label**:
A GitHub label configured as a stage. The issue's other labels are just labels.

**Sub-issue**:
An issue that GitHub keeps under another issue, its **parent issue**; one level of that tree, not the whole of it.
_Avoid_: Subtask, child task, subticket

**Blocker** (Блокира):
An issue that has to be closed before another one can be done, as GitHub records it. An open issue with an open blocker is **blocked** (блокиран).
_Avoid_: Dependency, prerequisite, "depends on"

**Dependency graph** (Зависимости):
The picture in an issue's detail sheet of the sub-issues of one parent issue and the blockers between them, with the issue itself marked; for an issue with no parent and no sub-issues, the issue with its own blockers and the issues it blocks.
_Avoid_: Task graph, dependency tree, roadmap

**Linked PR**:
A pull request that will close an issue when it merges.
_Avoid_: Related PR, attached PR

**Board** (Дъска):
The view of a dashboard with one column per section (PR dashboard) or per stage (Issue dashboard).
_Avoid_: Kanban

**Table** (Таблица):
The view of a dashboard with one row per pull request or issue; the same ones as the board.
_Avoid_: List, grid

**Card**:
One pull request or issue on the board.
_Avoid_: Ticket (that word means a Jira ticket), tile

**Row**:
One pull request or issue in the table.

**Detail sheet**:
The panel with everything about one pull request or issue, opened from its card or row.
_Avoid_: Modal, drawer, details page

**Seen** (видях):
My mark that I have looked at a pull request as it is now; it takes the pull request out of Чака теб until something new happens.
_Avoid_: Read, acknowledged, dismissed

**Jira ticket**:
A Jira issue a pull request names in its title or branch, shown as a link.
