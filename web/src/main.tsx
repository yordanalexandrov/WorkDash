import { render } from "preact";
import { App } from "./App.js";
import { registerServiceWorker } from "./serviceWorker.js";

render(<App />, document.body);
registerServiceWorker();
