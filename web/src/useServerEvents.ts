import { useEffect, useRef, useState } from "preact/hooks";
import { type EventStream, openEventStream, type ServerEvents, type StreamStatus } from "./events.js";

let shared: EventStream | undefined;

/** The page's one connection to /api/events, opened on first use and shared by every hook. */
function stream(): EventStream {
  shared ??= openEventStream({ url: "/api/events" });
  return shared;
}

/** Calls `handler` with every `type` event the server pushes, for as long as the component is mounted. */
export function useServerEvent<K extends keyof ServerEvents>(type: K, handler: (data: ServerEvents[K]) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => stream().subscribe(type, (data) => latest.current(data)), [type]);
}

/** Whether the event stream is connected right now. */
export function useStreamStatus(): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>(() => stream().status());
  useEffect(() => {
    setStatus(stream().status());
    return stream().onStatus(setStatus);
  }, []);
  return status;
}
