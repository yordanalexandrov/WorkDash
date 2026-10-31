import { describe, expect, it } from "vitest";
import { resources } from "../src/resources.js";

describe("where the page and the icon are", () => {
  it("is web/ next to desktop/ while running from the repository", () => {
    expect(
      resources({ packaged: false, appPath: "/home/me/workdash/desktop", resourcesPath: "/unused" }),
    ).toEqual({
      webRoot: "/home/me/workdash/web",
      icon: "/home/me/workdash/web/public/icons/icon-512.png",
    });
  });

  it("is web/ in the app's resources once installed from the deb", () => {
    expect(
      resources({
        packaged: true,
        appPath: "/opt/WorkDash/resources/app.asar",
        resourcesPath: "/opt/WorkDash/resources",
      }),
    ).toEqual({
      webRoot: "/opt/WorkDash/resources/web",
      icon: "/opt/WorkDash/resources/web/public/icons/icon-512.png",
    });
  });
});
