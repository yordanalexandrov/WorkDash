// Updates the Docker deployment to one commit, the same way every time: `npm run deploy [-- <ref>]`, origin/main by default.
// The image is built from `git archive` of that commit, not from the working tree, so uncommitted changes, untracked
// files and whatever branch is checked out never reach it. It is tagged workdash:<sha> and labelled with the sha;
// a commit that is already built is not rebuilt. The container is recreated from it without building, and the
// script waits until the running container reports that sha and the dashboard answers.

import { execFileSync } from "node:child_process";

const IMAGE = "workdash";
const SERVICE = "workdash";

function run(command: string, args: string[], input?: Buffer): string {
  return execFileSync(command, args, { input, encoding: "utf8", stdio: [input ? "pipe" : "inherit", "pipe", "inherit"], maxBuffer: 1 << 30 }).trim();
}

function imageExists(tag: string): boolean {
  try {
    execFileSync("docker", ["image", "inspect", tag], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean | Promise<boolean>, what: string, seconds = 60): Promise<void> {
  for (let left = seconds; left > 0; left--) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timed out after ${seconds}s waiting for ${what}`);
}

const ref = process.argv[2] ?? "origin/main";
if (ref.startsWith("origin/")) run("git", ["fetch", "--quiet", "origin"]);
const sha = run("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
const tag = `${IMAGE}:${sha}`;
console.log(`deploying ${ref} = ${sha}`);

if (imageExists(tag)) console.log(`${tag} is already built`);
else {
  const context = execFileSync("git", ["archive", "--format=tar", sha], { maxBuffer: 1 << 30 });
  // The commit's time as every timestamp in the image, so its layers do not depend on when it was built.
  const epoch = run("git", ["show", "-s", "--format=%ct", sha]);
  execFileSync("docker", ["build", "--build-arg", `REVISION=${sha}`, "--tag", tag, "-"], {
    input: context,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, SOURCE_DATE_EPOCH: epoch },
  });
}

run("docker", ["tag", tag, `${IMAGE}:latest`]);
execFileSync("docker", ["compose", "up", "--detach", "--no-build", SERVICE], { stdio: "inherit" });

const container = run("docker", ["compose", "ps", "--quiet", SERVICE]);
const revision = run("docker", ["inspect", "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}', container]);
if (revision !== sha) throw new Error(`the container runs ${revision || "an image without a revision"}, not ${sha}`);

const address = run("docker", ["compose", "port", SERVICE, "3000"]);
await waitFor(async () => (await fetch(`http://${address}/`).catch(() => undefined))?.ok === true, `http://${address}/`);
console.log(`WorkDash ${sha.slice(0, 7)} is up at http://${address}/`);
