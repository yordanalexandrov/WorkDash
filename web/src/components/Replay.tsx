import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Happening, hourBuckets } from "../replay.js";
import { type ReplayRun, useReplay } from "../useReplay.js";
import { ReplayFeed } from "./ReplayFeed.js";
import { ReplayPanel } from "./ReplayPanel.js";

type ReplayProps = {
  run: ReplayRun;
  onFire(happening: Happening): void;
  /** While true (the detail sheet is open) the replay pauses; it does not start again on its own. */
  held: boolean;
  hue(project: string): number;
  canOpen(key: string): boolean;
  onOpen(key: string): void;
  onClose(): void;
};

/** How far under the panel the feed starts. */
const FEED_GAP = 8;

/** "Пусни деня" while it runs: the panel under the toolbar and the feed on the right. Renders on every frame, alone. */
export function Replay({ run, onFire, held, hue, canOpen, onOpen, onClose }: ReplayProps) {
  const replay = useReplay(run, onFire);
  const buckets = useMemo(() => hourBuckets(run.events, run.start, run.end), [run]);
  const { pause } = replay;
  useEffect(() => {
    if (held) pause();
  }, [held]);
  const panel = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const place = () => setTop((panel.current?.getBoundingClientRect().bottom ?? 0) + FEED_GAP);
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, []);
  return (
    <>
      <div class="replay-wrap" ref={panel}>
        <ReplayPanel
          time={replay.time}
          start={run.start}
          end={run.end}
          buckets={buckets}
          playing={replay.playing}
          speed={replay.speed}
          fired={replay.fired}
          total={run.events.length}
          onToggle={replay.toggle}
          onSpeed={replay.setSpeed}
          onScrub={replay.scrub}
          onClose={onClose}
        />
      </div>
      <ReplayFeed toasts={replay.toasts} now={replay.now} top={top} hue={hue} canOpen={canOpen} onOpen={onOpen} />
    </>
  );
}
