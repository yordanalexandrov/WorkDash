# PROTOTYPE: dashboard layouts

Throwaway. Six radically different layouts of the main dashboard plus today's UI (`0`), rendered from a frozen
`/api/prs` body and switched with `?variant=` or the bottom bar (← / →). Lives only on the
`prototype/dashboard-layouts` branch; the winner gets rewritten properly into `web/src`.

```sh
npm run prototype:snapshot   # once: WORKDASH_PORT=80 if the container is on port 80
npm run prototype            # http://localhost:5180/?variant=A
```

`snapshot.json` holds real work data and is git-ignored. Never commit it.

| key | idea |
| --- | --- |
| 0 | today's repo cards |
| A | inbox: sections nav, PR list, detail pane |
| B | kanban: one column per section |
| C | sortable, filterable table |
| D | wall display for a second screen |
| E | timeline: PRs as bars over time, per repo |
| F | next action: one hero PR, queue, command palette |
| G | animated kanban: drag to видях, replay the day, detail sheet |
| H | G plus a table view (C) on the same page, animated switch |

"видях" is a stub: it drops the PR from "Чака теб" in memory only.
