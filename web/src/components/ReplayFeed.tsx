import { useRef } from "preact/hooks";
import { useFlip } from "../motion.js";
import { fading, type Toast } from "../replay.js";
import { Avatar } from "./Avatar.js";

type ReplayFeedProps = {
  toasts: Toast[];
  /** The page's clock (performance.now()), against which the toasts age. */
  now: number;
  /** How far from the top of the page the feed starts: under the bar. */
  top: number;
  /** The hue of a project, for the item's tag. */
  hue(project: string): number;
  /** Whether the item under `key` has a detail sheet to open, and opening it. */
  canOpen(key: string): boolean;
  onOpen(key: string): void;
};

/** The replayed happenings on the right, newest on top: they bounce in, fade after 7.5s and go after 9s; the rest glide up (FLIP). */
export function ReplayFeed({ toasts, now, top, hue, canOpen, onOpen }: ReplayFeedProps) {
  const root = useRef<HTMLDivElement>(null);
  useFlip(root);
  return (
    <div class="feed" ref={root} style={{ top: `${top}px` }} aria-live="polite">
      {toasts.map((toast) => {
        const { id, happening } = toast;
        const opens = canOpen(happening.key);
        return (
          <div
            key={id}
            data-flip={`toast:${id}`}
            class={`toast${opens ? " opens" : ""}${fading(toast, now) ? " old" : ""}`}
            style={{ "--c": happening.color }}
            {...(opens ? { role: "button", tabIndex: 0, onClick: () => onOpen(happening.key), onKeyDown: (event: KeyboardEvent) => event.key === "Enter" && onOpen(happening.key) } : {})}
          >
            <div class="line">
              <Avatar login={happening.who} />
              <span>
                <b>{happening.who}</b> {happening.what}
              </span>
              <span class="tag" style={{ "--rh": hue(happening.project) }} title={happening.project}>
                {happening.tag}
              </span>
            </div>
            {happening.snippet ? <div class="snip">{happening.snippet}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
