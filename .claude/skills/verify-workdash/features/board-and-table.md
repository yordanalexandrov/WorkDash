# Board and table

With a token and at least one repo, the dashboard shows the open PRs. The board („▦ Дъска“) has one column per section, in workflow order: Чака теб → Свободни за review → Готови за merge → Чакат други → Екипът → Затворени. An empty column folds to a strip with its count. The table („☰ Таблица“) shows the same PRs as rows, with sortable columns and „Групирай по“. `t` switches views, and the choice is kept in the URL (`view=table`). This is the default dashboard: `/` with no `dashboard` param, or „PR-и“ in the „Табло“ toggle.

## Sub-features

- `board-sections` shows each PR as a card in its section's column. Empty columns fold, and the head counts count up.
- `card-anatomy` covers the repo tag, `#n` (link to GitHub), the age, the title, the CI/Sonar rings, the merge state, the reviewer avatars and the draft stripes.
- `view-switch` moves between board and table with the toggle or `t`, keeping `view=table` in the URL across a reload.
- `table-sort` sorts on a column header click, with ▲/▼ and `aria-sort`.
- `table-group` groups by „нищо / секция / repo / автор“ with collapsible group rows.
- `snapshot-persist` shows the last snapshot right after a restart, before a new poll.

## How to get to it (user POV)

- The page itself, once a token and repos are saved. „PR-и“ in the „Табло“ toggle, or `i`, comes back from the Issue dashboard.
- The `Изглед` toggle in the top bar (the second segmented control), or `t`. Both toggles hide while Settings is open.

## Driving it with wd-verify

Preconditions:

- **Needs token** (see [token.md](./token.md)), saved, with `yordanalexandrov/WorkDash` in Repos. As of writing, that repo has open PRs from the user and from dependabot.
- After the save, wait for the first poll: `$W browser wait --css ".card" --timeout 30000`. `$W doctor` then shows `openPRs` > 0.

- **Board.** Run `$W browser goto / --wait-text "WorkDash"`, `$W browser wait --css "[data-flip^='pr:'] .card"`, then `aria` and `screenshot`. The columns show, and every open PR of the repo appears once. Compare the numbers with `$W api /api/prs`.
- **Switch to table.** Run `$W browser press t` and `$W browser wait --css "[role=table]"`. `$W browser url` contains `view=table`.
- **Persist the view.** Run `$W browser goto "/?view=table"` (or reload the URL from the last step). The table is still shown.
- **Sort.** Click a header, e.g. `$W browser click --css "[role=columnheader].sortable" --nth 1`. Its `aria-sort` changes in `aria`, and the row order changes.
- **Group.** Run `$W browser click --role radio --name "repo" --within ".tbar"`. A group row per repo appears.
- **Across the dashboard switch.** Run `$W browser press i`, then `$W browser click --role radio --name "PR-и" --exact`. `url` keeps `view=table`, and the PR table comes back with its grouping and sort.
- **Back to board.** Run `$W browser click --role radio --name "Дъска"`.
- **Proof.** Save aria trees and screenshots of the board, the table, the sorted table and the grouped table under `$($W evidence)/board/`, plus the `/api/prs` section counts.

## Gotchas

- The first poll after saving the token starts at once but takes seconds. Wait for `[data-flip^='pr:']`, not for text.
- `.card`, `[role=table]`, `.tbar` and „Групирай по“ also exist on the Issue dashboard. Start from `goto /` (no `dashboard=issues`), and assert PRs with `[data-flip^='pr:']`.
- Cards animate in (a cascade plus count-up). Take screenshots after a `wait` and the default settle, or pass `--settle 1000`.
- The title and `#n` on a card are links to GitHub and open a new tab in the headless browser. To open the sheet, click the card's `.age` (see [filter-and-detail.md](./filter-and-detail.md)).
- Which section a PR lands in depends on who the token belongs to (`viewer`) and on `team`. Assert the counts against `/api/prs`, not fixed numbers.
