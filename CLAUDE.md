# WorkDash

## Public repository: no employer data

This repository is public. Never put anything that identifies the author's employer or its internal work into files, commit messages, branch names, issues, PR descriptions or comments:

- company or product names, or the internal repositories the dashboard is used with;
- colleagues' names or GitHub logins;
- Jira instance URLs, Jira project keys or real ticket numbers;
- work email addresses (commits in this repo use the personal address set in the repo-local git config);
- details of internal processes or tools beyond what the feature itself needs.

Real values belong only in the git-ignored `config.yaml` and `.env`. Examples use placeholders (`my-org/repo-a`, `colleague1`, `ABC-123`, `example.atlassian.net`). Before every commit, push or publish to GitHub, scan what is about to go out for such data and stop if anything matches. `npm run guard -- main..HEAD` does that scan for emails, Jira hosts and the private terms in `.public-guard-denylist`; the `Public` workflow runs it on every PR, but a PR is already public, so run it before pushing.

## UI design

Before adding or changing anything the dashboard shows (`web/`), read `docs/design.md`: the board and table views, colour roles, motion and copy conventions every feature follows.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues of yordanalexandrov/WorkDash (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
