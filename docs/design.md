# Dashboard design

The conventions every screen and feature of the dashboard follows. The target design is the **living board**: an animated kanban of PRs plus a table as a second view of the same PRs. Its reference implementation is the prototype `web/prototype/variants/H.tsx` on the `prototype/dashboard-layouts` branch (`git show prototype/dashboard-layouts:web/prototype/variants/H.tsx`); run it with `npm run prototype` there. Until the living board lands in `web/src`, the UI on `main` is the older repo-card layout; build new UI to this document, not to that layout.

Once the implementation exists, the code holds the values (tokens, palette, springs) and this document keeps only the rules and the reasons. Update both together.

## Two views, one set of PRs

- **Дъска** (board): one column per section in workflow order: Чака теб → Свободни за review → Готови за merge → Чакат други → Екипът → Затворени. An empty column folds to a narrow strip that shows its count. The repo is a tag on the ticket, never a grouping.
- **Таблица** (table): one row per PR, a sticky header, sort on every column (▲/▼), "Групирай по: нищо / секция / repo / автор" with collapsible group rows, recently closed collapsed at the bottom.
- A toggle "▦ Дъска / ☰ Таблица" (key `t`) switches views; the choice lives in the URL (`view=table`).
- **One toolbar** serves both views: repo chips, "само моите", the text filter. Every filter applies to both views.

**Parity rule**: a new piece of PR data appears in all three places: the ticket, the table row (as a column, sortable when it has an order) and the detail sheet. A feature that fits only one view is a sign the data needs a different shape.

## Colour roles

Colour carries meaning, and each colour family has exactly one job:

| Family | Job | Where it appears |
| --- | --- | --- |
| Status: `--ok` green, `--bad` red, `--pending` amber, `--muted`, `--merged` violet | the state of a check, review or merge | badges, CI/Sonar rings, reason labels |
| Section accent | which section a PR is in | column top border, section pill in the table, the "Чака теб" glow. `waiting_on_me` = `--bad`, `free_for_review` = `--blue`, `ready_to_merge` = `--ok`, `waiting_on_others` = `--pending`, `team` = `--faint`, closed = `--merged` |
| Project | which repo a PR belongs to | 4px left stripe and light tint on the ticket and the row, the repo tag, the dot in the repo chip (which doubles as the legend) |

- **Project colours** come from a fixed palette of well-separated hues (`215, 28, 155, 285, 345, 190, 95, 50`), assigned to the repos in name order, so a repo keeps its colour between reloads and two repos never look alike. A hash of the name is only the fallback for a repo outside the current set.
- The tint is `color-mix` of the project hue into the card background: 17% light / 24% dark on tickets, 11% / 15% on table rows. Status badges stay legible on top of it; keep them solid.
- Status colours never mark a project, and project colours never mark a status.

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

Surfaces: a slow gradient-mesh background with a faint dot grid; columns and the table are glassy panels over it (radius 14px); tickets and rows are solid (radius 10px) with a soft shadow that lifts on hover; chips are pills. Type is `system-ui` 14px; numbers in tables use tabular figures.

## Anatomy

- **Ticket**: top row = repo tag, `#number`, age on the right. Then the reason label (only in "Чака теб"), the title (link to the PR), Jira keys as small mono chips. Footer = author initials avatar, CI and Sonar rings, merge state, unread count, reviewer avatars (a dot per review state; requested reviewers who have not answered as dashed circles), "видях" on "Чака теб" tickets. Drafts get diagonal stripes in the project colour.
- **Row**: the same facts as the ticket, one per column, same marks (rings, avatars, badges), same project stripe and tint; the section is a small dot-and-label pill ("теб", "review", "merge", "други", "екип").
- **Detail sheet**: opens from the ticket or row it belongs to (it grows out of that rect and shrinks back into it); holds the description, latest comments, commits, reviews, Jira, branch. Esc or ✕ closes it.

## Motion

Motion explains change: where something came from, where it went, what needs attention. It is *alive but calm*: the board breathes, it never shouts.

- Animate only `transform` and `opacity` so it stays at 60fps.
- Two springs, sampled into CSS `linear()` easings: **glide** (stiffness 260, damping 24) for things moving to a new place, **bounce** (320, 16) for things arriving or being dropped. Reuse them; a new animation picks one of the two instead of inventing a curve.
- **FLIP** every reorder: when filtering, sorting, grouping, folding a column or removing a PR, the remaining items glide from their old position to the new one. Nothing jumps.
- Entrances cascade: columns, then tickets (or rows) with a short stagger.
- Pulse and glow mean *urgent*: only "Чака теб" items pulse, harder for CI/Sonar failed, review requested, changes requested, conflict and mention. Decoration never pulses.
- Delight (confetti on merged, sparks on "видях", the 3D tilt on hover) stays small and short, and never covers content.
- `prefers-reduced-motion: reduce` turns off everything except instant state changes.

## Interaction

- Shortcuts: `/` focuses the filter, Esc clears it or closes the sheet, `t` toggles the view, Enter on a focused ticket or row opens the sheet. Shortcuts are ignored while typing in an input. Match `t` by `event.code` (`KeyT`) as well, so it works on a Bulgarian layout.
- Every PR title and number links to GitHub in a new tab.
- "видях" is reachable both as a button and by dragging a "Чака теб" ticket onto the "видях" drop zone (pointer events, so touch works).
- Anything clickable shows it: hover lift, focus ring (`--blue`), pointer cursor.

## Copy

- UI text is Bulgarian, short and plain: "Чака теб", "видях", "Пусни деня". Keep the English technical words developers use: CI, Sonar, merge, review, draft, commit, branch.
- Counts take the Bulgarian plural form ("1 нов коментар", "2 нови коментара"); reuse the `count` helper in `web/src/badges.ts`.
- Code identifiers and comments stay English.

## Checklist for a new UI feature

1. The data shows up on the ticket, in the table row and in the detail sheet (parity rule).
2. Colours come from tokens and the right colour family; both themes checked.
3. Any reorder or appearance is animated with glide or bounce via FLIP, and is off under reduced motion.
4. Filters and the view toggle still apply to it.
5. Copy is Bulgarian, with correct plurals.
