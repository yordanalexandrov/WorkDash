import { useEffect, useRef, useState } from "preact/hooks";
import { expireToasts, firedBy, type Happening, pushToasts, step, type Toast } from "./replay.js";

/** A replay as it was frozen when it started: the happenings of (start, end], `end` being the snapshot then. */
export type ReplayRun = { events: Happening[]; start: number; end: number };

/** How often the feed ages while nothing else renders it, e.g. while paused. */
const AGE_EVERY_MS = 250;

/**
 * The replay under way: it plays from the start at once, on every animation frame; each happening it passes goes to `onFire`
 * and into the feed. Scrubbing moves the time without firing what it skips; ▶ at the end starts over.
 */
export function useReplay({ events, start, end }: ReplayRun, onFire: (happening: Happening) => void) {
  const [time, setTime] = useState(start);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(() => performance.now());
  // The time the frames move, ahead of the render that shows it.
  const clock = useRef(start);
  const nextId = useRef(0);
  const fire = useRef(onFire);
  fire.current = onFire;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (stamp: number) => {
      // A frame's stamp can be a little before the moment the effect ran.
      const { next, due } = step(clock.current, events, Math.max(0, stamp - last), speed, end);
      last = stamp;
      clock.current = next;
      for (const happening of due) fire.current(happening);
      if (due.length) {
        const firstId = nextId.current;
        nextId.current += due.length;
        setToasts((current) => pushToasts(current, due, stamp, firstId));
      }
      setTime(next);
      setNow(stamp);
      if (next >= end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, events, end]);

  // The feed fades and empties on its own clock, playing or not.
  const anyToast = toasts.length > 0;
  useEffect(() => {
    if (!anyToast) return;
    const timer = setInterval(() => {
      const stamp = performance.now();
      setNow(stamp);
      setToasts((current) => expireToasts(current, stamp));
    }, AGE_EVERY_MS);
    return () => clearInterval(timer);
  }, [anyToast]);

  const scrub = (value: number) => {
    clock.current = value;
    setTime(value);
  };
  return {
    time,
    playing,
    speed,
    setSpeed,
    scrub,
    toggle() {
      if (!playing && clock.current >= end) scrub(start);
      setPlaying(!playing);
    },
    pause: () => setPlaying(false),
    fired: firedBy(events, time),
    toasts,
    now,
  };
}
