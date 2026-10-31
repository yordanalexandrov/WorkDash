# Setup and Settings

A fresh WorkDash shows a banner saying what is missing, with a link to the Settings screen. On Settings the user edits repos, the team, Jira, the review rules, the notifications and the poll interval and the Issue dashboard's stage labels as one draft, then saves it all at once. The server writes `config.yaml` in the data directory, and the change applies without a restart.

## Sub-features

- `setup-banner` shows what is missing (token, repos, or both) and links to Settings.
- `settings-open` opens Settings from the banner link, the ⚙ button or `#settings`.
- `settings-draft` holds list additions and removals, fields and switches as unsaved changes („Незаписани промени“).
- `settings-save` writes `config.yaml` and shows „Запазено ✓ Влиза в сила веднага.“
- `settings-applies` shows the saved values live: the poll toggle reads the new interval, and the banner drops „repo-та“.
- `settings-stages` adds, reorders (↑ ↓) and removes stage labels on the „Issues“ card. „+ <repo>“ gives a repo its own list, starting as a copy of the common one, and „Към общия“ drops that list again.
- `settings-invalid` shows a value the server refuses under its field, in red, and saves nothing.
- `settings-close` closes Settings with ✕ or Esc, which ask before dropping unsaved changes. ⚙ closes it without asking and drops the draft.

## How to get to it (user POV)

- The „⚙ Настройки“ chip in the setup banner.
- The ⚙ button at the end of the top bar.
- `#settings` in the address.

## Driving it with wd-verify

Preconditions:

- A fresh run (`missing=[token,repos]` in `$W doctor`).

- **Empty start.** Open the dashboard. Run `$W browser goto / --wait-text "Няма GitHub токен и repo-та"`. The banner reads „Няма GitHub токен и repo-та: добави ги в Настройки.“ and the status reads „Чака настройки…“.
- **Open from banner.** Choose the banner's chip. Run `$W browser click --role link --name "Настройки"`, then `$W browser wait --text "Още няма repo-та"`. `$W browser url` ends in `#settings`.
- **Add a repo.** Run `$W browser fill --role textbox --name "owner/name" --value "yordanalexandrov/WorkDash"` and `$W browser press Enter`. The repo shows as a row with ✕.
- **Add a team member.** Run `$W browser fill --role textbox --name "GitHub login" --value "colleague1"` and `$W browser press Enter`.
- **Change a field.** Run `$W browser fill --role textbox --name "Poll интервал" --value "5m"`.
- **Turn on quiet hours.** Run `$W browser click --role checkbox --name "изключени"` and `$W browser fill --role textbox --name "От" --value "20:00"`. Then `$W browser wait --text "Незаписани промени"`.
- **Stages.** Run `$W browser fill --role textbox --name "етикет" --value "needs-triage"` and `press Enter`, then the same for `in-progress`. Then `$W browser click --role button --name "in-progress по-напред" --exact` and `$W browser click --role button --name "+ WorkDash" --exact`. „Етапи на yordanalexandrov/WorkDash“ appears, with „Към общия“.
- **Save.** Run `$W browser click --role button --name "Запази" --within ".set-actions"` and `$W browser wait --text "Запазено ✓"`. In the aria tree, the radio reads `⟳ На всеки 5 мин`.
- **Side effect.** Run `$W data`. `config.yaml` holds `poll_interval: 5m`, `repos: [yordanalexandrov/WorkDash]`, `team: [colleague1]`, `quiet_hours: 20:00-09:00`, `issues.columns: [in-progress, needs-triage]` and `issues.repos.yordanalexandrov/WorkDash.columns` with the same list.
- **Persistence.** Run `$W browser goto /#settings --wait-text "Етапи на yordanalexandrov/WorkDash"`. The reloaded screen shows the saved values.
- **Back to the common list.** Choose „Към общия“ (`$W browser click --role button --name "Към общия"`) and save. In `$W data`, `issues.repos` is gone and `issues.columns` stays.
- **Close.** Run `$W browser click --role button --name "Затвори" --within ".settings"` and `$W browser wait --text "Няма GitHub токен: добави го в Настройки."`. The banner now names only the token.
- **Close with unsaved changes.** With focus on a button (for example right after clicking „Запази“), press Esc with a dirty draft: `$W browser press Escape` prints `dialog confirm "Има незаписани промени. Да се откажа ли от тях?" -> dismiss`, and Settings stays open. Then `$W browser press Escape --dialog accept` and `$W browser wait --css ".settings" --gone` close it.
- **Invalid value.** Run `$W browser fill --role textbox --name "Poll интервал" --value "soon"`, then click „Запази“ within `.set-actions`. `$W browser wait --text 'expected a duration such as "60s"'` passes (the message is in English), and `$W data` is unchanged.
- **⚙ drops the draft.** Change the poll interval, then click ⚙ (`$W browser click --role button --name "Настройки" --exact`). Settings closes, no dialog is printed, and `$W data` is unchanged.
- **Proof.** Save `screenshot` and `aria` before the save and after it, plus the `$W data` output and the reload screenshot, under `$($W evidence)/settings/`.

## Gotchas

- Two buttons are named „Запази“ while no token is saved (the token's and the draft's). Always scope with `--within ".set-actions"`. The token's button is disabled while its field is empty, and `click` fails on it on purpose.
- The Settings inputs have no accessible names: the label is a sibling `<span class="set-label">`, and the aria tree shows a bare `textbox`. The helper resolves `--name "Poll интервал"` through that span. List inputs (repos, team, project keys, stages) go by placeholder: `owner/name`, `GitHub login`, `ABC`, `етикет`.
- Enter in a list's field adds the item, like „Добави“. Use it, because there are four or more „Добави“ buttons (Repos, Екипът, Project keys, Етапи, and one per repo-specific stage list).
- Each stage list has a field with the placeholder `етикет`. With a repo-specific list there are several, so use `--nth 0` (common) or `--nth 1` (first repo list). Adding a label that is already in the list, in any letter case, is ignored silently, with no red message.
- „+ WorkDash“ needs `--exact`. Its substring also matches `Махни yordanalexandrov/WorkDash`, which comes first in the DOM.
- Esc does nothing while focus is in a field, so no dialog appears right after a `fill`. Click a button first, or use ✕.
- Closing Settings with unsaved changes opens a `confirm()`. The helper answers it (dismiss by default) and prints its text. Left unanswered, it would wedge the page until a restart.
- The quiet-hours switch's name is its current text: „изключени“ when off, „от“ when on.
- `goto /#settings` after `/` is a full reload, because the helper goes through `about:blank`. That drops any unsaved draft, which is what you want between recipes.
- Repo and login checks against GitHub (⚠ warnings next to names) run only once a token is saved. Without a token there is no warning, which is correct.
