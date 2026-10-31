import { useLayoutEffect, useRef } from "preact/hooks";

/** A tab: `name` is shown, `repo` is the full name, `hue` its project colour. */
export type IssueTab = { repo: string; name: string; hue: number };

type IssueTabsProps = {
  tabs: IssueTab[];
  /** The repo of the open tab. */
  open: string | null;
  onOpen(repo: string): void;
};

/**
 * The Issue dashboard's tabs, one per repo whose issues are on, each in its project colour and without a count. Under the
 * open one lies an ink in its colour that glides to the next tab opened (transform only, so the bar never lays out again).
 */
export function IssueTabs({ tabs, open, onOpen }: IssueTabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLSpanElement>(null);
  // The first time the ink shows, it is put in place, not glided there from the corner.
  const placed = useRef(false);
  useLayoutEffect(() => {
    const tab = list.current?.querySelector<HTMLElement>(".repo-tab.on");
    const bar = ink.current;
    if (!bar) return;
    bar.hidden = !tab;
    if (!tab) return;
    if (!placed.current) bar.style.transition = "none";
    // The ink is 1px wide: scaling it to the tab's width keeps the move to transform alone.
    bar.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop + tab.offsetHeight}px) scaleX(${tab.offsetWidth})`;
    bar.style.setProperty("--rh", String(tabs.find((t) => t.repo === open)?.hue ?? 0));
    if (!placed.current) {
      void bar.offsetWidth;
      bar.style.transition = "";
      placed.current = true;
    }
  });
  return (
    <div class="repo-tabs" role="tablist" aria-label="Repo" ref={list}>
      {tabs.map(({ repo, name, hue }) => (
        <button
          key={repo}
          type="button"
          role="tab"
          aria-selected={repo === open}
          class={`repo-tab${repo === open ? " on" : ""}`}
          style={{ "--rh": hue }}
          title={repo}
          onClick={() => onOpen(repo)}
        >
          {name}
        </button>
      ))}
      <span class="ink" ref={ink} aria-hidden="true" hidden />
    </div>
  );
}
