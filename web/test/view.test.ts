import { describe, expect, it } from "vitest";
import { readView, writeView } from "../src/view.js";

describe("readView", () => {
  it("opens the table for ?view=table and the board otherwise", () => {
    expect(readView("?view=table")).toBe("table");
    expect(readView("")).toBe("board");
    expect(readView("?view=cards")).toBe("board");
    expect(readView("?q=1&view=table")).toBe("table");
  });
});

describe("writeView", () => {
  it("puts the table in the URL and takes it out for the board, keeping the other parameters", () => {
    expect(writeView("http://localhost:3000/?q=1", "table")).toBe("http://localhost:3000/?q=1&view=table");
    expect(writeView("http://localhost:3000/?view=table&q=1#x", "board")).toBe("http://localhost:3000/?q=1#x");
    expect(writeView("http://localhost:3000/?view=table", "board")).toBe("http://localhost:3000/");
  });
});
