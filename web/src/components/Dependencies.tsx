import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { IssueBoardState } from "../api.js";
import type { ShownIssue } from "../issueDetail.js";
import { type DrawnGraph, familyGraph, graphMermaid, graphSummary } from "../issueGraph.js";
import { useIssueGraph } from "../useIssueGraph.js";
import { atNaturalWidth, draw, mermaidTheme } from "./Markdown.js";

const FAILED = "Графът не може да се зареди";

type DependenciesProps = {
  issue: ShownIssue;
  /** The open repo's issues as they are now: a poll that changes the family drawn fetches the graph again. */
  board: IssueBoardState | null;
};

/**
 * The detail sheet's "Зависимости" ("Anatomy" → Detail sheet in docs/design.md): the summary line, with a spinner while
 * the graph loads, then the Dependency graph at its natural width. A failure says so here and nowhere else.
 */
export function Dependencies({ issue, board }: DependenciesProps) {
  const { family, loading, failed } = useIssueGraph(issue, board);
  const graph = useMemo(() => (family ? familyGraph(family) : null), [family]);
  const summary = graphSummary(issue, board, family);
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
      {graph ? <GraphDrawing graph={graph} /> : null}
    </section>
  );
}

/**
 * The graph drawn by mermaid (loaded on first use, as for a description's diagrams), its nodes coloured by their classes
 * in style.css (`.graph g.node.<mark>`), so it follows the theme without drawing again.
 */
function GraphDrawing({ graph }: { graph: DrawnGraph }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const code = useMemo(() => graphMermaid(graph), [graph]);

  useLayoutEffect(() => {
    let live = true;
    void draw(code, mermaidTheme()).then((svg) => {
      const el = box.current;
      if (!live || !el) return;
      setFailed(svg === null);
      el.innerHTML = svg ?? "";
      if (svg === null) return;
      atNaturalWidth(el);
      // Each node is `g.node` with an id ending in `-flowchart-<node id>-<n>`: `graph.nodes` says its issue.
    });
    return () => {
      live = false;
    };
  }, [code]);

  return (
    <>
      {failed ? <p class="none">{FAILED}</p> : null}
      <div ref={box} class="graph" hidden={failed} />
    </>
  );
}
