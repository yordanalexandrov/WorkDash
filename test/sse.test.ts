import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createEventHub, formatEvent } from "../src/sse.js";

/** A stand-in for an HTTP response that collects what the hub writes to it. */
function client() {
  const stream = new PassThrough();
  let text = "";
  stream.on("data", (chunk) => (text += chunk));
  return { stream, text: () => text };
}

describe("formatEvent", () => {
  it("writes a named event with its data as one line of JSON", () => {
    expect(formatEvent("dashboard", { a: "x\ny" })).toBe('event: dashboard\ndata: {"a":"x\\ny"}\n\n');
  });
});

describe("createEventHub", () => {
  it("sends a connecting client its initial events, then every broadcast", () => {
    const hub = createEventHub();
    const c = client();

    hub.connect(c.stream, [{ type: "dashboard", data: 1 }]);
    hub.broadcast("dashboard", 2);
    hub.broadcast("event", { kind: "new_pr" });

    expect(c.text()).toBe(
      "retry: 3000\n\n" + formatEvent("dashboard", 1) + formatEvent("dashboard", 2) + formatEvent("event", { kind: "new_pr" }),
    );
    hub.close();
  });

  it("sends every broadcast to every connected client", () => {
    const hub = createEventHub();
    const [a, b] = [client(), client()];
    hub.connect(a.stream);
    hub.connect(b.stream);

    hub.broadcast("dashboard", 1);

    expect(a.text()).toContain(formatEvent("dashboard", 1));
    expect(b.text()).toContain(formatEvent("dashboard", 1));
    hub.close();
  });

  it("forgets a client once its connection closes", async () => {
    const hub = createEventHub();
    const c = client();
    hub.connect(c.stream);

    c.stream.destroy();
    await new Promise((resolve) => c.stream.once("close", resolve));

    expect(hub.clientCount()).toBe(0);
    hub.broadcast("dashboard", 1);
    hub.close();
  });

  it("keeps idle connections open with a comment line", () => {
    const hub = createEventHub({ keepAliveMs: 10 });
    const c = client();
    hub.connect(c.stream);

    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(c.text()).toContain(": keep-alive\n\n");
        hub.close();
        resolve();
      }, 30),
    );
  });

  it("ends every connection when closed", () => {
    const hub = createEventHub();
    const c = client();
    hub.connect(c.stream);

    hub.close();

    expect(c.stream.writableEnded).toBe(true);
    expect(hub.clientCount()).toBe(0);
  });
});
