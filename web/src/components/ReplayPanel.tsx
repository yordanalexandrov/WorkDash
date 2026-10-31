import { count } from "../badges.js";
import { clockLabel, hoursLeft } from "../replay.js";

type ReplayPanelProps = {
  time: number;
  start: number;
  end: number;
  /** The happenings in each hour of the window, for the track. */
  buckets: number[];
  playing: boolean;
  speed: number;
  /** How many of `total` happenings have played. */
  fired: number;
  total: number;
  onToggle(): void;
  onSpeed(speed: number): void;
  onScrub(time: number): void;
  onClose(): void;
};

const SPEEDS = [1, 4];
/** The track's units: one bar of 8 in each 10 per hour, 32 high. */
const BAR = 10;
const HEIGHT = 32;
const MINUTE = 60_000;

/** The replay's controls under the toolbar: play/pause, the clock, the track of the 48 hours with its scrubber, the speeds, ✕. */
export function ReplayPanel({ time, start, end, buckets, playing, speed, fired, total, onToggle, onSpeed, onScrub, onClose }: ReplayPanelProps) {
  const peak = Math.max(1, ...buckets);
  const width = buckets.length * BAR;
  const played = ((time - start) / (end - start)) * width;
  const left = hoursLeft(time, end);
  const bars = (cls: string) =>
    buckets.map((n, i) => {
      const h = (n / peak) * (HEIGHT - 2);
      return n ? <rect key={i} class={cls} x={i * BAR + 1} y={HEIGHT - h} width={BAR - 2} height={h} rx={2} /> : null;
    });
  return (
    <div class="replay">
      <button type="button" class="btn" onClick={onToggle} title={playing ? "Пауза" : "Пусни"} aria-label={playing ? "Пауза" : "Пусни"}>
        {playing ? "⏸" : "▶"}
      </button>
      <div class="clock" aria-live="off">
        {clockLabel(time)}
        <small>{left > 0 ? `${left}ч до snapshot-а` : "snapshot-ът"}</small>
      </div>
      <div class="track">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <clipPath id="replay-played">
              <rect x="0" y="0" width={played} height={HEIGHT} />
            </clipPath>
          </defs>
          <g class="ahead">{bars("bar")}</g>
          <g clip-path="url(#replay-played)">{bars("bar played")}</g>
          <rect class="now" x={played - 0.6} y="0" width="1.2" height={HEIGHT} />
        </svg>
        <input
          type="range"
          aria-label="Момент от деня"
          min={start}
          max={end}
          step={MINUTE}
          value={time}
          onInput={(event) => onScrub(Number(event.currentTarget.value))}
        />
      </div>
      <div class="speeds">
        {SPEEDS.map((s) => (
          <button key={s} type="button" class={`btn${speed === s ? " on" : ""}`} aria-pressed={speed === s} onClick={() => onSpeed(s)}>
            {s}x
          </button>
        ))}
        <button type="button" class="btn" onClick={onClose} title="Спри повторението" aria-label="Спри повторението">
          ✕
        </button>
      </div>
      <div class="fired">
        {fired} от {count(total, "събитие", "събития")} за последните 48ч · 1x = час в секунда, тихите часове се превъртат
      </div>
    </div>
  );
}
