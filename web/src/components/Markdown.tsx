import DOMPurify from "dompurify";
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { parseMarkdown } from "../markdown.js";

// The default profile drops `target`, so every link, also one written as HTML, gets it back here, with a safe `rel`.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return;
  node.setAttribute("target", "_blank");
  node.setAttribute("rel", "noopener noreferrer");
});

type MermaidTheme = "dark" | "default";

/** Mermaid's theme for the page's as it is now. */
export const mermaidTheme = (): MermaidTheme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default");

/** The SVG of each diagram drawn so far by theme and code, or null when it cannot be drawn; a sheet opened again reuses it. */
const drawn = new Map<string, Promise<string | null>>();
let renders = 0;

/**
 * The SVG of `code` in `theme`, or null when it has an error. Mermaid is loaded the first time a diagram is drawn; if that
 * fails, the diagram shows as code this time and is tried again the next. Every diagram is drawn through here, the
 * Dependency graph's too, so mermaid's global config (strict security) is always the same.
 */
export function draw(code: string, theme: MermaidTheme): Promise<string | null> {
  const key = `${theme}\n${code}`;
  let svg = drawn.get(key);
  if (!svg) {
    svg = import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme });
      const id = `mermaid-${++renders}`;
      try {
        return (await mermaid.render(id, code)).svg;
      } catch {
        // A failed render can leave its scratch element behind.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        return null;
      }
    }, () => {
      drawn.delete(key);
      return null;
    });
    drawn.set(key, svg);
  }
  return svg;
}

/** The diagram's placeholder becomes its SVG at its natural width (wider than the column, it scrolls), or its code and an error line. */
function fill(placeholder: HTMLElement, code: string, svg: string | null): void {
  if (svg === null) {
    const pre = document.createElement("pre");
    pre.appendChild(document.createElement("code")).textContent = code;
    const error = document.createElement("p");
    error.className = "diagram-error";
    error.textContent = "Диаграмата не може да се покаже";
    placeholder.replaceWith(pre, error);
    return;
  }
  placeholder.innerHTML = svg;
  placeholder.classList.add("drawn");
  atNaturalWidth(placeholder);
}

/** The diagram drawn in `box` at its natural width, which mermaid shrinks to the column: a wider one scrolls across. */
export function atNaturalWidth(box: HTMLElement): void {
  const image = box.querySelector("svg");
  const width = image?.viewBox.baseVal?.width;
  if (image && width) {
    image.style.maxWidth = "none";
    image.setAttribute("width", `${width}`);
    image.removeAttribute("height");
  }
}

type MarkdownProps = {
  /** Raw GitHub-flavoured markdown. */
  text: string;
  class?: string;
};

/**
 * `text` as GitHub-flavoured markdown, sanitized with DOMPurify, with its ```mermaid blocks drawn as diagrams once mermaid
 * has loaded (in the theme the page has then). It knows nothing of PRs. The same text is neither parsed nor drawn again.
 */
export function Markdown({ text, class: className }: MarkdownProps) {
  const root = useRef<HTMLDivElement>(null);
  const { html, diagrams } = useMemo(() => {
    const parsed = parseMarkdown(text);
    return { html: DOMPurify.sanitize(parsed.html), diagrams: parsed.diagrams };
  }, [text]);

  useLayoutEffect(() => {
    if (!diagrams.length) return;
    let live = true;
    const theme = mermaidTheme();
    for (const { id, code } of diagrams) {
      void draw(code, theme).then((svg) => {
        const placeholder = root.current?.querySelector<HTMLElement>(`[data-diagram="${id}"]:not(.drawn)`);
        if (live && placeholder) fill(placeholder, code, svg);
      });
    }
    return () => {
      live = false;
    };
  }, [html]);

  return <div ref={root} class={className ? `md ${className}` : "md"} dangerouslySetInnerHTML={{ __html: html }} />;
}
