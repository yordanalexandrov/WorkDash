// GitHub-flavoured markdown to HTML for the detail sheet, without the DOM: the HTML still needs sanitizing where it is shown.

import { Marked, Renderer, type Token, type Tokens } from "marked";

const marked = new Marked({
  gfm: true,
  renderer: {
    // Links, also bare URLs, open in a new tab that gets neither the page nor where it came from.
    link(this: Renderer, token: Tokens.Link) {
      return Renderer.prototype.link.call(this, token).replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
    },
  },
});

/**
 * `text` without the HTML comments PR templates leave in it. Removing a comment can join the pieces of another, so it repeats
 * until none is left; an unclosed one hides the rest, as on GitHub.
 */
export function withoutComments(text: string): string {
  let rest = text;
  for (let last = ""; last !== rest; ) {
    last = rest;
    rest = rest.replace(/<!--[\s\S]*?-->/g, "");
  }
  return rest.replace(/<!--[\s\S]*$/, "");
}

/** A mermaid block: the id of its placeholder in the HTML and its code. */
export type Diagram = { id: string; code: string };

/** The ```mermaid blocks among `tokens`, at any depth (in a list, a quote…), but not a fence written inside another block. */
function mermaidBlocks(tokens: Token[]): Tokens.Code[] {
  const blocks: Tokens.Code[] = [];
  void marked.walkTokens(tokens, (token) => {
    if (token.type === "code" && token.lang?.split(/\s/)[0] === "mermaid") blocks.push(token as Tokens.Code);
  });
  return blocks;
}

/**
 * The HTML of `text` without its HTML comments, not yet sanitized, and its mermaid blocks: each one is a placeholder that says
 * the diagram is loading, found by its `data-diagram` id, until the diagram replaces it. The ids are new on every call, so a
 * `data-diagram` the author wrote in HTML cannot take a diagram's place.
 */
export function parseMarkdown(text: string): { html: string; diagrams: Diagram[] } {
  const tokens = marked.lexer(withoutComments(text));
  const nonce = Math.random().toString(36).slice(2, 10);
  const diagrams = mermaidBlocks(tokens).map((block, index) => {
    const diagram = { id: `${nonce}-${index}`, code: block.text };
    const placeholder = `<div class="diagram" data-diagram="${diagram.id}">Диаграмата се зарежда…</div>\n`;
    Object.assign(block, { type: "html", block: true, pre: false, text: placeholder });
    return diagram;
  });
  return { html: marked.parser(tokens), diagrams };
}
