import type { CheckRing } from "../marks.js";

/** A CI or Sonar result as a ring: full with a tick, full with a cross, or a partial arc while it runs. */
export function Ring({ ring }: { ring: CheckRing }) {
  return (
    <span class={`chk ${ring.kind}`} title={`${ring.label}: ${ring.state}`}>
      <svg viewBox="0 0 16 16" fill="none" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <circle class="trk" cx="8" cy="8" r="6" />
        <circle class="arc" cx="8" cy="8" r="6" transform="rotate(-90 8 8)" />
        {ring.kind === "ok" ? <path d="M5.4 8.2l1.8 1.8 3.4-3.6" stroke="currentColor" stroke-width="1.6" /> : null}
        {ring.kind === "bad" ? <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.6" /> : null}
      </svg>
      {ring.label}
    </span>
  );
}
