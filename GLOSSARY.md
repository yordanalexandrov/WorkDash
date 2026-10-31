# WorkDash

A local dashboard of the GitHub pull requests that concern me, ordered by what needs my attention.

## Language

**Poll**:
One fetch of the pull requests from GitHub that replaces what the dashboard shows.
_Avoid_: Refresh, sync, reload

**Poll mode**:
When polls happen, the same for every open dashboard: **Periodic** (на всеки интервал) or **On-demand** (при поискване: when I come back to the dashboard or press "Обнови").
_Avoid_: Refresh mode, auto-refresh

**Settings** (Настройки):
What I set up once for the dashboard and change from its Settings screen: the GitHub token, the poll interval, the repos, the team, Jira, review and notifications. The poll mode is not a setting: it is switched from the toolbar.
_Avoid_: Config, preferences, options

**Section**:
The group a pull request falls into by what it needs from me: Чака теб, Свободни за review, Готови за merge, Чакат други, Екипът, plus Затворени for recently closed ones.
_Avoid_: Status, lane, bucket

**Board** (Дъска):
The view of the dashboard with one column per section.
_Avoid_: Kanban

**Table** (Таблица):
The view of the dashboard with one row per pull request; the same pull requests as the board.
_Avoid_: List, grid

**Card**:
One pull request on the board.
_Avoid_: Ticket (that word means a Jira ticket), tile

**Row**:
One pull request in the table.

**Detail sheet**:
The panel with everything about one pull request, opened from its card or row.
_Avoid_: Modal, drawer, details page

**Seen** (видях):
My mark that I have looked at a pull request as it is now; it takes the pull request out of Чака теб until something new happens.
_Avoid_: Read, acknowledged, dismissed

**Jira ticket**:
A Jira issue a pull request names in its title or branch, shown as a link.
