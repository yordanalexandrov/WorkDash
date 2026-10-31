# Setup and Settings

A fresh WorkDash shows a banner saying what is missing, with a link to the Settings screen. On Settings the user edits repos, the team, Jira, the review rules, the notifications and the poll interval as one draft, then saves it all at once. The server writes `config.yaml` in the data directory, and the change applies without a restart.

## Sub-features

- `setup-banner` shows what is missing (token, repos, or both) and links to Settings.
- `settings-open` opens Settings from the banner link, the ⚙ button or `#settings`.
- `settings-draft` holds list additions and removals, fields and switches as unsaved changes („Незаписани промени“).
- `settings-save` writes `config.yaml` and shows „Запазено ✓ Влиза в сила веднага.“
- `settings-applies` shows the saved values live: the poll toggle reads the new interval, and the banner drops „repo-та“.
- `settings-invalid` shows a value the server refuses under its field, in red, and saves nothing.
- `settings-close` closes Settings with ✕, Esc or ⚙ (and asks before dropping unsaved changes).

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
- **Save.** Run `$W browser click --role button --name "Запази" --within ".set-actions"` and `$W browser wait --text "Запазено ✓"`. In the aria tree, the radio reads `⟳ На всеки 5 мин`.
- **Side effect.** Run `$W data`. `config.yaml` holds `poll_interval: 5m`, `repos: [yordanalexandrov/WorkDash]`, `team: [colleague1]` and `quiet_hours: 20:00-09:00`.
- **Persistence.** Run `$W browser goto /#settings --wait-text "yordanalexandrov/WorkDash"`. The reloaded screen shows the saved values.
- **Close.** Run `$W browser click --role button --name "Затвори" --within ".settings"` and `$W browser wait --text "Няма GitHub токен: добави го в Настройки."`. The banner now names only the token.
- **Close with unsaved changes.** Press Esc with a dirty draft: `$W browser press Escape` prints `dialog confirm "Има незаписани промени. Да се откажа ли от тях?" -> dismiss`, and Settings stays open. Then `$W browser press Escape --dialog accept` and `$W browser wait --css ".settings" --gone` close it.
- **Invalid value.** Run `$W browser fill --role textbox --name "Poll интервал" --value "soon"`, then click „Запази“ within `.set-actions`. A red message appears under the field, and `$W data` is unchanged.
- **Proof.** Save `screenshot` and `aria` before the save and after it, plus the `$W data` output and the reload screenshot, under `$($W evidence)/settings/`.

## Gotchas

- Two buttons are named „Запази“ while no token is saved (the token's and the draft's). Always scope with `--within ".set-actions"`. The token's button is disabled while its field is empty, and `click` fails on it on purpose.
- The Settings inputs have no accessible names: the label is a sibling `<span class="set-label">`, and the aria tree shows a bare `textbox`. The helper resolves `--name "Poll интервал"` through that span. List inputs (repos, team, project keys) go by placeholder: `owner/name`, `GitHub login`, `ABC`.
- Enter in a list's field adds the item, like „Добави“. Use it, because there are three „Добави“ buttons.
- Closing Settings with unsaved changes opens a `confirm()`. The helper answers it (dismiss by default) and prints its text. Left unanswered, it would wedge the page until a restart.
- The quiet-hours switch's name is its current text: „изключени“ when off, „от“ when on.
- `goto /#settings` after `/` is a full reload, because the helper goes through `about:blank`. That drops any unsaved draft, which is what you want between recipes.
- Repo and login checks against GitHub (⚠ warnings next to names) run only once a token is saved. Without a token there is no warning, which is correct.
