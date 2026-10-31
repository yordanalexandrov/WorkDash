---
name: verify-workdash
description: Launch a throwaway WorkDash instance (Fastify server + Preact dashboard in web/) with its own data dir and a headless Chrome, drive the dashboard through the UI over CDP, and capture screenshots, accessibility trees and config/API side effects as proof. Use to prove a change to the dashboard, the Settings screen, the poll mode or anything a user sees, works in the real app and not just in Vitest.
---

# Verify WorkDash

WorkDash is a local GitHub PR dashboard: a Node server (`src/`, built to `dist/main.js`) that polls GitHub and serves a Preact page (`web/src`, built to `web/dist`). The surface a user touches is the **web page**; the server's `/api/*` is only for reading side effects. All settings, the token and the SQLite snapshot live in one data directory (`DATA_DIR`).

The helper `scripts/wd-verify` owns the whole lifecycle. Call it by path from the root of the worktree you are working in:

```sh
W=.claude/skills/verify-workdash/scripts/wd-verify
```

## Rules before anything else

- **Never drive the user's own instance.** They run WorkDash in Docker (`docker compose`, usually on port 80 or 3000, data in the `workdash-data` volume) or as the desktop app (Electron, its server on a random port of `127.0.0.1`, data in `~/.config/WorkDash`). `wd-verify` never touches either: it starts its own server on a free port with its own `DATA_DIR`. Don't attach to a WorkDash port you didn't start, and don't launch `npm run desktop` or `workdash`: both use the user's `~/.config/WorkDash`.
- **Never let real data in.** The checkout holds a git-ignored `config.yaml` and `.env` with the author's real repos and colleagues. `wd-verify start` sets `CONFIG_PATH` to a file that does not exist and unsets `GITHUB_TOKEN`, so the server starts empty and copies nothing. Don't override that. Use only placeholder values in drives (`colleague1`, `ABC`, `example.atlassian.net`) and only public repos the user owns (`yordanalexandrov/WorkDash`). The repo is public (see `CLAUDE.md`), and evidence can end up in a PR.
- **A GitHub token needs the user's explicit go-ahead.** Without a token the app is fully drivable offline: the empty start, Settings, the poll mode and the empty board. Anything with PRs on it needs a real token, entered through the Settings screen. Ask the user for one (or for permission to use `gh auth token`) and never print it. Pass it with `--value-env`, never `--value`.
- **One run per worktree.** State lives in `<worktree>/.verify/` (git-ignored). Other sessions use their own worktrees (`CLAUDE.md`: one worktree per session), and with them their own `.verify`, ports and Chrome profiles, so runs never collide. `start` refuses while this worktree's run is up.

## Launch

Prerequisite once per worktree: `npm ci` (a fresh worktree has no `node_modules`).

```sh
$W start
```

It runs `npm run build`, then starts `node dist/main.js` with `DATA_DIR=.verify/runs/<id>/data`, `HOST=127.0.0.1`, a free `PORT` and `TZ=UTC` (override with `WD_TZ=Europe/Sofia $W start`). Next to it, it starts `google-chrome --headless=new` with a throwaway profile and a free CDP port. It is ready when it prints

```
wd-verify: ready: run <id>  app http://127.0.0.1:<port>  evidence <worktree>/.verify/evidence/<id>
```

If the server or Chrome does not answer within about 15s, it prints the log tail, cleans up and exits non-zero. Every later command finds the run through `.verify/current`, so nothing needs to be exported between shell calls. Code changed after `start`? Run `$W stop && $W start` (the doctor flags a stale build).

## Doctor

Run it first, and again whenever anything surprises you:

```sh
$W doctor
```

It is read-only and checks that the server pid is alive and is this worktree's `dist/main.js` with this run's `DATA_DIR`, that the port belongs to that pid, that `/api/prs` returns JSON, that Chrome is alive with this run's profile and CDP answers, and that the build is newer than `src/` and `web/src/`. Then it prints the state the page will show, for example `missing=[token,repos] fetchedAt=null pollMode=periodic error=null openPRs=0`. Anything but `doctor: healthy` → `$W stop && $W start`.

## Drive

`$W browser <command>` drives the one page in the headless Chrome with real mouse and keyboard events (`scripts/cdp.mjs`, no dependencies). Each call connects, acts, waits `--settle` ms (default 400, for the animations) and prints what it did.

| Command | What it does |
| --- | --- |
| `goto <path> [--wait-text T]` | Fresh load of `BASE_URL+path`, through `about:blank`, so `/#settings` after `/` really reloads and drops any draft. |
| `click --name N [--role R] [--within CSS] [--exact] [--nth K]` | Clicks the element whose accessible name is N. Fails if it is disabled. |
| `click --css S` | The same, by CSS, when there is no name (cards, rows). |
| `fill --name N --value V` / `--value-env VAR` `[--nth K]` | Clicks the field, selects all and types. Time inputs are set the way their picker sets them. `--nth` picks among same-named fields (0-based). |
| `press <key>` | `Escape`, `Enter`, `Tab`, `/`, or a letter (`t`, `i`, `r`, `f`). Shortcuts fire only while focus is not in a field, and not while Settings is open. |
| `wait --text T` / `--css S` `[--gone] [--timeout MS]` | Polls until the text or element is there (or gone). Use it instead of sleeps. |
| `text [--css S]` | Prints innerText. |
| `url` | Prints the current URL. |
| `screenshot <file> [--full] [--scheme dark] [--reduced-motion]` | Saves a PNG of the 1440×900 viewport, or the whole page with `--full`. `--scheme` and `--reduced-motion` apply only to that shot. |
| `aria [<file>]` | Writes the accessibility tree with checked/pressed/disabled states. Field values are left out, so a token can't leak. |
| `eval <js>` | For reading only. Never use it to change state: that is not the user path. |
| `dialog accept\|dismiss` | Answers a `confirm()` an earlier command left open. Any command also takes `--dialog accept` to answer one that opens during it; the default is dismiss, and the dialog's text is printed. |

A page with a `confirm()` nobody answered stays wedged, even across commands: `Runtime.evaluate` never returns. The helper answers every dialog it sees and gives up after its watchdog (`--timeout` + 15s) with a message. On that message, or on any hang, run `$W stop && $W start`: the doctor can't see a wedged page, because the processes are healthy.

Names are matched against `aria-label`, then the `<label>` of an input, then the visible `.set-label` of a Settings field, then the placeholder, then the visible text (whitespace collapsed). The match is exact first, then by substring unless `--exact`. Stable handles in this app:

- Top bar: `--role button --name "Настройки"` (⚙), the radiogroups `Табло` (`--role radio --name "PR-и" --exact` / `"Issues"`; key `i`; `?dashboard=issues` in the query), `Изглед` (`--role radio --name "Дъска"` / `"Таблица"`) and `Обновяване` (`--role radio --name "На всеки"` / `"При поискване"`), and the button `--role button --name "Обнови"`.
- Banners: the `⚙ Настройки` link (`--role link --name "Настройки"`). Texts: `Няма GitHub токен и repo-та: добави ги в Настройки.`, `Няма GitHub токен: …`, `Няма repo-та за следене: …`.
- Settings: the region `Настройки` (CSS `.settings`), the save bar `.set-actions` (`--role button --name "Запази" --within ".set-actions"`), and ✕ (`--role button --name "Затвори" --within ".settings"`).
- Toolbar: `--role textbox --name "Филтър"` (also `/`), the repo chips by short name, and `само моите`.
- Cards: `[data-flip='pr:<owner>/<repo>#<n>']`, and `issue:<owner>/<repo>#<n>` on the Issue dashboard. Click its `.age` to open the sheet (the title and `#n` are links to GitHub). The sheet is `[role=dialog]` with the PR title as its name.
- Table: `[role=table]`, and `--role radio --name "секция"` etc. in the `Групирай по` group.

Read API (for side effects only, never for driving; GET only, and it fails on HTTP errors): `$W api /api/prs`, `$W api /api/config`, `$W api "/api/issues?repo=owner/name"` (only for a followed repo). `$W data` lists the data dir and prints the `config.yaml` the server wrote.

## Evidence

Write everything under `$($W evidence)/<feature-id>/`, numbered in order (`01-…png`, `02-…aria.txt`, …). It lives in `<worktree>/.verify/evidence/<run-id>/` and survives `stop`, which also copies `server.log` and `chrome.log` into it.

Proof standards:

- Go through the real user path: click, type, press keys. Don't use `eval` to set state, don't `PUT /api/*` yourself, and don't edit `config.yaml` by hand, unless the feature being proven *is* the hand edit.
- Capture the action and the resulting state: a screenshot or aria tree before, the step, and after. A final screen alone isn't proof.
- Check side effects next to what's visible: `$W data` for `config.yaml` (and the `github-token` file, mode `600`, never its content), `$W api /api/prs` for poll mode and the snapshot. Then reload (`goto`) and show the state survived.
- The only external system is GitHub. No mocks: offline features run with no token, PR features run against a real public repo with a token the user approved.
- A visual change gets one screenshot per theme (`--scheme light` and `--scheme dark`), because `docs/design.md` makes both themes first-class. Add `--reduced-motion` when an animation would blur the shot.
- Report every feature you couldn't reach, with the precondition that was missing (usually "no token"). Never report it as verified through another path.

## Cleanup

```sh
$W stop
```

It kills only the two process groups `start` launched (by the pids recorded in `state.env`, never by name). It then deletes `.verify/runs/<id>` (the data dir with any token, and the Chrome profile) and keeps `.verify/evidence/<id>`. Run it after every failed attempt as well. A later `start` also cleans a stale run whose processes are gone. After `stop`, `ls .verify/evidence/<id>` should still list the proof.

## Feature map

`features/README.md` indexes the user-facing features. Each file is the recipe for one feature, and a proof covers every entry point the file lists. Keep it current with `/maintain-verification-skill`.
