# Issue dashboard

The second dashboard, next to the PRs. A user switches to it with „Issues“ in the „Табло“ toggle or with `i`. It shows the issues of one followed repo at a time, with one tab per repo whose GitHub issues are on. The board has „Без етап“, one column per configured stage label, then „Затворени“. The table shows the same issues. Its toolbar has a filter and „само моите“ (no repo chips), and a detail sheet opens from a card or row. The stage labels are set on the „Issues“ card in Settings.

## Sub-features

- `issues-switch`: the „Табло“ radiogroup („PR-и“ / „Issues“) and `i` put `?dashboard=issues` in the query (not the hash). `view` is kept across the switch, and „PR-и“ removes `dashboard` and `repo`.
- `issues-tabs`: the tablist „Repo“, one `role=tab` per repo with issues on. The URL gains `&repo=owner/name` for the open tab. A tab shows „100 от N“ when the repo has more than 100 open issues.
- `issues-stages`: the columns `col:none` („Без етап“), `col:stage:<label>` in Settings order, and `col:closed` („Затворени“). An issue with several stage labels lands in the last configured one.
- `issues-table`: the headers „# заглавие етап етикети assignees автор 💬 milestone PR-и възр. обнов.“, sorting, and „Групирай по: нищо / етап / assignee / milestone“.
- `issues-filter`: „Филтър: #, заглавие, етикет, assignee, milestone…“ (with `/` and Esc), „N от M“, and „само моите“.
- `issues-detail`: the sheet, named after the issue title, with „Описание“ and „Последни коментари“. `f` expands it, and Esc or ✕ closes it.
- `issues-closed`: closed cards show „🎉 завършен“ or „не е планиран“.
- `issues-stage-settings`: the Settings card „Issues“, covered in [settings.md](./settings.md). Its effect shows in `stages` of `/api/issues`.
- `issues-poll`: polling on open, on focus (at most once a minute), on the interval in „На всеки“, and on „Обнови“ or `r`. The status line reads „<repo> · последен poll …“.

## How to get to it (user POV)

- „Issues“ in the „Табло“ radiogroup in the top bar.
- `i`, while focus is not in a field, Settings is closed and no sheet is open.
- `/?dashboard=issues` (optionally `&repo=owner/name`) in the address.

## Driving it with wd-verify

Preconditions:

- A healthy run. Offline steps need `yordanalexandrov/WorkDash` saved in Repos (see [settings.md](./settings.md)). Tabs, cards and polling need a token the user approved: without one, the PR poll never fills `issueRepos`, so there are no tabs.

- **Switch by key.** On `/`, run `$W browser press i`. `$W browser url` ends in `?dashboard=issues`, and `aria` shows `radio "Issues" [checked=true]`.
- **Switch back.** Run `$W browser click --role radio --name "PR-и" --exact`. The URL loses `dashboard` and keeps `view`.
- **URL entry.** Run `$W browser goto "/?dashboard=issues" --wait-text "WorkDash"`. „Issues“ is checked.
- **Table.** Run `$W browser press t`, `$W browser wait --css "[role=table]"`, then `$W browser click --role radio --name "етап" --within ".tbar"`. `aria` shows the issue headers, with „ЕТАП ▲“ sorted.
- **Stages in effect.** Save stages on the Settings „Issues“ card, then run `$W api "/api/issues?repo=yordanalexandrov/WorkDash"`. `stages` lists them in order, and `fetchedAt` is null without a token.
- **Tabs and board (needs token).** After the first PR poll, `$W api /api/prs` lists the repo in `issueRepos`. Then run `$W browser goto "/?dashboard=issues" --wait-text "WorkDash"` and `$W browser wait --css "[role=tab][aria-selected=true]"`. The URL has `repo=`, and the columns `[data-flip='col:none']`, `col:stage:<label>` and `col:closed` show.
- **Filter and sheet (needs token).** Pick an issue from `/api/issues`. Run `$W browser press /` and `$W browser fill --role textbox --name "Филтър" --value "<word>"`, which shows „N от M“. Then `$W browser press Escape`. Next, `$W browser click --css "[data-flip='issue:yordanalexandrov/WorkDash#<n>'] .age"` and `$W browser wait --css "[role=dialog]"`. Then `press f` changes the button to „Свий“, and `press Escape` closes the sheet.
- **Refresh (needs token).** Run `$W browser press r`. `fetchedAt` in `/api/issues` moves forward.
- **Proof.** Save aria trees and light and dark screenshots of the board and the table under `$($W evidence)/issues/`, plus the `/api/issues` output.

## Gotchas

- With no token, the Issue dashboard is blank: no tablist, no toolbar and no board message. „Филтър“ and `/` do nothing there, and the status line is the PR one („Чака настройки…“). That is the expected empty state, not a failure.
- „PR-и“ is also a table column header: click the radio with `--exact` or `--role radio`. The same goes for „етап“, „assignee“ and „milestone“, which are both radios and headers. Scope them with `--within ".tbar"`.
- `.card`, `[role=table]` and `.tbar` exist on both dashboards, but only one dashboard renders at a time. Assert which one with `[data-flip^='issue:']` or `[data-flip^='pr:']`.
- `$W api` is GET only and fails on HTTP errors. `/api/issues` for a repo that is not followed is a 404. Quote paths that contain `?`.
- The page rewrites the URL to the tab that opened (`replaceState`), so `repo=` appears, URL-encoded, even after `goto "/?dashboard=issues"`.
- Card `.num`, `.title` and linked PRs open GitHub. Click `.age` to open the sheet.
- Confetti for a completed issue fires only for an issue that closes between two polls seen by the page. It can't be staged from here.
