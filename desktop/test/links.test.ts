import { describe, expect, it } from "vitest";
import { linkTarget } from "../src/links.js";

const dashboard = "http://127.0.0.1:41234";

describe("where a link from the window goes", () => {
  it("stays in the window for the dashboard's own pages", () => {
    expect(linkTarget("http://127.0.0.1:41234/", dashboard)).toBe("window");
    expect(linkTarget("http://127.0.0.1:41234/settings?x=1#top", dashboard)).toBe("window");
  });

  it("opens web and mail links elsewhere in the default browser", () => {
    expect(linkTarget("https://github.com/my-org/repo-a/pull/7", dashboard)).toBe("browser");
    expect(linkTarget("https://example.atlassian.net/browse/ABC-123", dashboard)).toBe("browser");
    expect(linkTarget("mailto:someone@example.com", dashboard)).toBe("browser");
  });

  it("treats the same host on another port as somewhere else", () => {
    expect(linkTarget("http://127.0.0.1:3000/", dashboard)).toBe("browser");
  });

  it("blocks anything that is not a web or mail link", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "ssh://host", "not a url"]) {
      expect(linkTarget(url, dashboard), url).toBe("blocked");
    }
  });
});
