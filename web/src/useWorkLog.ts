import { useEffect, useRef, useState } from "preact/hooks";
import { loadWorkLog, refreshWorkLog, type WorkLogState } from "./api.js";

/** The work log as the panel has it: the last that came (null before the first), and whether a search is on its way. */
export type WorkLogView = { log: WorkLogState | null; loading: boolean; failed: boolean; refresh(): void };

/**
 * The Свършено panel's work log, while the panel is open: what was saved, at once, then a search (the server runs one
 * at most once a minute); "Обнови" asks for another. An answer after the panel closed is dropped.
 */
export function useWorkLog(open: boolean): WorkLogView {
  const [log, setLog] = useState<WorkLogState | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);

  const refresh = () => {
    const ask = ++asked.current;
    setLoading(true);
    refreshWorkLog().then(
      (answer) => {
        if (ask !== asked.current) return;
        setLog(answer);
        setLoading(false);
        setFailed(false);
      },
      () => {
        if (ask !== asked.current) return;
        setLoading(false);
        setFailed(true);
      },
    );
  };

  useEffect(() => {
    if (!open) return;
    const ask = asked.current;
    loadWorkLog().then(
      (saved) => ask === asked.current - 1 && setLog((current) => current ?? saved),
      () => {},
    );
    refresh();
    return () => void ++asked.current;
  }, [open]);

  return { log, loading, failed, refresh };
}
