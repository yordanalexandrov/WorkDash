# Dashboard design

The conventions every screen and feature of the dashboard follows. The target design is the **living board**: an animated kanban of PRs plus a table as a second view of the same PRs. Its reference implementation is the prototype `web/prototype/variants/H.tsx` on the `prototype/dashboard-layouts` branch (`git show prototype/dashboard-layouts:web/prototype/variants/H.tsx`); run it with `npm run prototype` there. The board lives in `web/src`: `board.ts`, `palette.ts`, `marks.ts` and the components in `web/src/components`; the table in `table.ts` (sorting and grouping, no PR types), `prTable.ts` (the PR columns) and `Table`, `GroupHead`, `PrTable`, `PrRow`, `ClosedRow`; the view in the URL in `view.ts`, the dashboard and the open repo in `dashboard.ts`; the app shell in `App.tsx`, the PR dashboard in `PrDashboard`, the Issue dashboard in `IssueDashboard` with its `IssueTabs`, its stage columns in `issueBoard.ts`, its filter in `issueFilter.ts`, its cards in `IssueCard`, its label colours in `labels.ts` and its data in `useIssues.ts`; the tokens and keyframes are in `web/public/style.css`, and the motion layer (springs, FLIP, the reduced-motion flag, the gate that holds snapshots while a card leaves) in `web/src/motion.ts`.

Once the implementation exists, the code holds the values (tokens, palette, springs) and this document keeps only the rules and the reasons. Update both together.

## Two dashboards

- The app has two **dashboards**: the PR dashboard (PR-и) and the Issue dashboard (Issues). "PR-и / Issues" (`DashboardToggle`) is the first thing after the name in the top bar, a segmented control styled like the view toggle; key `i` switches. The choice lives in the URL (`dashboard=issues`; no parameter is the PR dashboard), and the view (board or table) stays as it is across a switch.
- The top bar belongs to the app; each dashboard puts its own row under the toggles (the PR dashboard its toolbar, the Issue dashboard its repo tabs). The PR dashboard stays mounted behind Settings and the Issue dashboard, so its table settings, counts and confetti outlast a trip there; its sheet and "Пусни деня" close when it steps aside.
- **Repo tabs**: the Issue dashboard shows one repo at a time. A tab per repo of `repos` whose issues are on in GitHub (the PR poll reads `hasIssuesEnabled`; a repo with them off has no tab), by the name shown, then by owner. No count and no "всички" tab. Each tab is in its project colour; the open one sits on its project tint with an ink in its stripe colour under it, which glides (glide spring, transform only) to the next tab opened. The open repo lives in the URL (`repo=owner/name`); without one, or with one that has no tab, the first tab opens.

- **Stages**: the Issue dashboard's board has "Без етап" first, then a column per stage label of the open repo in the order of config.yaml (`issues.columns`, or the repo's own list under `issues.repos`), titled with the label's name. "Без етап" has the `--faint` accent, a stage `--blue`: a stage is a step of the work, not a status, so it takes no status colour. An issue with several stage labels is in the last; a change of the stages in config.yaml reorders the board at once. When the repo has more open issues than one poll fetches (100), its tab says so: "100 от 240".
- **Issue toolbar**: under the tabs, the same toolbar without repo chips and "Пусни деня": the text filter and "само моите". "Само моите" keeps the issues assigned to me; the text searches the number (with or without #), title, labels, assignees and milestone; both have to match. It narrows every column, closed ones too, and later the table; a column it empties folds, and the cards glide (FLIP). `/` and Esc work as on the PR dashboard. Its filter is its own, not the PR dashboard's; it stays across a change of tab and a trip to the PRs or Settings, until a reload.
- **Issue polls**: the open repo's issues are fetched when the Issue dashboard is opened and when a tab is, at most once a minute per repo (under a minute it shows what was saved); "Обнови" (and `r`) on the Issue dashboard polls the open repo now, waiting only for a rate limit. Every page on a repo shows the same issues: a poll's start and end reach them all.

## Two views, one set of PRs

- **Дъска** (board): one column per section in workflow order: Чака теб → Свободни за review → Готови за merge → Чакат други → Екипът → Затворени. An empty column folds to a narrow strip that shows its count. The repo is a tag on the card, never a grouping.
- **Таблица** (table): one row per PR, a sticky header, sort on every column (▲/▼), "Групирай по: нищо / секция / repo / автор" with collapsible group rows, recently closed collapsed at the bottom.
- A toggle "▦ Дъска / ☰ Таблица" (key `t`) switches views; the choice lives in the URL (`view=table`).
- **One toolbar** serves both views: repo chips, "само моите", the text filter. Every filter applies to both views.

**Parity rule**: a new piece of PR data appears in all three places: the card, the table row (as a column, sortable when it has an order) and the detail sheet. A feature that fits only one view is a sign the data needs a different shape.

## Settings

- **Настройки** is a third screen, not a view of the PRs: the gear (⚙) at the end of the top bar, or `#settings` in the URL, puts it in place of the board or table (and closes the sheet and "Пусни деня"); the gear or ✕ or Esc goes back. The view toggle and the toolbar step aside while it shows. Banners about something set there (no token or repos yet, a token GitHub refuses, a rejected config.yaml) link to it with a "⚙ Настройки" chip.
- One card per part of config.yaml (GitHub, Repos, Екипът, Jira, Review, Нотификации) in a grid of glassy panels like the columns, entering in the columns' cascade. Lists are rows with a ✕ and an add field below; a checkbox is a switch whose knob glides.
- Everything but the token is one **draft**: the sticky bar at the bottom says whether it has unsaved changes, and "Запази" / "Отказ" act on all of it. A field the server refuses shows its message under it in `--bad`; what GitHub does not know (a repo the token cannot see, a login that does not exist) is a `--pending` warning that never blocks a save.
- The token is saved on its own, only after GitHub takes it, and shows only masked (`ghp_…1234`), with whose it is, its scopes and its rate limit.

## Colour roles

Colour carries meaning, and each colour family has exactly one job:

| Family | Job | Where it appears |
| --- | --- | --- |
| Status: `--ok` green, `--bad` red, `--pending` amber, `--muted`, `--merged` violet | the state of a check, review or merge, or of a Linked PR | badges, CI/Sonar rings, reason labels, Linked PR chips |
| Section accent | which section a PR is in | column top border, section pill in the table, the "Чака теб" glow. `waiting_on_me` = `--bad`, `free_for_review` = `--blue`, `ready_to_merge` = `--ok`, `waiting_on_others` = `--pending`, `team` = `--faint`, closed = `--merged` |
| Project | which repo a PR or issue belongs to | 4px left stripe and light tint on the card and the row, the repo tag, the dot in the repo chip (which doubles as the legend), the repo tabs of the Issue dashboard |
| Label | a GitHub label of an issue | only the label chips: the label's own GitHub colour as the background, the text `--label-dark` or `--label-light`, whichever contrasts more with it (`labelChip` in `labels.ts`, by WCAG luminance), and a hairline `--label-edge` so a label as pale as the card still ends. The same in both themes, as on GitHub |

- **Project colours** come from a fixed palette of well-separated hues (`215, 28, 155, 285, 345, 190, 95, 50`), assigned in name order to the repos of both dashboards (those with PRs and those with an issue tab), so a repo has one colour on both, so a repo keeps its colour between reloads and two repos never look alike. A hash of the name is only the fallback for a repo outside the current set.
- The tint is `color-mix` of the project hue into the card background: 17% light / 24% dark on cards, 11% / 15% on table rows. Status badges stay legible on top of it; keep them solid.
- Status colours never mark a project, and project colours never mark a status. Label colours are the one family that comes from outside (each repo's labels on GitHub): they appear only on label chips and mean nothing else.

## Tokens and themes

Every colour is a CSS custom property with a light and a dark value (`prefers-color-scheme`); components use the tokens, never raw colours. Both themes are first-class: check every change in both.

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#eef0f7` | `#0f1218` |
| `--card` | `#fff` | `#232a37` |
| `--col-solid` | `#f7f8fc` | `#1a1f2a` |
| `--text` / `--muted` / `--faint` | `#1a1f2b` / `#5d6880` / `#8a93a8` | `#e2e7f0` / `#9ba7bd` / `#6f7a90` |
| `--ok` / `--bad` / `--pending` | `#1f9d63` / `#e0453a` / `#c99400` | `#4fd69c` / `#ff6f63` / `#f0c419` |
| `--blue` / `--merged` | `#3b7cff` / `#7b61e8` | `#6c9dff` / `#a690ff` |
| `--line` | `rgba(20,30,60,.12)` | `rgba(200,215,255,.11)` |
| `--chip` / `--chip-on` / `--chip-on-text` | `rgba(255,255,255,.75)` / `#1a1f2b` / `#fff` | `rgba(30,36,48,.8)` / `#e2e7f0` / `#0f1218` |

Surfaces: a slow gradient-mesh background with a faint dot grid; columns and the table are glassy panels over it (radius 14px); cards and rows are solid (radius 10px) with a soft shadow that lifts on hover; chips are pills. Type is `system-ui` 14px; numbers in tables use tabular figures.

## Anatomy

- **Card**: top row = repo tag, `#number`, age on the right. Then the reason label (only in "Чака теб"), the title (link to the PR), Jira keys as small mono chips. Footer = author initials avatar, CI and Sonar rings, merge state, unread count, reviewer avatars (a dot per review state; requested reviewers who have not answered as dashed circles), "видях" on "Чака теб" cards. Drafts get diagonal stripes in the project colour.
- **Issue card**: top row = `#number` (link to the issue), a quiet outlined "теб" when it is assigned to me (no colour, no pulse: the pulse is only for "Чака теб" on the PR dashboard), age on the right. Then the title (link), the labels as chips in their own colours (all but the stage label, which the column says), the milestone (⚑ and its name, the due date on hover) and the Linked PRs (`closedByPullRequestsReferences`), each `#n` (`repo-b#n` from another repo) linking to GitHub in its status colour: open `--ok`, draft grey (`.ic.muted`), merged `--merged`, closed `--bad`, never a project colour. `MilestoneChip` and `LinkedPrs` (`components/IssueMarks.tsx`) draw them for the row and the sheet too. Then a footer with the author's avatar, the comment count and the assignees' avatars on the right. No repo tag: the open tab says the repo, the stripe and tint its project colour.
- **Row**: the same facts as the card, one per column, same marks (rings, avatars, badges), same project stripe and tint; the section is a small dot-and-label pill ("теб", "review", "merge", "други", "екип").
- **Detail sheet**: opens from the card or row it belongs to (it grows out of that rect and shrinks back into it); holds the description, latest comments, commits, reviews, Jira, branch. The description and the comments are GitHub-flavoured markdown (`Markdown`: `marked`, then `DOMPurify`), with ```mermaid blocks drawn as diagrams; mermaid loads only when a text has one. ⤢ / ⤡ or `f` expand it to 24px off every edge of the window (columns `2fr / 1fr`) and back; the next sheet opens in the last size, until a reload. Esc or ✕ closes it. An issue's sheet (`IssueDetail`) holds every fact of its card and row (the stage as a pill, the other labels, milestone, Linked PRs, "теб", author, assignees, comment count) plus the description, the latest comments and when it was opened, updated and closed; the comments come from a second query, run only for issues that changed since the last poll, as for PRs. A card or a table row opens it through the Issue dashboard's `openSheet(issue, from)`; both carry the issue's FLIP key (`issueFlipKey`), which the sheet shrinks back into.

## Motion

Motion explains change: where something came from, where it went, what needs attention. It is *alive but calm*: the board breathes, it never shouts.

- Animate only `transform` and `opacity` so it stays at 60fps. One exception: the flyers of the view switch move their box by `left`/`top`/`width`/`height`, so a card's stripe and tint stretch into a row without distortion; they are `position: fixed` copies in the `.fx` layer (`contain: strict`), outside the board's flow, so nothing on the board lays out again.
- Two springs, sampled into CSS `linear()` easings: **glide** (stiffness 260, damping 24) for things moving to a new place, **bounce** (320, 16) for things arriving or being dropped. Reuse them; a new animation picks one of the two instead of inventing a curve: `GLIDE`/`BOUNCE` from `motion.ts` in script, `var(--glide)`/`var(--bounce)` with `--glide-ms`/`--bounce-ms` in CSS. Only endless keyframes (pulse, halo, drift, spinners) use a plain curve.
- FLIP keys: `data-flip="pr:<repo>#<number>"` for a card (and later its row), `issue:<repo>#<number>` for an issue's card, `col:<id>` for a column (`none` and `stage:<label>` on the Issue dashboard); the same PR has the same key in every view. An issue whose stage changes glides to its new column. `useFlip` runs on the element with `data-flip-root`.
- **FLIP** every reorder: when filtering, sorting, grouping, folding a column or removing a PR, the remaining items glide from their old position to the new one. Nothing jumps.
- Entrances cascade: columns, then cards (or rows) with a short stagger.
- **Card ↔ row morph** on switching the view: every card or row in sight is lifted into `.fx` (`liftFlyers`) and lands on the same PR in the new view (`land`), top to bottom; one with no place there falls away, one with no flyer bounces in. The entrance cascade plays once per page, never on a switch; a switch in mid-flight ends the last one at once (`finishLanding`).
- **Drag to "видях"**: a "Чака теб" card pressed and moved past 7px lifts a copy into `.fx` (`liftClone`) that follows the pointer and leans with its speed; the drop zone bounces in low in the middle while it does. Dropped there, the copy glides in, turns and fades (`dropInto`, which holds the gate); dropped anywhere else, cancelled or put back with Esc, it bounces back onto its card (`returnTo`), or fades if the card has left the column. Under reduced motion it neither leans nor flies.
- **"Пусни деня"** replays the last 48 hours of the PRs the toolbar keeps, frozen as it starts (`replay.ts`, `useReplay.ts`): the board stays as it is now and only flashes. A happening scrolls its card or row into sight and flashes it in the colour of its kind (`flash` in `motion.ts`): a ripple and a small bounce on a card, a sweep and a glow on a row, inside the `.card-wrap` that clips them; under reduced motion, a 600ms outline. Its toasts bounce in on the right and fade before they go. The button's sliding gradient is decoration, not a pulse: a picture twice its width moving by `transform`.
- Pulse and glow mean *urgent*: only "Чака теб" items pulse, harder for CI/Sonar failed, review requested, changes requested, conflict and mention. Decoration never pulses.
- Delight (confetti on merged, sparks on "видях", the 3D tilt on hover) stays small and short, and never covers content:
  - **Confetti** (`confetti` in `effects.ts`): 46 pieces from the head of "Затворени" ~700ms after it first shows unfolded with a merged PR in it, once per page load; 30 from the card or row of a PR merged while the dashboard is open, once it has landed, and from a merge in "Пусни деня". Not on a hidden page or from a folded column or group.
  - **Sparks** (`sparks`): 16 dots in `--ok` and a rising "✓ видях", from the card, the row's button, the drop zone or the sheet's button.
  - **Tilt** (`tilt.ts`): an open PR's card leans up to ±4.5° towards the mouse (not touch, not while a button is down) and a soft shine follows it; it is the inner `.card` that leans, never the `[data-flip]` slot, so FLIP, entrances and the hover lift carry on. Rows, closed cards, flyers and drag copies do not lean.
  - **Counts** in the heads of the board's columns count up with ease-out over 700ms (`CountUp`; a count is text, not something moving, so it keeps its own curve): from 0 on load in the cascade, from the old value on a change. What they last showed, and whether the confetti has played, live outside the board, so going back to it from the table (or folding a column) neither counts from 0 nor bursts again.
  - Particles are the one exception to the two springs: they follow physics (gravity, a burst), not something moving to a new place, so they use their own `cubic-bezier` curves. They are also the one place where the project hues (`PALETTE` in `palette.ts`, at the stripe's saturation) do not mean a project; sparks are `--ok` mixed lighter with `color-mix`. They live in `.fx`, move only by `transform` and `opacity` and are removed at their end.
- **Sheet size**: switching between normal and expanded, the content fades out, the box glides from one rect to the other (`morphTransform`, GLIDE) and the content fades back in, so no text shows stretched. The fades are opacity only, short and `linear`, like the sheet's own fade in and out as it opens and closes: nothing moves in them, so neither spring applies.
- `prefers-reduced-motion: reduce` turns off everything except instant state changes.

## Interaction

- Shortcuts: `/` focuses the filter, Esc clears it or closes the sheet, `t` toggles the view, `i` switches the dashboard, `f` expands or shrinks the open sheet, `r` polls now ("Обнови"), Enter on a focused card or row opens the sheet. Shortcuts are ignored while typing in an input. The dashboard shown has its keys first and can take one from the app (an open sheet takes `/`, `t`, `i` and `r`). Match `t`, `i`, `f` and `r` by `event.code` (`KeyT`, `KeyI`, `KeyF`, `KeyR`) as well, so they work on a Bulgarian layout.
- **Poll mode** (`PollControls`, `usePolling.ts`): in the top bar, after the status, "⟳ На всеки 60s / ✋ При поискване" is a segmented control styled like the view toggle (the interval comes from `poll_interval`), and "Обнови" next to it spins while a poll is under way in any open page. The mode is the server's, so switching it switches every open page. In On-demand the page asks for a poll on load, when the stream reconnects, on window focus and when the tab is shown again; the server ignores a focus within 30s of a successful poll, and "Обнови" waits out a rate limit, saying until when. Since nothing polls on its own there, the status says how long ago the last poll was and turns `--pending` after an hour.
- Every PR title and number links to GitHub in a new tab.
- "видях" is reachable both as a button and by dragging a "Чака теб" card onto the "видях" drop zone (pointer events, so touch works).
- Anything clickable shows it: hover lift, focus ring (`--blue`), pointer cursor.

## Copy

- UI text is Bulgarian, short and plain: "Чака теб", "видях", "Пусни деня". Keep the English technical words developers use: CI, Sonar, merge, review, draft, commit, branch.
- Counts take the Bulgarian plural form ("1 нов коментар", "2 нови коментара"); reuse the `count` helper in `web/src/badges.ts`.
- Code identifiers and comments stay English.

## Checklist for a new UI feature

1. The data shows up on the card, in the table row and in the detail sheet (parity rule).
2. Colours come from tokens and the right colour family; both themes checked.
3. Any reorder or appearance is animated with glide or bounce via FLIP, and is off under reduced motion.
4. Filters and the view toggle still apply to it.
5. Copy is Bulgarian, with correct plurals.
