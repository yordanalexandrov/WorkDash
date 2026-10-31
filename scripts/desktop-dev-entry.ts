// Gives `npm run desktop` the app's icon in the dock and Alt+Tab without the deb installed: GNOME (on Wayland it
// ignores window icons) takes the icon from a .desktop entry whose StartupWMClass matches the window's class.
//   node scripts/desktop-dev-entry.ts           writes ~/.local/share/applications/workdash-dev.desktop
//   node scripts/desktop-dev-entry.ts --remove  removes it
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FILE = "workdash-dev.desktop";

/** The entry for the app run from the repo at `repo`; the class is `desktopName` in desktop/package.json. */
export function devEntry(repo: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=WorkDash (dev)",
    `Exec=${join(repo, "desktop/node_modules/.bin/electron")} ${join(repo, "desktop")}`,
    `Icon=${join(repo, "web/public/icons/icon-512.png")}`,
    "StartupWMClass=workdash",
    "Terminal=false",
    "",
  ].join("\n");
}

/** Where the user's own .desktop entries live: `$XDG_DATA_HOME/applications`, by default `~/.local/share/applications`. */
export function applicationsDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  return join(env.XDG_DATA_HOME || join(home, ".local/share"), "applications");
}

export function installDevEntry(dir: string, repo: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, FILE);
  writeFileSync(path, devEntry(repo));
  return path;
}

export function removeDevEntry(dir: string): void {
  rmSync(join(dir, FILE), { force: true });
}

function main(args: string[]) {
  const dir = applicationsDir();
  if (args.includes("--remove")) {
    removeDevEntry(dir);
    console.log(`Removed ${join(dir, FILE)}`);
  } else {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    console.log(`Wrote ${installDevEntry(dir, repo)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
