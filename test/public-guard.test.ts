import { describe, expect, it } from "vitest";
import { findLeaks } from "../scripts/public-guard.js";

describe("findLeaks", () => {
  it("passes placeholders, the personal address and GitHub's noreply addresses", () => {
    const text = [
      "jira: https://example.atlassian.net/browse/ABC-123",
      "email: me@example.com",
      "Author: lamercian@gmail.com",
      "72871803+yordanalexandrov@users.noreply.github.com noreply@github.com",
      "origin git@github.com:yordanalexandrov/WorkDash.git",
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
