# The desktop app runs the server in-process, from its own package

The desktop app starts the same server as the Docker image inside Electron's main process, through one entry point (`startWorkDash`) that takes the data directory, the token store, the address and the web root from its caller instead of the environment. In-process, the tray reads the "Чака теб" count and switches the notification pause without an HTTP or IPC hop of its own. The Electron code lives in `desktop/`, a package with its own `package.json` and `node_modules`: `better-sqlite3` is a native module, and Electron needs it built for its own Node ABI while tests, `npm start` and the Docker image need it built for Node. A separate install keeps both builds side by side; esbuild bundles `desktop/main.ts` with `src/` and leaves `better-sqlite3` to `desktop/node_modules`.

## Considered Options

- **Server in a `utilityProcess` or a child process**: isolates a busy poll from the window's event loop, but the tray then needs its own channel to the server, and the poll is small and mostly waiting on the network.
- **One package, rebuilt for Electron before packaging** (`electron-builder` `npmRebuild`): rebuilds the root `node_modules` in place, so `npm test` breaks after every desktop build until the next `npm ci`.
- **`node:sqlite` instead of `better-sqlite3`**: no native module at all, but it is still marked experimental in Node 22 and its availability in Electron's Node is not settled.

## Consequences

- `desktop/package.json` pins the same `better-sqlite3` version as the root one; Dependabot watches both.
- The server serves the page from a web root it is given, since its own path changes once bundled.
