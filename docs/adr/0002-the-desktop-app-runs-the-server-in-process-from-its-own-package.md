# The desktop app runs the server in-process, from its own package

The desktop app starts the same server as the Docker image inside Electron's main process, through one entry point (`startWorkDash`) that takes the data directory, the token store, the address and the web root from its caller instead of the environment. In-process, the tray reads the "Чака теб" count and switches the notification pause without an HTTP or IPC hop of its own. The Electron code lives in `desktop/`, a package with its own `package.json` and `node_modules`, so Electron and electron-builder stay out of the root dependency tree: `npm ci` for the tests, `npm start` and the Docker image does not download Electron, and the deb gets only what `desktop/node_modules` holds. esbuild bundles `desktop/src/main.ts` with `src/` and leaves `better-sqlite3` to `desktop/node_modules`, the one runtime dependency the deb carries.

`better-sqlite3` is a native module, but its prebuilds use N-API, so the `linux-x64` build made for Node loads in Electron as it is: electron-builder runs with `npmRebuild: false` and nothing is rebuilt today. Should a later version need a build for Electron's own ABI, the separate `node_modules` is where it would go, without touching the build that tests and the Docker image use.

## Considered Options

- **Server in a `utilityProcess` or a child process**: isolates a busy poll from the window's event loop, but the tray then needs its own channel to the server, and the poll is small and mostly waiting on the network.
- **One package, with Electron and electron-builder in the root `devDependencies`**: one install, but every `npm ci` (CI, the Docker build stage) downloads Electron, and electron-builder would pack the root's `node_modules` (fastify and the rest, already in the bundle) into the deb. Had `better-sqlite3` needed a build for Electron, `npmRebuild` would also rebuild the root `node_modules` in place and break `npm test` until the next `npm ci`.
- **`node:sqlite` instead of `better-sqlite3`**: no native module at all, but it is still marked experimental in Node 22 and its availability in Electron's Node is not settled.

## Consequences

- `desktop/package.json` pins the same `better-sqlite3` version as the root one; Dependabot watches both.
- The deb keeps only `better-sqlite3`'s `linux-x64` prebuild (electron-builder.yml); a `better-sqlite3` without an N-API prebuild for Linux x64 would need `npmRebuild` back.
- The server serves the page from a web root it is given, since its own path changes once bundled.
