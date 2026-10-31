import { useEffect, useState } from "preact/hooks";

/** The Settings screen lives in the URL as `#settings`, so a banner can link to it and the back button leaves it. */
const HASH = "#settings";

export type SettingsRoute = { open: boolean; show(): void; hide(): void };

export function useSettingsRoute(): SettingsRoute {
  const [open, setOpen] = useState(() => location.hash === HASH);
  useEffect(() => {
    const onHash = () => setOpen(location.hash === HASH);
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return {
    open,
    show: () => {
      location.hash = HASH;
    },
    hide: () => {
      history.replaceState(history.state, "", location.pathname + location.search);
      setOpen(false);
    },
  };
}
