# WorkDash verification map

This directory is the maintained source for verifying what a WorkDash user sees and does. Read this index, then use the matching feature file as the recipe. All commands assume `W=.claude/skills/verify-workdash/scripts/wd-verify`, run from the worktree root.

## Baseline preconditions

- `$W start` has printed `ready`, and `$W doctor` says `doctor: healthy`.
- The run starts empty: no token, no repos (`missing=[token,repos]`). Nothing from the checkout's `config.yaml` or `.env` gets in.
- Features marked **needs token** require a GitHub token the user has explicitly approved for this run. Enter it on the Settings screen with `--value-env`. Watch only public repos the user owns (`yordanalexandrov/WorkDash`).
- Never drive an instance this run did not start (the user's Docker instance included).

## Driving conventions

- Start each recipe with `$W browser goto /` (a fresh load) unless it says otherwise.
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

- [Setup and Settings](./settings.md) covers the empty start, the setup banner, and the Settings draft and save to `config.yaml`. Offline. **Verified live.**
- [Poll mode](./poll-mode.md) covers the „На всеки / При поискване“ switch and „Обнови“ (`r`). Offline for the switch. **Verified live** (the switch).
- [GitHub token](./token.md) covers saving, masking and checking the token. **Needs token.**
- [Board and table](./board-and-table.md) covers sections, cards, the view switch (`t`), and table grouping and sorting. **Needs token.**
- [Filter and detail sheet](./filter-and-detail.md) covers the toolbar filter (`/`), repo chips, „само моите“, and the PR detail sheet (`f`, Esc). **Needs token.**

Not mapped yet: desktop notifications and „Пропуснати“, „Пусни деня“ (replay), drag to „видях“, „Наскоро затворени“.
