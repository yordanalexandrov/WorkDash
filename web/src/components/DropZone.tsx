import type { Ref } from "preact";

type DropZoneProps = {
  /** The zone's box, which the drag hit-tests against. */
  zoneRef: Ref<HTMLDivElement>;
  /** Whether the pointer of the drag is over it. */
  over: boolean;
  /** What it says, and what it says while the pointer is over it. */
  label: string;
  overLabel: string;
  /** The muted line under the label. */
  hint: string;
};

/**
 * Where a drag can drop, low in the middle of the window while a drag runs: it bounces in, breathes a halo and turns a gradient
 * border like the hot column, and grows when the pointer is over it.
 */
export function DropZone({ zoneRef, over, label, overLabel, hint }: DropZoneProps) {
  return (
    <div ref={zoneRef} class={`drop${over ? " over" : ""}`} aria-hidden="true">
      <span class="halo" />
      <span class="ring" />
      <div>
        {over ? overLabel : label}
        <small>{hint}</small>
      </div>
    </div>
  );
}
