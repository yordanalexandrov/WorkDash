#!/usr/bin/env node
// Drives the headless Chrome that `wd-verify start` launched, over the Chrome DevTools Protocol.
// No dependencies: Node 22+ has a global WebSocket. Every command connects, acts, prints, disconnects.
//
// Usage (normally through `wd-verify browser ...`, which sets CDP_PORT and BASE_URL):
//   cdp.mjs goto <path-or-url> [--wait-text T]
//   cdp.mjs click  (--name N | --css S) [--role R] [--within CSS] [--exact] [--nth K]
//   cdp.mjs fill   (--name N | --css S) (--value V | --value-env VAR) [--role R] [--within CSS] [--exact]
//     --name matches the accessible name (aria-label, the label of an input, its placeholder, else the text),
//     exactly first, then as a substring unless --exact; --within scopes the search to the first element matching CSS.
//     A disabled target fails the command instead of silently doing nothing.
//   cdp.mjs press  <key>                        e.g. Escape, Enter, Tab, /, t, r, f
//   cdp.mjs tab-to (--name N | --css S) [--role R] [--within CSS] [--exact] [--max K]
//     presses Tab (at most K times, default 30) until that element has focus: the keyboard path to it
//   cdp.mjs focused                             the accessible name of the element that has focus
//   cdp.mjs scroll (--name N | --css S) [...]   scrolls the element to the top of its scroll box, as a user would scroll to it
//   cdp.mjs tabs [--close-others]               the open tabs' URLs, * on the app's (the one every command drives);
//                                               a link with target=_blank shows up here. --close-others closes the rest
//   cdp.mjs wait   (--text T | --css S) [--gone] [--timeout MS]
//   cdp.mjs text   [--css S]                    innerText of S (default: body)
//   cdp.mjs screenshot <file.png> [--full] [--scheme dark|light] [--reduced-motion]
//   cdp.mjs aria   [<file.txt>]                 accessibility tree, one node per line
//   cdp.mjs eval   <js-expression>              read-only inspection; never use it to cause a state change
//   cdp.mjs url                                 the page's current URL
//   cdp.mjs dialog accept|dismiss               answer a confirm()/alert() an earlier command left open
// Any command: --dialog accept|dismiss answers a dialog that opens during it (default dismiss); --settle MS after acting.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const CDP_PORT = process.env.CDP_PORT;
const BASE_URL = process.env.BASE_URL;
if (!CDP_PORT || !BASE_URL) die("CDP_PORT and BASE_URL must be set (run through `wd-verify browser`)");

const [cmd, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest);
// --value-env NAME reads the value from an environment variable, so a secret never lands in argv or a transcript.
if (flags["value-env"]) flags.value = process.env[flags["value-env"]] ?? die(`env ${flags["value-env"]} is not set`);
const SETTLE_MS = Number(flags.settle ?? 400);

function die(message) {
  console.error(`cdp: ${message}`);
  process.exit(1);
}

function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else flags[key] = args[++i];
    } else positional.push(a);
  }
  return { positional, flags };
}

// The app's tab. A link with target=_blank opens another tab, and Chrome may list it first, so pick by URL.
const pageTargets = async () =>
  (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())).filter((t) => t.type === "page");
const appPage = (pages) =>
  pages.find((t) => t.url.startsWith(BASE_URL)) ?? pages.find((t) => t.url === "about:blank") ?? pages[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const page = appPage(await pageTargets());
  if (!page) die("no page target in Chrome");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("CDP websocket failed"));
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ""}`));
      else resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  // A confirm()/alert() blocks the page, and every later command with it. Answer it the way --dialog says (default: dismiss).
  const answer = flags.dialog === "accept";
  listeners.push((m) => {
    if (m.method !== "Page.javascriptDialogOpening") return;
    console.log(`dialog ${m.params.type} "${m.params.message}" -> ${answer ? "accept" : "dismiss"}`);
    send("Page.handleJavaScriptDialog", { accept: answer }).catch(() => {});
  });
  // Not awaited: with a dialog already open, Page.enable answers only after it is handled.
  send("Page.enable").catch(() => {});
  return { send, on: (l) => listeners.push(l), close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

// In-page locator: finds the element a user would call `name`, by its accessible name.
const LOCATOR = String.raw`
(function locate(spec) {
  const ROLES = {
    button: 'button,[role=button],summary',
    radio: '[role=radio]',
    link: 'a[href],[role=link]',
    tab: '[role=tab]',
    columnheader: '[role=columnheader]',
    textbox: 'input:not([type=checkbox]):not([type=radio]),textarea',
    checkbox: 'input[type=checkbox]',
    dialog: '[role=dialog]',
    row: '[role=row]',
    any: 'button,[role=button],[role=radio],a[href],[role=link],[role=tab],[role=columnheader],input,textarea,select,summary,[role=row],[role=dialog],[aria-label],label,h1,h2,h3',
  };
  const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const nameOf = (el) => {
    if (el.getAttribute('aria-label')) return norm(el.getAttribute('aria-label'));
    if (el.matches('input,textarea,select')) {
      const label = el.labels && el.labels[0];
      if (label && norm(label.innerText)) return norm(label.innerText);
      // Settings fields show their label as a sibling span, not a <label>: the name a user reads.
      const shown = el.closest('.set-field')?.querySelector(':scope > .set-label');
      if (shown && !el.closest('.names')) return norm(shown.innerText);
      return norm(el.getAttribute('placeholder'));
    }
    // An SVG node (a mermaid graph's) has no innerText, only textContent.
    return norm(el.innerText ?? el.textContent);
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    if (r.width > 0 && r.height > 0) return true;
    // A switch hides its checkbox; the label around it is what a user clicks.
    return el.matches('input[type=checkbox]') && el.labels && el.labels[0] && el.labels[0].getBoundingClientRect().width > 0;
  };
  const root = spec.within ? document.querySelector(spec.within) : document;
  if (!root) return [];
  let els;
  if (spec.css) {
    els = [...root.querySelectorAll(spec.css)].filter(visible);
  } else {
    const all = [...root.querySelectorAll(ROLES[spec.role || 'any'] || ROLES.any)].filter(visible);
    const want = norm(spec.name);
    const titled = (el) => norm(el.getAttribute('title')) === want;
    els = all.filter((el) => nameOf(el) === want || titled(el));
    // CSS text-transform changes innerText (table headers read "БЛОКИРАН ОТ"), so the fallbacks ignore case.
    const low = want.toLowerCase();
    if (!els.length) els = all.filter((el) => nameOf(el).toLowerCase() === low);
    if (!els.length && !spec.exact) els = all.filter((el) => nameOf(el).toLowerCase().includes(low));
  }
  return els;
})
`;

async function find(cdp, spec, { mustExist = true } = {}) {
  const nth = Number(spec.nth ?? 0);
  const value = await evaluate(
    cdp,
    `(() => {
      const els = ${LOCATOR}(${JSON.stringify(spec)});
      const el = els[${nth}];
      if (!el) return { count: els.length };
      window.__wdTarget = el;
      const target = (el.matches('input[type=checkbox]') && el.getBoundingClientRect().width === 0) ? el.labels[0] : el;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      const r = target.getBoundingClientRect();
      return { count: els.length, x: r.x + r.width / 2, y: r.y + r.height / 2,
               tag: el.tagName.toLowerCase(), disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true', text: (el.getAttribute('aria-label') || el.innerText || el.textContent || el.value || '').trim().slice(0, 80) };
    })()`,
  );
  if (value.x === undefined && mustExist) die(`no visible element for ${JSON.stringify(spec)} (matches: ${value.count})`);
  return value;
}

async function mouseClick(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

const KEYS = {
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  "/": { key: "/", code: "Slash", windowsVirtualKeyCode: 191, text: "/" },
};

async function pressKey(cdp, name) {
  const k = KEYS[name] ?? (name.length === 1 ? { key: name, code: `Key${name.toUpperCase()}`, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0), text: name } : null);
  if (!k) die(`unknown key ${name}`);
  await cdp.send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", ...k });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...k, text: undefined });
}

function specFrom(flags) {
  if (!flags.name && !flags.css) die("give --name or --css");
  return { name: flags.name, css: flags.css, role: flags.role, within: flags.within, exact: Boolean(flags.exact), nth: flags.nth };
}

function out(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`wrote ${path}`);
}

async function main() {
  const cdp = await connect();
  try {
    switch (cmd) {
      case "goto": {
        const target = positional[0] ?? "/";
        const url = /^https?:/.test(target) ? target : BASE_URL + (target.startsWith("/") ? target : `/${target}`);
        await cdp.send("Page.enable");
        // Always a fresh load: navigating to the same URL with another #hash would keep the old page and its drafts.
        await cdp.send("Page.navigate", { url: "about:blank" });
        await sleep(100);
        const loaded = new Promise((resolve) => cdp.on((m) => m.method === "Page.loadEventFired" && resolve()));
        await cdp.send("Page.navigate", { url });
        // A hash-only change (e.g. #settings) fires no load event.
        await Promise.race([loaded, sleep(5000)]);
        if (flags["wait-text"]) await waitFor(cdp, { text: flags["wait-text"] }, Number(flags.timeout ?? 15000));
        await sleep(SETTLE_MS);
        console.log(`at ${await evaluate(cdp, "location.href")}`);
        break;
      }
      case "click": {
        const hit = await find(cdp, specFrom(flags));
        if (hit.disabled) die(`<${hit.tag}> "${hit.text}" is disabled; a user could not click it`);
        await mouseClick(cdp, hit.x, hit.y);
        await sleep(SETTLE_MS);
        console.log(`clicked <${hit.tag}> "${hit.text}" (${hit.count} match${hit.count === 1 ? "" : "es"})`);
        break;
      }
      case "fill": {
        if (flags.value === undefined) die("fill needs --value");
        const hit = await find(cdp, specFrom(flags));
        const picker = await evaluate(cdp, "['time','date','datetime-local','month','week','color','range'].includes(window.__wdTarget.type)");
        if (picker) {
          // Picker inputs take no typed text; set the value the way the picker does and fire its events.
          await evaluate(
            cdp,
            `(() => { const el = window.__wdTarget; el.focus();
               Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(String(flags.value))});
               el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`,
          );
          await sleep(SETTLE_MS);
          console.log(`set <input type=picker> to ${JSON.stringify(flags.value)}`);
          break;
        }
        await mouseClick(cdp, hit.x, hit.y);
        await evaluate(cdp, "window.__wdTarget.focus(); window.__wdTarget.select && window.__wdTarget.select()");
        // Replace whatever is there, the way a user selects all and types.
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
        if (String(flags.value).length) await cdp.send("Input.insertText", { text: String(flags.value) });
        await sleep(SETTLE_MS);
        const isSecret = await evaluate(cdp, "window.__wdTarget.type === 'password'");
        console.log(`filled <${hit.tag}> with ${isSecret ? "(secret)" : JSON.stringify(flags.value)}`);
        break;
      }
      case "press": {
        await pressKey(cdp, positional[0]);
        await sleep(SETTLE_MS);
        console.log(`pressed ${positional[0]}`);
        break;
      }
      case "tab-to": {
        // The keyboard path: Tab until the target has focus, so focus rings and Enter handlers get a real proof.
        const spec = specFrom(flags);
        const max = Number(flags.max ?? 30);
        for (let i = 1; i <= max; i++) {
          await pressKey(cdp, "Tab");
          await sleep(50);
          const hit = await evaluate(cdp, `(() => { const els = ${LOCATOR}(${JSON.stringify(spec)}); return els[${Number(spec.nth ?? 0)}] === document.activeElement; })()`);
          if (hit) {
            await sleep(SETTLE_MS);
            console.log(`focused ${JSON.stringify(spec.name ?? spec.css)} after ${i} Tab${i === 1 ? "" : "s"}`);
            return;
          }
        }
        die(`${JSON.stringify(spec.name ?? spec.css)} did not get focus within ${max} Tabs; now on ${JSON.stringify(await focusedName(cdp))}`);
        break;
      }
      case "focused":
        console.log(await focusedName(cdp));
        break;
      case "scroll": {
        const hit = await find(cdp, specFrom(flags));
        await evaluate(cdp, "window.__wdTarget.scrollIntoView({ block: 'start', inline: 'nearest' })");
        await sleep(SETTLE_MS);
        console.log(`scrolled to <${hit.tag}> "${hit.text}"`);
        break;
      }
      case "tabs": {
        // A tab a link just opened has no URL for a moment: give it up to 2s to get one.
        let pages = await pageTargets();
        for (let i = 0; i < 10 && pages.some((t) => !t.url); i++) {
          await sleep(200);
          pages = await pageTargets();
        }
        const driven = appPage(pages);
        for (const t of pages) {
          if (flags["close-others"] && t.id !== driven.id) {
            await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`);
            console.log(`closed ${t.url}`);
          } else console.log(`${t.id === driven.id ? "* " : "  "}${t.url}`);
        }
        break;
      }
      case "wait": {
        await waitFor(cdp, { text: flags.text, css: flags.css, gone: Boolean(flags.gone) }, Number(flags.timeout ?? 15000));
        console.log(`ok: ${flags.gone ? "gone" : "present"} ${flags.text ?? flags.css}`);
        break;
      }
      case "text": {
        console.log(await evaluate(cdp, `(document.querySelector(${JSON.stringify(flags.css ?? "body")})?.innerText ?? '(no element)')`));
        break;
      }
      case "dialog": {
        // A dialog left open by an earlier command: answer it now.
        await cdp.send("Page.handleJavaScriptDialog", { accept: positional[0] === "accept" }).then(
          () => console.log(`dialog -> ${positional[0] === "accept" ? "accept" : "dismiss"}`),
          () => console.log("no dialog open"),
        );
        break;
      }
      case "url":
        console.log(await evaluate(cdp, "location.href"));
        break;
      case "eval":
        console.log(JSON.stringify(await evaluate(cdp, positional.join(" ")), null, 2));
        break;
      case "screenshot": {
        if (!positional[0]) die("screenshot needs a file path");
        // Emulation lasts only while this connection does, so the page goes back to light afterwards by itself.
        const features = [];
        if (flags.scheme) features.push({ name: "prefers-color-scheme", value: String(flags.scheme) });
        if (flags["reduced-motion"]) features.push({ name: "prefers-reduced-motion", value: "reduce" });
        if (features.length) {
          await cdp.send("Emulation.setEmulatedMedia", { features });
          await sleep(Math.max(SETTLE_MS, 600));
        }
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(flags.full) });
        out(positional[0], Buffer.from(data, "base64"));
        break;
      }
      case "aria": {
        const text = await ariaDump(cdp);
        if (positional[0]) out(positional[0], text);
        else console.log(text);
        break;
      }
      default:
        die(`unknown command ${cmd ?? "(none)"}; see the header of ${import.meta.filename}`);
    }
  } finally {
    cdp.close();
  }
}

async function focusedName(cdp) {
  return evaluate(cdp, `(() => { const el = document.activeElement; if (!el || el === document.body) return '(nothing)';
    return (el.getAttribute('aria-label') || el.innerText || el.textContent || el.tagName).replace(/\\s+/g, ' ').trim().slice(0, 120); })()`);
}

async function waitFor(cdp, { text, css, gone }, timeout) {
  const probe = css
    ? `!!document.querySelector(${JSON.stringify(css)})`
    : `document.body.innerText.replace(/\\s+/g,' ').includes(${JSON.stringify((text ?? "").replace(/\s+/g, " "))})`;
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const present = await evaluate(cdp, probe);
    if (present !== gone) return;
    await sleep(200);
  }
  die(`timed out after ${timeout}ms waiting for ${gone ? "absence of" : ""} ${text ?? css}`);
}

async function ariaDump(cdp) {
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const lines = [];
  const SKIP = new Set(["none", "generic", "InlineTextBox", "LineBreak"]);
  const walk = (node, depth) => {
    const role = node.role?.value ?? "";
    const name = (node.name?.value ?? "").replace(/\s+/g, " ").trim();
    const shown = !node.ignored && !SKIP.has(role) && !(role === "StaticText" && !name);
    if (shown) {
      // Values are left out on purpose: a password field must never reach the evidence.
      const props = (node.properties ?? [])
        .filter((p) => ["checked", "pressed", "disabled", "expanded", "selected"].includes(p.name) && p.value?.value !== false && p.value?.value !== "false")
        .map((p) => `${p.name}=${p.value.value}`);
      lines.push(`${"  ".repeat(depth)}${role}${name ? ` "${name.slice(0, 160)}"` : ""}${props.length ? ` [${props.join(", ")}]` : ""}`);
    }
    for (const child of node.childIds ?? []) {
      const c = byId.get(child);
      if (c) walk(c, shown ? depth + 1 : depth);
    }
  };
  walk(nodes[0], 0);
  return lines.join("\n") + "\n";
}

const WATCHDOG_MS = Number(flags.timeout ?? 15000) + 15000;
setTimeout(
  () => die(`page did not answer in ${WATCHDOG_MS}ms; it is wedged (often a confirm() nobody answered). Run: wd-verify stop && wd-verify start`),
  WATCHDOG_MS,
).unref();
main().catch((error) => die(error.message));
