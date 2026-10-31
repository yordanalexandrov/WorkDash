# Filter and detail sheet

One toolbar filters both views: the text filter (`/` focuses it; Esc clears it, from anywhere when no sheet is open), the repo chips that double as the colour legend, and „само моите“. Clicking a card or row opens the PR's detail sheet: its description as markdown, the latest comments, commits, reviews, Jira and branch. ⤢ or `f` expands it, and Esc or ✕ closes it.

## Sub-features

- `filter-text` matches PR title, author, repo, number (`46` or `#46`), branch and Jira keys. While the query is not blank, it shows „N от M“ (open PRs kept, out of all open PRs).
- `filter-slash` focuses the filter with `/` from anywhere outside a field. Esc in the filter clears it.
- `filter-repo-chips` keeps only the chosen repos; „Всички repo-та“ resets.
- `filter-mine` keeps only the viewer's PRs (disabled until the viewer is known).
- `detail-open` opens the sheet from a card or a row (click, or Enter on the focused card).
- `detail-expand` switches between normal and expanded with ⤢ / ⤡ or `f`.
- `detail-close` closes with Esc, ✕ or a click on the backdrop, and gives focus back to the card.

## How to get to it (user POV)

- The filter field „Филтър: PR, автор, branch, Jira…“ or `/`.
- The chips in the toolbar under the top bar.
- A click on a card (not on its links) or a table row.

## Driving it with wd-verify

Preconditions:

- **Needs token**, with PRs on the board, as in [board-and-table.md](./board-and-table.md).
- Pick a PR from `$W api /api/prs` (e.g. `yordanalexandrov/WorkDash#46`) and use its title as the filter text.

- **Focus with `/`.** Run `$W browser press /`, then `$W browser eval "document.activeElement.getAttribute('aria-label')"`, which returns `"Филтър"`. This read is allowed: it checks focus without changing it.
- **Filter.** Run `$W browser fill --role textbox --name "Филтър" --value "Bump"`. „N от M“ appears, and only matching cards remain.
- **Clear.** Run `$W browser press Escape`. All cards are back, and „N от M“ is gone.
- **Repo chip.** Click the chip with the repo's short name (`$W browser click --role button --name "WorkDash"`; its full name includes the count, e.g. „WorkDash 3“, so leave out `--exact`). It has `[pressed=true]` in `aria`.
- **Open sheet.** Run `$W browser click --css "[data-flip='pr:yordanalexandrov/WorkDash#46'] .age"`, then `$W browser wait --css "[role=dialog]"`. The dialog's aria name is the PR title.
- **Expand.** Run `$W browser press f`. The button name changes from „Разпъни“ to „Свий“.
- **Close.** Run `$W browser press Escape` and `$W browser wait --css "[role=dialog]" --gone`.
- **Proof.** Save aria trees and screenshots of the filtered board, the open sheet and the expanded sheet under `$($W evidence)/filter-detail/`.

## Gotchas

- `/`, `t`, `i`, `r` and `f` do nothing while focus is in a field. Press Escape or click the page background first.
- While the sheet is open, `/`, `t`, `i` and `r` are swallowed, and only `f` and Esc act.
- Clicking a card's title or `#n` (also in a table row), or any button or the repo tag in it, does not open the sheet. The links open GitHub in a new tab.
- This recipe is for the PR dashboard (`/`). The Issue dashboard has its own toolbar with the same aria name „Филтър“; see [issues.md](./issues.md).
- PR numbers change as PRs close. Pick the PR from `/api/prs` at drive time.
