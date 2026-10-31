import { render } from "preact";
import { App } from "./App.js";
import { desktopBridge } from "./desktop.js";
import { startMotion } from "./motion.js";
import { registerServiceWorker } from "./serviceWorker.js";

startMotion(document.documentElement);
render(<App />, document.body);
// The desktop app shows the page's notifications natively and keeps its window running; it needs no service worker.
if (!desktopBridge) void registerServiceWorker();
