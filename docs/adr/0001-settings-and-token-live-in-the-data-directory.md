# Settings and the token live in the data directory

The dashboard keeps everything it owns, the database, `config.yaml` and the GitHub token, in one data directory (`DATA_DIR`): the Docker volume, `data/` under `npm start`, Electron's `userData` later. The host's `config.yaml` and the token in `.env` are read once, on the first start with an empty data directory, and never again. Settings are changed from the Settings screen, which needs a writable place that is the dashboard's own and the same in every way of running it; a file next to `docker-compose.yml` would need a read-write mount of the project directory and would not exist in the desktop app at all.

## Considered Options

- **Read-write mount of `./`**: keeps hand-editing on the host, but the container writes into the project directory and the desktop app still needs another home for the same files.
- **Token in `.env` only**: the token could not be entered or replaced from the dashboard.

## Consequences

- The token is stored as a plain-text file with mode `0600` behind a small token store. Encrypting it with a key kept next to it would add nothing; the OS keychain (Electron `safeStorage`) replaces the store when the desktop app comes.
- `config.yaml` can still be read and fixed by hand inside the data directory (`docker exec`), and the hot reload and the conflict check on save keep working for that.
- `GITHUB_TOKEN` in the environment only seeds the first start; a stored token wins afterwards.
