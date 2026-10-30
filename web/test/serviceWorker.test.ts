import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker, serviceWorkerRegistration } from "../src/serviceWorker.js";

const registration = { scope: "http://localhost/" } as ServiceWorkerRegistration;

function container(register: () => Promise<ServiceWorkerRegistration>): ServiceWorkerContainer {
  return { register: vi.fn(register), ready: Promise.resolve(registration) } as unknown as ServiceWorkerContainer;
}

describe("service worker registration", () => {
  it("registers sw.js and hands out the active registration", async () => {
    const workers = container(async () => registration);

    await expect(registerServiceWorker(workers)).resolves.toBe(registration);
    expect(workers.register).toHaveBeenCalledWith("sw.js");
    await expect(serviceWorkerRegistration()).resolves.toBe(registration);
  });

  it("gives no registration when the browser has no service workers", async () => {
    await expect(registerServiceWorker(undefined)).resolves.toBeNull();
    await expect(serviceWorkerRegistration()).resolves.toBeNull();
  });

  it("gives no registration when registering fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(registerServiceWorker(container(() => Promise.reject(new Error("blocked"))))).resolves.toBeNull();
    await expect(serviceWorkerRegistration()).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
