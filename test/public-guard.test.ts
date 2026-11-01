import { describe, expect, it } from "vitest";
import { findFileLeaks, findLeaks, parseDenylist } from "../scripts/public-guard.js";

describe("findLeaks", () => {
  it("passes placeholders, the personal address and GitHub's own addresses, Dependabot's sign-off too", () => {
    const text = [
      "jira: https://example.atlassian.net/browse/ABC-123",
      "email: me@example.com",
      "Author: lamercian@gmail.com",
      "72871803+yordanalexandrov@users.noreply.github.com noreply@github.com",
      "origin git@github.com:yordanalexandrov/WorkDash.git",
      "Signed-off-by: dependabot[bot] <support@github.com>",
      "Co-authored-by: dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>",
    ].join("\n");
    expect(findLeaks(text)).toEqual([]);
  });

  it("flags any other email address and Jira instance, by line", () => {
    // Split so this file does not trip the guard itself.
    const text = ["fine", "ping someone" + "@corp.example.io", "https://acme" + ".atlassian.net/browse/X-1"].join("\n");
    expect(findLeaks(text)).toEqual([
      { line: 2, kind: "email address" },
      { line: 3, kind: "Jira instance" },
    ]);
  });

  it("flags a denylisted term as a whole word, ignoring case", () => {
    const denylist = ["Acme", "jdoe", "PROJ"];
    expect(findLeaks("Built for ACME\nreviewed by jdoe\nfixes PROJ-42", denylist)).toEqual([
      { line: 1, kind: "denylisted term" },
      { line: 2, kind: "denylisted term" },
      { line: 3, kind: "denylisted term" },
    ]);
    expect(findLeaks("acmes jdoes-x xjdoe", denylist)).toEqual([]);
  });

  it("matches denylisted terms in Cyrillic too", () => {
    expect(findLeaks("работа за Фирма ООД", ["фирма"])).toEqual([{ line: 1, kind: "denylisted term" }]);
  });
});

describe("findFileLeaks", () => {
  // Split so this file does not trip the guard itself.
  const authorEmail = '"author": "someone' + '@corp.example.io"';

  it("lets package authors' addresses through in an npm lockfile, wherever it lives", () => {
    expect(findFileLeaks("package-lock.json", authorEmail)).toEqual([]);
    expect(findFileLeaks("desktop/package-lock.json", authorEmail)).toEqual([]);
  });

  it("still flags Jira instances and denylisted terms in a lockfile", () => {
    const text = ['"resolved": "https://acme' + '.atlassian.net/x.tgz"', '"name": "@initech/tool"'].join("\n");
    expect(findFileLeaks("desktop/package-lock.json", text, ["initech"])).toEqual([
      { line: 1, kind: "Jira instance" },
      { line: 2, kind: "denylisted term" },
    ]);
  });

  it("checks emails in files that only end like a lockfile", () => {
    expect(findFileLeaks("docs/my-package-lock.json", authorEmail)).toEqual([{ line: 1, kind: "email address" }]);
  });
});

describe("parseDenylist", () => {
  // A one-line secret is masked whole in the Actions log; a multi-line one is masked line by line at best.
  it("takes terms one per line or comma-separated, skipping blanks and # comments", () => {
    expect(parseDenylist("# names\nAcme, jdoe\n\n  PROJ ,\n")).toEqual(["Acme", "jdoe", "PROJ"]);
  });
});
