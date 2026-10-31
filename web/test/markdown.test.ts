import { describe, expect, it } from "vitest";
import { hasMermaid, parseMarkdown } from "../src/markdown.js";

describe("parseMarkdown", () => {
  it("turns a GFM table into a table", () => {
    const { html } = parseMarkdown("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>2</td>");
  });

  it("turns a task list into checkboxes that cannot be ticked", () => {
    const { html } = parseMarkdown("- [x] tests\n- [ ] docs");
    const boxes = html.match(/<input[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => box.includes('type="checkbox"') && box.includes("disabled"))).toBe(true);
    expect(boxes[0]).toContain("checked");
    expect(boxes[1]).not.toContain("checked");
  });

  it("opens links, also bare URLs, in a new tab without handing over the page", () => {
    const { html } = parseMarkdown("See [the docs](https://example.com/docs) and https://example.com/x");
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
    }
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain(">the docs</a>");
  });

  it("puts a placeholder for each mermaid block and lists its code under the placeholder's id", () => {
    const { html, diagrams } = parseMarkdown("Flow:\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n```mermaid\npie\n```");
    expect(diagrams.map((d) => d.code)).toEqual(["graph TD\n  A --> B", "pie"]);
    expect(new Set(diagrams.map((d) => d.id)).size).toBe(2);
    for (const { id } of diagrams) expect(html).toContain(`data-diagram="${id}"`);
    expect(html).toContain("Диаграмата се зарежда…");
    expect(html).not.toContain("A --&gt; B");
  });

  it("leaves out HTML comments, also an unclosed one, which hides the rest as on GitHub", () => {
    const { html } = parseMarkdown("Done.<!-- template hint -->\n\nMore\n<!-- unfinished\n\nhidden");
    expect(html).not.toContain("template hint");
    expect(html).not.toContain("hidden");
    expect(html).toContain("More");
  });

  it("leaves any other code block as code", () => {
    const { html, diagrams } = parseMarkdown("```ts\nconst a = 1 < 2;\n```");
    expect(diagrams).toEqual([]);
    expect(html).toContain("<pre><code");
    expect(html).toContain("const a = 1 &lt; 2;");
  });
});

describe("hasMermaid", () => {
  it("finds a mermaid block, also one in a list", () => {
    expect(hasMermaid("Flow:\n\n```mermaid\ngraph TD\n```")).toBe(true);
    expect(hasMermaid("- step\n\n  ```mermaid\n  pie\n  ```")).toBe(true);
  });

  it("finds none in plain text or other code", () => {
    expect(hasMermaid("Mentions mermaid but has no diagram.")).toBe(false);
    expect(hasMermaid("```ts\nconst a = 1;\n```")).toBe(false);
  });

  it("does not count a mermaid fence written inside another code block", () => {
    expect(hasMermaid("````md\n```mermaid\ngraph TD\n```\n````")).toBe(false);
  });
});
