// Registers the PWA service worker; its notifications keep working while the installed window is minimized.

let registration: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null);

const browserWorkers = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;

/** Registers sw.js; resolves to the active registration, or null when service workers are unavailable. */
export function registerServiceWorker(
  workers: ServiceWorkerContainer | undefined = browserWorkers,
): Promise<ServiceWorkerRegistration | null> {
  registration = workers
    ? workers.register("sw.js").then(
        () => workers.ready,
        (error: unknown) => {
          console.warn("Service worker registration failed", error);
          return null;
        },
      )
    : Promise.resolve(null);
  return registration;
}

/** The registration from `registerServiceWorker`, once its worker is active; null if there is none. */
export function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  return registration;
}
