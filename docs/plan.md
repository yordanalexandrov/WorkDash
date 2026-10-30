# WorkDash — план за MVP

## Проблемът

Работа по няколко GitHub repo-та с няколко колеги означава постоянно отваряне на различни страници,
за да се провери: има ли нови коментари, има ли approve, минал ли е CI, кой чака мен. Смяната на
контекста е изморителна и нещата се изпускат.

## Целта

Едно табло, хоствано локално в Docker, което:

1. показва всички релевантни PR-и на един екран, **сортирани по това какво иска внимание от мен**;
2. пуска **desktop нотификация** само при важни промени;
3. показва линкове към Jira тикетите на всеки PR (без интеграция с Jira API).

Мащаб: github.com, 3–4 repo-та, 3–4 колеги, един потребител (аз). Всичко специфично е в конфигурацията.

## Обхват на MVP

- Секции на таблото: **Чака теб**, **Свободни за review**, **Готови за merge**, **Чакат други**, **Екипът**.
- На всеки PR: CI статус, review-та, непрочетени коментари, merge conflict, възраст, draft, Jira баджове.
- Live обновяване (SSE) и бутон „видях“.
- Нотификации по правила от конфигурацията, с тихи часове.
- Инсталира се като PWA, за да живее в отделен прозорец и да нотифицира, докато е минимизиран.

Извън MVP: snooze, дайджести, статистика, групиране по тикет, host-side `notify-send` агент.

## Архитектура

```
┌─────────────── docker-compose ───────────────┐
│                                              │
│  poller ──GraphQL──▶ GitHub API              │
│    │  (на всеки 60с)                         │
│    ▼                                         │
│  SQLite (snapshot-и, "видяно", събития)      │
│    │                                         │
│    ├─ diff engine → събития → правила        │
│    │                    └──▶ SSE → browser   │
│    ▼                         Notification    │
│  web UI (PWA)                                │
│                                              │
└──────────────────────────────────────────────┘
```

- **Polling, не webhooks:** локалният хост няма публичен URL. Една GraphQL заявка с alias-и дърпа всички
  repo-та наведнъж. При 60 секунди и 4 repo-та rate limit-ът (5000 точки/час) не е проблем.
- **Нотификации през браузъра:** Notification API в PWA прозорец. `localhost` е secure context, затова
  не трябва HTTPS.
- **Потребителят** се определя автоматично от токена (`viewer { login }`).

## Стек

| Част | Избор |
|---|---|
| Runtime | Node 22 + TypeScript |
| HTTP / SSE | Fastify |
| Съхранение | SQLite (`better-sqlite3`) във volume |
| Валидация на конфигурацията | `zod` + `yaml` |
| Frontend | лек: Preact или server-rendered + htmx; PWA manifest + service worker |
| Тестове | Vitest |
| Пакетиране | един Docker image, `docker compose up -d` |

## Конфигурация

`config.yaml` (не се commit-ва, виж `config.example.yaml`) + `.env` с `GITHUB_TOKEN`.
Конфигурацията се презарежда при промяна на файла, без рестарт.

Токен: fine-grained PAT само за четене (Pull requests, Contents/Metadata, Commit statuses, Checks) за
следените repo-та. Ако организацията не позволява fine-grained токени, ползва се classic PAT с `repo`
или `gh auth token`.

## Модел на данните

```ts
type PullRequest = {
  repo: string;            // owner/name
  number: number;
  title: string;
  url: string;
  author: string;
  isDraft: boolean;
  headRef: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  requestedReviewers: string[];
  reviews: { author: string; state: string; submittedAt: string }[];
  comments: { id: string; author: string; createdAt: string; body: string }[]; // issue + review comments
  ci: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;          // statusCheckRollup
  jiraKeys: string[];
};
```

SQLite таблици:

- `pr_snapshot(repo, number, data_json, fetched_at)`: последното известно състояние;
- `pr_seen(repo, number, seen_at)`: кога съм маркирал PR-а като видян;
- `event(id, type, repo, number, created_at, payload_json, delivered)`: генерирани събития.

## GraphQL заявка (скица)

Един alias на repo, всички в една заявка:

```graphql
query {
  viewer { login }
  r0: repository(owner: "OWNER", name: "REPO") { ...prs }
  r1: repository(owner: "OWNER", name: "REPO2") { ...prs }
}

fragment prs on Repository {
  nameWithOwner
  pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
    nodes {
      number title url isDraft body headRefName createdAt updatedAt mergeable reviewDecision
      author { login }
      reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login } } } }
      latestReviews(first: 10) { nodes { author { login } state submittedAt } }
      comments(last: 30) { nodes { id author { login } createdAt body } }
      reviewThreads(last: 30) { nodes { isResolved comments(last: 10) { nodes { id author { login } createdAt body } } } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
}
```

PR, който изчезне от отворените, се дърпа еднократно по номер, за да се разбере дали е merged или closed.
Показва се за кратко и после се маха.

## Класифициране (сърцето на таблото)

`me` е потребителят на токена. „Непрочетен коментар“ е коментар от друг човек, създаден след `pr_seen.seen_at`.

**Мой PR:**

| Условие (първото, което съвпадне) | Секция |
|---|---|
| CI `FAILURE`/`ERROR` | Чака теб |
| `CHANGES_REQUESTED` | Чака теб |
| `CONFLICTING` | Чака теб |
| има непрочетени коментари | Чака теб |
| `APPROVED` + CI `SUCCESS` + `MERGEABLE` + не е draft | Готови за merge |
| иначе | Чакат други |

**Чужд PR:**

В екипа рядко се ползват review requests. PR-ите се споделят в чата на екипа и ги поема който е свободен.
Затова главният сигнал е „кой PR още никой не е взел“, а не „кой ми е поискал review“.

| Условие (първото, което съвпадне) | Секция |
|---|---|
| `me` е в requested reviewers | Чака теб |
| непрочетен коментар, който ме споменава (`@me`) | Чака теб |
| оставил съм review (коментари / changes requested) и след него има нови commit-и или отговор към мен | Чака теб (re-review) |
| авторът е в `team`, не е draft, не е одобрен и не съм го review-вал | Свободни за review |
| авторът е в `team` | Екипът |
| иначе | не се показва |

„Одобрен“ се определя от `reviewDecision`. Ако repo-то няма изискване за review, ползва се
`required_approvals` от конфигурацията (по подразбиране 1). Редът в „Свободни за review“ показва
кой друг вече е оставил review.

Всеки PR в „Чака теб“ носи **причина** (например „review requested“ или „CI failed“), която се показва на реда.
Класифицирането е чиста функция `classify(pr, me, seen, config)` и се покрива с unit тестове.

## Diff и събития

На всеки poll: `diff(previousSnapshot, currentSnapshot, me)` → списък от събития.
Първият poll само записва baseline и не генерира нотификации.

| Събитие | Кога | Нотификация по подразбиране |
|---|---|---|
| `review_requested` | `me` се появи в requested reviewers | да |
| `new_comment_on_my_pr` | нов коментар от друг човек върху мой PR | да |
| `review_on_my_pr` | ново review (approve / changes / comment) върху мой PR | да |
| `ci_failed_on_my_pr` | CI на мой PR премина към `FAILURE`/`ERROR` | да |
| `my_pr_ready_to_merge` | мой PR влезе в „Готови за merge“ | да |
| `mention` | нов коментар, който съдържа `@me` | да |
| `re_review_needed` | нови commit-и или отговор към мен след мое review | да |
| `team_pr_opened` | нов PR (не draft) от човек в `team` | да |

Събитията имат детерминистичен `id` (тип + repo + номер + id на коментара или review-то), за да няма дубликати.
`diff` също е чиста функция с unit тестове.

## Нотификации

1. Backend-ът генерира събития, филтрира ги по `notifications.*` и `quiet_hours` и ги записва в `event`.
2. Пращат се към отворените клиенти през SSE и се маркират `delivered`.
3. Frontend-ът показва `new Notification(...)` и при клик отваря PR-а.
4. Ако няма отворен клиент, недоставените събития се пращат при следващото свързване (последните N, групирани).

## Jira линкове

- Regex: `\b([A-Z][A-Z0-9]+-\d+)\b`, приложен върху branch, заглавие и описание.
- Ако `jira.project_keys` не е празно, остават само ключовете с тези префикси.
- Линк: `jira.base_url + key`.
- Чиста функция `extractJiraKeys(pr, config)` с unit тестове.

## Структура на проекта

```
src/
  config.ts          # зареждане, валидация (zod), hot reload
  github/
    query.ts         # построяване на GraphQL заявката
    client.ts        # fetch + map към PullRequest
  domain/
    classify.ts
    diff.ts
    jira.ts
  db.ts              # SQLite
  poller.ts          # цикъл: fetch → diff → save → emit
  notify.ts          # правила, тихи часове
  server.ts          # Fastify: API, SSE, static
web/
  index.html
  app.ts
  manifest.webmanifest
  sw.js
test/
config.example.yaml
Dockerfile
docker-compose.yml
```

## Стъпки за имплементация

Работата е разделена на вертикални slice-ове като GitHub issues #1–#10, с native blocking връзки
между тях. Всеки issue носи label `ready-for-agent`.

## Отворени въпроси

- Позволява ли организацията fine-grained PAT, или трябва classic?
