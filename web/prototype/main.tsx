// PROTOTYPE: several dashboard layouts on real data, switchable with ?variant=. See README.md.
import { render } from "preact";
import { useState } from "preact/hooks";
import type { DashboardPullRequest, DashboardState } from "../src/api.js";
import { Switcher } from "./Switcher.js";
import type { Variant } from "./types.js";
import * as Current from "./variants/Current.js";
import * as A from "./variants/A.js";
import * as B from "./variants/B.js";
import * as C from "./variants/C.js";
import * as D from "./variants/D.js";
import * as E from "./variants/E.js";
import * as F from "./variants/F.js";
import * as G from "./variants/G.js";
import * as H from "./variants/H.js";

const VARIANTS: Variant[] = [
  { key: "0", ...Current },
  { key: "A", ...A },
  { key: "B", ...B },
  { key: "C", ...C },
  { key: "D", ...D },
  { key: "E", ...E },
  { key: "F", ...F },
  { key: "G", ...G },
  { key: "H", ...H },
];

function initialIndex(): number {
  const key = new URLSearchParams(location.search).get("variant");
  return Math.max(0, VARIANTS.findIndex((variant) => variant.key === key));
}

function Prototype({ snapshot }: { snapshot: DashboardState }) {
  const [state, setState] = useState(snapshot);
  const [index, setIndex] = useState(initialIndex);
  const onSeen = (pr: DashboardPullRequest) => {
    console.log("PROTOTYPE видях (stub)", pr.repo, pr.number);
    setState((old) => ({
      ...old,
      sections: old.sections.map((group) =>
        group.section === "waiting_on_me" ? { ...group, pullRequests: group.pullRequests.filter((p) => p !== pr) } : group,
      ),
    }));
  };
  const change = (next: number) => {
    const url = new URL(location.href);
    url.searchParams.set("variant", VARIANTS[next]!.key);
    history.replaceState(null, "", url);
    scrollTo(0, 0);
    setIndex(next);
  };
  const { View } = VARIANTS[index]!;
  return (
    <>
      <View key={index} state={state} onSeen={onSeen} />
      <Switcher variants={VARIANTS} current={index} onChange={change} />
    </>
  );
}

fetch("snapshot.json")
  .then((response) => response.json() as Promise<DashboardState>)
  .then((snapshot) => render(<Prototype snapshot={snapshot} />, document.body));
