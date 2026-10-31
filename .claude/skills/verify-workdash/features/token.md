# GitHub token

The user pastes a GitHub token into Settings → GitHub. The server checks it against GitHub before saving it, refuses an invalid one, and from then on shows it only masked, with the login, the scopes and the rate limit. It is stored as `github-token` (mode `600`) in the data directory and never sent back to the browser.

## Sub-features

- `token-save` checks the token, saves it and shows it masked. The setup banner then drops „токен“.
- `token-refuse` shows the reason under the field for a token GitHub rejects, and saves nothing.
- `token-check` makes „Провери“ re-ask GitHub and shows `✓ <login> · scopes: a, b · rate limit n/m, нов в HH:MM:SS`. For a fine-grained token the scopes read „fine-grained токен“, and a failed check reads `✗ <message>`.
- `token-replace` saves a new token with „Смени“.
- `token-rejected-live` handles GitHub refusing the token during a poll: the PR poll stops and a red banner links to Settings.

## How to get to it (user POV)

- Settings → GitHub card → „Токен“ field, then Enter or „Запази“ (or „Смени“ once one is saved).

## Driving it with wd-verify

Preconditions:

- **Needs token**: the user has approved one for this run and put it in an environment variable, e.g. `export WD_TOKEN=…` in the same shell call. Never echo it.
- Settings is open (`$W browser goto /#settings --wait-text "Няма записан токен"`).

- **Refuse a bad token.** Run `$W browser fill --role textbox --name "Токен" --value "ghp_invalid"` and `$W browser press Enter`, then `$W browser wait --text "GitHub отказва токена" --timeout 20000`. „GitHub отказва токена: Bad credentials“ shows under the field, `$W data` lists no `github-token`, and `/api/config` shows `"token":{"set":false,"masked":null}`. This step needs network but no real token. Offline, the message reads „GitHub е недостъпен: …“.
- **Save.** Run `$W browser fill --role textbox --name "Токен" --value-env WD_TOKEN`, `$W browser press Enter` and `$W browser wait --text "rate limit" --timeout 20000`. The field shows the masked form, and the check line shows the login.
- **Side effect.** Run `stat -c %a .verify/current/data/github-token`, which prints `600`. Run `$W api /api/config`, where `token` holds only `set` and `masked`. Don't print the file.
- **Check.** Choose „Провери“ (`$W browser click --role button --name "Провери"`). The check line refreshes.
- **Proof.** Save the aria tree (field values are left out) and a screenshot under `$($W evidence)/token/`, then run `grep -r "$WD_TOKEN" .verify/evidence` and confirm it finds nothing.

## Gotchas

- The token field's accessible name resolves to „Токен“ (its `.set-label`), not to its placeholder.
- `--value` puts the secret in argv and in the transcript. Use `--value-env`.
- The Issue dashboard also needs read access to Issues. The check can't see a fine-grained token's permissions, so a token without Issues access passes it. The failure then shows on the Issue dashboard as „Последният poll е неуспешен: GitHub GraphQL error: …“, with no link to Settings.
- `stop` deletes the data dir, and the token with it. Evidence never holds it, because `aria` leaves values out and the field is a password field.
- The token is a credential: some permission policies block reading it from `gh auth token` without asking. Ask the user.
