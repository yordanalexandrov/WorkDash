// What the desktop app's preload hands the page (desktop/src/preload.ts); in a browser there is none.

export type DesktopBridge = {
  desktop: true;
  /** Shows and focuses the app's window, also when it is hidden. */
  showWindow(): void;
};

declare global {
  interface Window {
    workdash?: DesktopBridge;
  }
}

/** The desktop app's bridge, or undefined when the page runs in a browser. */
export const desktopBridge: DesktopBridge | undefined = typeof window === "undefined" ? undefined : window.workdash;
