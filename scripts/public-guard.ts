// Fails when something that identifies the author's employer is about to go public: see "Public repository" in CLAUDE.md.
// Scans tracked files, commit authors and messages in a range, and the PR title and body.
// Real names, logins and Jira keys come from a private denylist: the PUBLIC_GUARD_DENYLIST secret in CI,
// the git-ignored .public-guard-denylist locally. In the secret keep them on one line, comma-separated, so the log masks it whole.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type Leak = { line: number; kind: "email address" | "Jira instance" | "denylisted term" };

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const ALLOWED_EMAIL = /^(?:lamercian@gmail\.com|[\w.+-]+@users\.noreply\.github\.com|noreply@github\.com|git@github\.com|[\w.+-]+@example\.(?:com|org|net))$/i;
const JIRA = /([\p{L}\p{N}-]+)\.atlassian\.net/giu;
const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/** Every line of `text` that leaks an email address, a Jira instance or a denylisted term; the first leak per line. */
export function findLeaks(text: string, denylist: string[] = []): Leak[] {
  const terms = denylist.map((term) => new RegExp(`(?<![\\p{L}\\p{N}_])${term.replace(ESCAPE, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu"));
  const leaks: Leak[] = [];
  text.split("\n").forEach((content, index) => {
    const line = index + 1;
    if ([...content.matchAll(EMAIL)].some(([email]) => !ALLOWED_EMAIL.test(email))) leaks.push({ line, kind: "email address" });
    else if ([...content.matchAll(JIRA)].some(([, host]) => host!.toLowerCase() !== "example")) leaks.push({ line, kind: "Jira instance" });
    else if (terms.some((term) => term.test(content))) leaks.push({ line, kind: "denylisted term" });
  });
  return leaks;
}

/** Terms one per line or comma-separated; blank lines and lines starting with # are skipped. */
export function parseDenylist(raw: string): string[] {
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .flatMap((line) => line.split(","))
    .map((term) => term.trim())
    .filter(Boolean);
}

function readDenylist(): string[] {
  return parseDenylist(process.env.PUBLIC_GUARD_DENYLIST ?? (existsSync(".public-guard-denylist") ? readFileSync(".public-guard-denylist", "utf8") : ""));
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// Leaks are reported by place and kind only: the log is public, the denylisted term must not land in it.
function main(range: string | undefined) {
  const denylist = readDenylist();
  if (denylist.length === 0) console.warn("No denylist: checking emails and Jira hosts only.");
  const found: string[] = [];
  const report = (where: string, text: string) => findLeaks(text, denylist).forEach(({ line, kind }) => found.push(`${where}:${line}: ${kind}`));

  for (const path of git("ls-files", "-z").split("\0")) {
    // npm writes the lockfiles from the registry: package authors' addresses, not ours.
    if (!path || path.endsWith("package-lock.json")) continue;
    const content = readFileSync(path);
    if (!content.includes(0)) report(path, content.toString("utf8"));
  }
  if (range) {
    for (const sha of git("rev-list", range).split("\n").filter(Boolean)) {
      report(`commit ${sha.slice(0, 7)}`, git("show", "-s", "--format=%an <%ae>%n%cn <%ce>%n%B", sha));
    }
  }
  if (process.env.PR_TEXT) report("PR title and body", process.env.PR_TEXT);

  if (found.length > 0) {
    console.error(found.join("\n"));
    console.error(`\n${found.length} possible leak(s) of employer data; see "Public repository" in CLAUDE.md.`);
    process.exit(1);
  }
  console.log("No employer data found.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv[2]);
