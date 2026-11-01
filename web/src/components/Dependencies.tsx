import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { GraphIssue } from "../../../src/domain/issue-graph.js";
import type { IssueBoardState } from "../api.js";
import type { ShownIssue } from "../issueDetail.js";
import { type DrawnGraph, familyGraph, graphMermaid, graphNodeAt, graphSummary, hiddenNote, nodeLabel } from "../issueGraph.js";
import { useIssueGraph } from "../useIssueGraph.js";
import { atNaturalWidth, draw, mermaidTheme } from "./Markdown.js";

const FAILED = "Графът не може да се зареди";

type DependenciesProps = {
  issue: ShownIssue;
  /** The open repo's issues as they are now: a poll that changes the family drawn fetches the graph again. */
  board: IssueBoardState | null;
  /** A node was opened: clicked, or Enter on it. */
  onOpen(issue: GraphIssue): void;
};

/**
 * The detail sheet's "Зависимости" ("Anatomy" → Detail sheet in docs/design.md): the summary line, with a spinner while
 * the graph loads, then the Dependency graph at its natural width, and "още N" under it when GitHub counts issues the
 * token cannot see. A failure says so here and nowhere else.
 */
export function Dependencies({ issue, board, onOpen }: DependenciesProps) {
  const { family, loading, failed } = useIssueGraph(issue, board);
  const graph = useMemo(() => (family ? familyGraph(family) : null), [family]);
  const summary = graphSummary(issue, board, family);
  const more = family ? hiddenNote(family) : null;
  return (
    <section class="deps" aria-busy={loading}>
      <h3>Зависимости</h3>
      {summary || loading ? (
        <p class="deps-summary">
          {summary}
          {loading ? <span class="spinner" role="status" aria-label="графът се зарежда" /> : null}
        </p>
      ) : null}
      {failed ? <p class="none">{FAILED}</p> : null}
      {graph ? <GraphDrawing graph={graph} onOpen={onOpen} /> : null}
      {more ? (
        <p class="deps-more" title="GitHub ги брои, но токенът не ги вижда">
          {more}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The graph drawn by mermaid (loaded on first use, as for a description's diagrams), its nodes coloured by their classes
 * in style.css (`.graph g.node.<mark>`), so it follows the theme without drawing again. Each node is a link to its issue,
 * in Tab's order with the `--blue` focus ring: a click or Enter calls `onOpen`.
 */
function GraphDrawing({ graph, onOpen }: { graph: DrawnGraph; onOpen(issue: GraphIssue): void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const code = useMemo(() => graphMermaid(graph), [graph]);
  // The latest of both for the nodes' listeners, which stay as long as the SVG they are on.
  const latest = useRef({ graph, onOpen });
  latest.current = { graph, onOpen };

  useLayoutEffect(() => {
    let live = true;
    void draw(code, mermaidTheme()).then((svg) => {
      const el = box.current;
      if (!live || !el) return;
      setFailed(svg === null);
      el.innerHTML = svg ?? "";
      if (svg === null) return;
      atNaturalWidth(el);
      for (const g of el.querySelectorAll<SVGGElement>("g.node")) linkNode(g);
    });
    return () => {
      live = false;
    };
  }, [code]);

  /** A drawn node (`g.node`, its id ending in `-flowchart-<node id>-<n>`) made a link to the issue `graph.nodes` says. */
  const linkNode = (g: SVGGElement) => {
    const node = graphNodeAt(latest.current.graph, g.id);
    if (!node) return;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "link");
    g.setAttribute("aria-label", nodeLabel(node.issue, latest.current.graph.repo));
    const open = () => {
      const now = graphNodeAt(latest.current.graph, g.id);
      if (now) latest.current.onOpen(now.issue);
    };
    g.addEventListener("click", open);
    g.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      open();
    });
  };

  return (
    <>
      {failed ? <p class="none">{FAILED}</p> : null}
      <div ref={box} class="graph" hidden={failed} />
    </>
  );
}
