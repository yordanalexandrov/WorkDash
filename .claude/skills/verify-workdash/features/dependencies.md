# Dependencies

On the Issue dashboard, GitHub's sub-issues and blockers show in three places:
- **Card:** a sub-issue progress chip („☑ 0/4“) and a quiet „блокиран“ in `--pending` for an issue with an open blocker.
- **Table:** the columns „sub-issues“ and „блокиран от“ (the number of open blockers), and „Групирай по: родител“.
- **Detail sheet:** a „Зависимости“ section with the issue's **Dependency graph**, drawn by mermaid. It shows the family: a sub-issue's parent and siblings, or an issue's own sub-issues. Arrows go from the blocker to the blocked. Outside neighbours of the open issue are dotted. A node is a link: it switches the sheet to an issue the open repo has, and opens GitHub in a new tab otherwise.

## Sub-features

- `deps-marks`: on the card, „☑ n/m“ (☑ comes from CSS) and „блокиран“. The sheet's header carries the same chips.
- `deps-table`: the columns „sub-issues“ (sorts by the completed share) and „блокиран от“ (sorts by open blockers). Grouping by „родител“ gives groups headed `#n <title>`, with „Без родител“ last.
- `deps-graph`: the section between the description and the comments, with the summary „n/m завършени“, then the graph. Node borders:
  - the open issue: thick `--blue`;
  - blocked: `--pending`;
  - completed: `--merged`;
  - not planned: dashed `--muted`;
  - outside the family: dotted, with `owner/name#n` from another repo.

  „още N“ under the graph means GitHub counts more than the token can see.
- `deps-nav`: a click on a node, or Tab to it and Enter, switches the sheet with a short fade. Under reduced motion the switch is instant. A node the open repo doesn't have opens GitHub in a new tab. Nodes show a `--blue` focus ring.

## How to get to it (user POV)

- The Issue dashboard (`i`), the board or the table (`t`).
- A card's `.age` or a table row opens the sheet, and the „Зависимости“ section sits under the description. `f` widens the sheet, so the graph fits without scrolling sideways.

## Driving it with wd-verify

Preconditions:

- A healthy run with a token the user approved, following `yordanalexandrov/WorkDash`. That repo has the family #79 → #83–#86: #84 is blocked by #83 and blocks #85 and #86, and #62, #64 and #65 are closed outside neighbours. Check the current shape with `$W api "/api/issues?repo=yordanalexandrov/WorkDash"`, which gives each issue's `parent`, `subIssues` and `dependencies`.

Steps:

- **Marks.** Run `$W browser text --css "[data-flip='issue:yordanalexandrov/WorkDash#84']"`, which shows „блокиран“. For #79 it shows „0/4“.
- **Table.**
  1. Run `$W browser press t`.
  2. Run `$W browser click --role radio --name "родител" --within ".tbar"`. A group „#79 Зависимости“ appears, with „Без родител“ last.
  3. Run `$W browser click --role columnheader --name "блокиран от"`. The header reads „блокиран от▼“, and the blocked rows show „1“.
- **Graph of a sub-issue.**
  1. Run `$W browser click --css "[data-flip='issue:yordanalexandrov/WorkDash#84'] .age"`.
  2. Run `$W browser wait --css "[role=dialog] .deps svg g.node"`.
  3. Run `$W browser press f`.
  4. Run `$W browser scroll --name "Зависимости" --within "[role=dialog]"`.
  5. Take a screenshot in light, then with `--scheme dark`. #84 has a blue border, #85 and #86 `--pending`, and #65 is dotted.
- **Graph of a parent.** Open #79 the same way. #79 is the open node (blue), with arrows from #62, #64 and #65 into it.
- **Navigation by mouse.** Run `$W browser click --role link --name "#83" --within "[role=dialog] .deps"`, then `$W browser wait --text "<a phrase from #83's body>"`. `$W browser tabs` still lists one tab.
- **Navigation by keyboard.**
  1. Wait for `[role=dialog] .deps svg g.node`.
  2. Run `$W browser tab-to --role link --name "#84" --within "[role=dialog] .deps"`, and take a screenshot to show the focus ring.
  3. Run `$W browser press Enter`. The sheet now shows #84.
- **GitHub in a new tab.** A node that is not in the snapshot opens GitHub. Prove it with `$W browser tabs`, where a `github.com/...` line shows up, then run `$W browser tabs --close-others`.
- **Proof.** Save under `$($W evidence)/dependencies/`:
  - the screenshots of both graphs in both themes;
  - the focus-ring shot;
  - the aria tree, where nodes show as `link "#n …"`;
  - the `/api/issues` output.

## Gotchas

- The graph renders after its own request, so the sheet opens first. Before you click a node, wait for `[role=dialog] .deps svg g.node`, again after every switch.
- Nodes are SVG `<g role=link>` with an `aria-label` of `#n title`, so use `--role link`. They have no `innerText`, so `text --css` on a node is empty; read `.deps` instead.
- Every node of the #79 family is in the snapshot: open and recently closed issues both count. „GitHub in a new tab“ is therefore reachable only from an issue whose blocker is in another repo, or was closed outside the closed window. With none in the data, report it as `verified-unreachable`, with that precondition.
- „още N“ shows only when the token can't see some linked issues. A token that reads the whole public repo never shows it.
- `f` stays on across sheets, after a node switch and after Esc. On the next sheet, check the ⤢/Свий button before pressing `f`, or it narrows the sheet back.
- The graph is fetched at most once a minute per issue. A reopen within the minute draws the saved graph without a new request.
