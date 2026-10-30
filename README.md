# WorkDash

Локално табло за GitHub pull request-и: всичко, което иска внимание от мен, на един екран, с desktop
нотификации при важни промени.

- PR-и от няколко repo-та, групирани по действие: **Чака теб**, **Свободни за review**, **Готови за merge**, **Чакат други**, **Екипът**.
- CI, review-та, непрочетени коментари, конфликти и Jira линкове на всеки ред.
- Нотификации само за важното, по правила от конфигурацията.
- Хоства се локално с Docker.

> Статус: по една карта за всяко repo, а в нея PR-ите са разделени по секции. На всеки ред има CI, review-та, mergeability (conflict, needs rebase, blocked),
> draft, възраст и баджове с Jira тикетите. Непрочетените коментари и нотификациите предстоят. Виж [docs/plan.md](docs/plan.md).

Чии PR-и влизат в „Свободни за review“ и „Екипът“, се определя от `team`. Когато repo-то не изисква review
и GitHub не дава решение, PR-ът се смята за одобрен при `review.required_approvals` одобрения (по подразбиране 1).

Jira ключовете (`ABC-123`) се вадят от branch-а, заглавието и описанието на PR-а и стават линкове към
`jira.base_url` + ключа. С `jira.project_keys` остават само ключовете на тези проекти. Без `jira.base_url`
баджове няма. Към Jira не се правят заявки.

## Конфигурация

```sh
cp config.example.yaml config.yaml   # repo-та, колеги, Jira, правила за нотификации
echo "GITHUB_TOKEN=..." > .env       # read-only токен
```

`config.yaml` и `.env` не се commit-ват.

Токен: fine-grained PAT с достъп само за четене до следените repo-та (Pull requests, Contents/Metadata,
Commit statuses, Checks). Ако организацията не позволява fine-grained токени, ползвай classic PAT с `repo`
или `gh auth token`. Текущият потребител се определя от токена.

Конфигурацията се валидира при старт. При грешка процесът спира и съобщението казва кое поле е грешно.

## Пускане

```sh
docker compose up -d --build
```

Таблото е на <http://localhost:3000>. Списъкът се обновява на всеки `github.poll_interval`.
Последният snapshot се пази в SQLite във volume `workdash-data`, затова след рестарт таблото показва
запазените данни още преди първия нов poll.

Портът на хоста се сменя с `WORKDASH_PORT` в `.env`. Например за <http://dash>:

```sh
echo "WORKDASH_PORT=80" >> .env
echo "127.0.0.1 dash" | sudo tee -a /etc/hosts
```

Логове: `docker compose logs -f`. След промяна на `config.yaml`: `docker compose restart`.

## Разработка

```sh
npm install
npm test             # Vitest
npm run typecheck
npm run build && node dist/main.js
npm run watch:web    # пресглобява web/dist/app.js при промяна в web/src
```

Frontend-ът е Preact (TSX) в `web/src`, сглобен от esbuild в `web/dist`; статичните файлове са в `web/public`.

Без Docker приложението чете `config.yaml` и пише в `data/workdash.db` в текущата директория и слуша на
`127.0.0.1:3000`. Пътищата и адресът се сменят с `CONFIG_PATH`, `DB_PATH`, `HOST` и `PORT`. Токенът се
чете от env променливата, посочена в `github.token_env`.
