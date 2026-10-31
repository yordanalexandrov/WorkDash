import { render } from "preact";
import { App } from "./App.js";
import { startMotion } from "./motion.js";
import { registerServiceWorker } from "./serviceWorker.js";

startMotion(document.documentElement);
render(<App />, document.body);
registerServiceWorker();
