# Poll mode

The top bar switches between polling GitHub on every interval („⟳ На всеки 60s“) and only on demand („✋ При поискване“). In on-demand mode the server polls when the dashboard opens or regains focus (at most once per 30s) and on „Обнови“ or `r`. There is one mode on the server, shared by the PR and Issue dashboards and by every open page. It survives a reload and a restart. „Обнови“ and `r` act on the dashboard being shown. The Issue dashboard is also polled when it opens and on focus (at most once a minute) in both modes, and on the interval only in „На всеки“. That interval is driven by the open page.

## Sub-features

- `poll-mode-switch` shows the chosen radio as checked and stores it on the server (`pollMode` in `/api/prs`).
- `poll-mode-persist` keeps the mode after a reload.
- `poll-now` makes „Обнови“ or `r` poll now; the button spins while the poll runs. **Needs token** for a real poll.
- `poll-interval-label` shows the interval from Settings on the first radio („На всеки 5 мин“).
- `poll-mode-shared` keeps the same mode on the Issue dashboard. Only `/api/prs` carries `pollMode`; `/api/issues` has none.

## How to get to it (user POV)

- The `Обновяване` radiogroup in the top bar.
- „Обнови“ in the top bar, or `r` while focus is not in a field.

## Driving it with wd-verify

Preconditions:

- A healthy run. A token is needed only for `poll-now`.

- **Switch to on demand.** Run `$W browser click --role radio --name "При поискване"`. In `$W browser aria`, the radio `✋ При поискване` has `[checked=true]`.
- **Side effect.** Run `$W api /api/prs` and check that `"pollMode":"on_demand"`.
- **Persistence.** Run `$W browser goto / --wait-text "WorkDash"` and take `aria` again. The radio is still checked.
- **Shared with Issues.** Run `$W browser press i`. On `?dashboard=issues`, `aria` still shows „✋ При поискване“ checked.
- **Switch back.** Run `$W browser click --role radio --name "На всеки"` (on either dashboard). `/api/prs` now shows `"pollMode":"periodic"`.
- **Poll now (needs token).** Run `$W browser press r` or `$W browser click --role button --name "Обнови"`. The status line's „преди …“ time resets, and `fetchedAt` in `/api/prs` moves forward.
- **Proof.** Save the aria trees before and after, the `/api/prs` excerpt and the screenshot after the reload under `$($W evidence)/poll-mode/`.

## Gotchas

- The aria tree names the button „Обнови“ (its ⟳ is `aria-hidden`), but the helper matches its innerText „⟳ Обнови“. Don't pass `--exact "Обнови"`. During a rate limit it reads „Обнови (след HH:MM)“ and is disabled.
- Without a token there are no Issue tabs, so „Обнови“ on Issues does nothing.
- Without a token, „Обнови“ polls nothing: the state stays `fetchedAt=null`. That is not proof that `poll-now` works.
- The mode is server-wide. A second open tab of the same instance flips too, which is a sub-feature and not a bug.
