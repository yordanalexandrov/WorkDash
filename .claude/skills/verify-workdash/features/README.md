# WorkDash verification map

This directory is the maintained source for verifying what a WorkDash user sees and does. Read this index, then use the matching feature file as the recipe. All commands assume `W=.claude/skills/verify-workdash/scripts/wd-verify`, run from the worktree root.

## Baseline preconditions

- `$W start` has printed `ready`, and `$W doctor` says `doctor: healthy`.
- The run starts empty: no token, no repos (`missing=[token,repos]`). Nothing from the checkout's `config.yaml` or `.env` gets in.
- Features marked **needs token** require a GitHub token the user has explicitly approved for this run. Enter it on the Settings screen with `--value-env`. Watch only public repos the user owns (`yordanalexandrov/WorkDash`).
- Never drive an instance this run did not start (the user's Docker instance included).

## Driving conventions

- Start each recipe with `$W browser goto /` (a fresh load) unless it says otherwise. `/` is the PR dashboard; the Issue dashboard is `/?dashboard=issues`.
- Prefer `--role` + `--name` over `--css`. Use `--within` when a name repeats (Settings has two „Запази“ buttons).
- Wait with `$W browser wait`, never `sleep`. The board animates, and `--settle` already covers one step.
- Use placeholder data only: `colleague1`, `ABC`, `https://example.atlassian.net/browse/`.

## Proof and skip reporting

- Save evidence under `$($W evidence)/<feature-id>/`, numbered in the order taken.
- UI proof means an aria tree plus a screenshot of the before and after states.
- Mutation proof adds a second view of the stored value (`$W data` or `$W api …`) and a reload that shows it again.
- If a feature can't be reached, report it with the command you tried and the missing precondition (usually "no approved token"). Never report it as verified through another path.

## Feature entry contract

Each feature file has an H1 and one paragraph describing the user-visible behavior, then exactly these H2s, in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with wd-verify` (starting with `Preconditions:`, then labeled bullets that pair a user action, its command and the observable result), and `Gotchas`.

## Features

- [Setup and Settings](./settings.md) covers the empty start, the setup banner, and the Settings draft (including the „Issues“ stages card) and its save to `config.yaml`. Offline. **Verified live.**
- [Poll mode](./poll-mode.md) covers the „На всеки / При поискване“ switch and „Обнови“ (`r`). Offline for the switch. **Verified live** (the switch).
- [GitHub token](./token.md) covers saving, masking and checking the token. Refusing a bad token needs only network (**verified live**); the rest **needs token.**
- [Board and table](./board-and-table.md) covers sections, cards, the view switch (`t`), and table grouping and sorting. **Needs token.**
- [Filter and detail sheet](./filter-and-detail.md) covers the PR toolbar filter (`/`), repo chips, „само моите“, and the PR detail sheet (`f`, Esc). **Needs token.**
- [Issue dashboard](./issues.md) covers the „PR-и / Issues“ switch (`i`), repo tabs, stage columns, the issue table, filter and sheet. Offline for the switch, the table shell and stages in `/api/issues`; the rest **needs token.** **Verified live** (the offline part).
- [Dependencies](./dependencies.md) covers sub-issue progress and „блокиран“ on the card and the row, the table columns and the group by parent, and the Dependency graph in the sheet with its node navigation. **Needs token.** **Verified live** (all but GitHub in a new tab, which this repo's data can't reach).

Not mapped yet: desktop notifications and „Пропуснати“, „Пусни деня“ (replay), drag to „видях“, „Наскоро затворени“.

Out of reach for `wd-verify`: the desktop app (`desktop/`, `npm run desktop`, the deb). Its window, tray menu („Отвори“, „Пауза на нотификациите“, „Стартирай при вход“, „Изход“), the „Чака теб“ count on the tray icon and the Dock, the keyring token (`github-token.enc`) and native notifications need Electron (`npm install --prefix desktop`, a setuid `chrome-sandbox` on Ubuntu 24.04+), a display and a tray, and the app writes the user's `~/.config/WorkDash` and `~/.config/autostart`. The page itself is the same one `wd-verify` drives. The only difference in the page is that inside the app (`window.workdash` is set) it registers no service worker and a notification click shows the hidden window. In headless Chrome there is no `window.workdash`, so the service worker registers as before.
