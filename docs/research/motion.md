# Motion: own FLIP, View Transitions API, or a library

Research for issue #23. Question: what should carry the living board's motion in `web/src` (Preact, esbuild, no runtime dependency besides `preact`): an own FLIP module modelled on prototype H, the browser's same-document **View Transitions API**, or a library (`motion`, `@formkit/auto-animate`)? Compared per motion kind from `docs/design.md`: (1) reorder, (2) card ↔ row morph, (3) detail sheet grow/shrink; plus cascades, transform/opacity only, reduced motion, bundle size, Chromium + Firefox support, SSE updates mid-animation and pointer-event drag.

Researched 2026-10-31. Support data from `@mdn/browser-compat-data` 8.1.7 (2026-10-22) and `web-features` (both fetched from npm). Sizes measured with the repo's esbuild 0.28 (`--bundle --minify --format=esm --target=es2022`, `gzip -9`), preact external.

## Recommendation

| Motion kind | Use | Why, in one line |
| --- | --- | --- |
| Reorder (filter, sort, group, fold, PR gone, PR changes section) | **Own FLIP** (`useFlip` from H): Web Animations API, `composite: "add"`, glide spring as `linear()` | Interruptible and additive, so typing in the filter or an SSE update mid-glide never jumps; works across parents; ~1.5 KB gz for all of H's motion code. |
| Card ↔ row morph (view toggle) | **Own lift/land** (`liftFlyers` / `land` from H) | View Transitions would fit conceptually, but one transition per document, non-interactive captured elements, and a width/height group animation break the design rules; H's version already works. Revisit when element-scoped VT is Baseline. |
| Detail sheet grow/shrink | **Own WAAPI transform morph** (H's `Detail`: translate+scale from the source rect, content fades in after) | Two `animate()` calls; shrinks back to the slot's *current* rect, so a reorder while the sheet was open still lands right. |
| Entrances (cascade) | CSS keyframes with a per-item delay (`--i`), cancelled by `land` on a view switch | No JS needed; already what H does. |
| Drag to "видях" | Pointer events + `setPointerCapture` + transform on a clone; drop lands with bounce | Library-independent; any VT running at that moment would block it (see below). |

No library. **No View Transitions for now.**

**Layer vs. per ticket:** build motion as **one small shared module first** (e.g. `web/src/motion.ts`: `spring()` → `GLIDE`/`BOUNCE`, a live reduced-motion flag, `useFlip`, `lift`/`land`, `growFrom`/`shrinkTo`, an "animation busy" gate for SSE). Every feature ticket then **wires its own elements into it** (`data-flip` keys, which entrance, which spring) as item 3 of the design checklist. The primitives are a layer; using them belongs to each feature. Keeping one implementation of the springs and one reduced-motion switch is what makes the design's "reuse the two springs" and "reduced motion turns everything off" rules enforceable.

## Key facts

### Browser support (Chromium for the PWA window, Firefox)

| Feature | Chrome/Edge | Firefox | Safari | Baseline |
| --- | --- | --- | --- | --- |
| `Element.animate()` / Web Animations | 84 (full) | 75 | 14 | widely available (2020) |
| `animate()` `composite` option | 84 | 80 | 16 | (part of web-animations) |
| `animate()` `pseudoElement` option | 84 | 75 | 14 | |
| CSS `linear()` easing | 113 | 112 | 17.2 | widely available (2023-12) |
| `prefers-reduced-motion` | 74 | 63 | 10.1 | widely available (2020) |
| Pointer Events / `setPointerCapture` | 55 | 59 | 13 | widely available (2020) |
| `document.startViewTransition()`, `view-transition-name` | 111 | **144** | 18 | **newly available, 2025-10-14** |
| `view-transition-class` | 125 | 144 | 18.2 | newly available, 2025-10-14 |
| `ViewTransition.types` / `:active-view-transition-type()` | 125 | 147 | 18.2 | newly available, 2026-01-13 |
| `view-transition-group` (nested groups) | 140 | no | no | not Baseline |
| `Element.startViewTransition()` (element-scoped) | 147 | no | no | not Baseline |

Sources: BCD keys `api.Element.animate.*`, `css.types.easing-function.linear-function`, `api.Document.startViewTransition`, `api.Element.startViewTransition`, `css.properties.view-transition-*`; web-features ids `web-animations`, `linear-easing`, `view-transitions`, `view-transition-class`, `active-view-transition`, `view-transitions-element-scoped`. MDN marks View Transitions "Baseline 2025 Newly available" ([MDN view-transition-name](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/view-transition-name)).

Everything the own-FLIP route needs has been Baseline widely available since 2023 at the latest. H already falls back to an overshooting `cubic-bezier` if `CSS.supports` rejects the sampled `linear()`.

### Bundle size (min / gzip)

| What | min | gzip |
| --- | --- | --- |
| Current `web/src` app (preact included) | 30.4 KB | 10.7 KB |
| H's motion code (`spring`, `layoutPos`, `useFlip`, `liftFlyers`, `land`) | 3.3 KB | **1.5 KB** |
| `@formkit/auto-animate` 0.10.0 + its Preact hook | 8.4 KB | 3.4 KB |
| `motion` 14.9.0 `motion/mini` `animate` | 9.4 KB | 3.7 KB |
| `motion/mini` `animate` + `spring` | 13.4 KB | 5.5 KB |
| `motion` hybrid `animate` | 74.0 KB | 27.2 KB |
| View Transitions API | 0 | 0 |

The motion docs quote 3.2 KB (mini) and 22 KB (hybrid) ([motion.dev/docs/animate](https://motion.dev/docs/animate)); the measured numbers with this toolchain are above. Hybrid `motion` would almost triple the app.

### Preact fit

- **`motion`**: `motion` and `framer-motion` 14.9.0 declare `peerDependencies` `react` and `react-dom` ^18 || ^19 (npm metadata). Layout/shared-element animation (`layout`, `layoutId`) is a feature of `motion/react` components and is triggered "as a result of a React render" ([motion.dev layout animations](https://motion.dev/docs/react-layout-animations)); the vanilla `animate()` docs do not offer layout (FLIP) animation. So in Preact we would only get `animate()`, which is a thin wrapper over the WAAPI we already call directly — it adds no FLIP, no morph. Using `motion/react` would need `preact/compat` aliasing, which Motion does not document as supported.
- **`@formkit/auto-animate`**: official Preact entry `@formkit/auto-animate/preact` exporting `useAutoAnimate` ([auto-animate.formkit.com](https://auto-animate.formkit.com/); `exports["./preact"]` in its package.json; the hook imports `preact/hooks`). But it only animates add/remove/move of the **immediate children of one parent**, triggered by a `MutationObserver`. Its default "remain" effect animates `width`/`height` as well as `transform` when the size changes (source `index.mjs`, `remain()` uses `getTransitionSizes`), which breaks the transform/opacity-only rule; removal re-inserts the leaving element as `position: absolute`. It can't move a PR between columns (a section change is a new parent), can't morph card → row, and its easing is a string unless you write a plugin returning `KeyframeEffect`s — at which point it's our FLIP with someone else's trigger.
- **View Transitions with Preact**: Preact schedules renders asynchronously (`options.debounceRendering`), while `startViewTransition(cb)` captures the new state when `cb` (or the promise it returns) settles ([CSSWG css-view-transitions-1 §6.1](https://drafts.csswg.org/css-view-transitions-1/)). So we'd need `flushSync` from `preact/compat` (it swaps `debounceRendering` to run the queued render synchronously; [preact `compat/src/index.js`](https://github.com/preactjs/preact/blob/main/compat/src/index.js)) or a promise resolved from a layout effect. Doable, but it pulls compat into an app that otherwise uses only core.
- **Own FLIP**: `useLayoutEffect` after every commit, measured against `[data-flip]` keys, already written and running against Preact in H.

### Why not View Transitions (yet)

From the spec ([css-view-transitions-1](https://drafts.csswg.org/css-view-transitions-1/)) and MDN ([Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)):

1. **One active transition per document; a new one skips the old.** `startViewTransition` step 5: "If document's active view transition is not null, then skip that view transition." Reorders happen on every filter keystroke and on SSE updates; each would cut the previous one off and jump to the end state. FLIP with `composite: "add"` stacks the new offset on the running animation instead, and `layoutPos` measures layout positions that ignore transforms, so mid-flight measurements stay correct. The only fix, element-scoped transitions, is Chromium 147 only.
2. **Captured elements don't take pointer input while it runs.** During the animation phase captured elements behave "as if they had pointer-events: none" (§4.2), and while rendering is suppressed (during the update callback) "all pointer hit testing must target its document element" (§7.1.1). The old state is "a static visual capture" (§1.1). A morph or reorder would block clicking and dragging tickets for its whole duration.
3. **Default group animation animates `width` and `height`.** The generated `-ua-view-transition-group-anim-*` keyframes animate `transform`, `width`, `height` and `backdrop-filter` (§7.3.3). Card → row changes size, so the default morph is a layout animation; avoiding it means overriding it with our own keyframes via `pseudoElement`, which is the same work as `land`.
4. **Unique names.** Every participating PR needs its own `view-transition-name` (or `match-element`); "If two rendered elements have the same `view-transition-name` at the same time, the `ViewTransition.ready` Promise will reject and the transition will be skipped" (MDN). Card and row of the same PR must never be rendered together, and offscreen rows would be snapshotted too.
5. **Firefox only since 144 (Oct 2025)** and nested groups (`view-transition-group`, which a column's children would want for clipping) are Chromium only.
6. **No reduced-motion handling built in**: neither the spec nor MDN's guide mentions `prefers-reduced-motion`; we'd gate it ourselves as with FLIP.

View Transitions do remain the best fit for the card ↔ row morph *in principle* (it's a shared-element transition). Revisit when element-scoped transitions are Baseline and if `land` becomes a maintenance burden; the `data-flip="pr:<key>"` keys map one-to-one onto `view-transition-name`s, so the swap would be local to the motion module.

### Reduced motion

- Own FLIP: one `matchMedia("(prefers-reduced-motion: reduce)")` gate in the motion module, plus the CSS block H already has (`animation: none; transition: none`). Improve on H: H reads the media query once at load (`const REDUCED = ...matches`); the module should listen for `change` so toggling the OS setting applies without a reload. When reduced, `useFlip` still records positions but animates nothing; `land` is skipped (H already does `if (!REDUCED) liftFlyers(...)`); the sheet opens/closes instantly.
- auto-animate respects it by default (`disrespectUserMotionPreference` opts out); motion's `animate()` and View Transitions don't — we'd gate them ourselves anyway.

### SSE updates during an animation

- **Reorder**: safe by construction — the next commit's FLIP composes onto the running one.
- **Morph**: flyers are clones in the effects layer and land on target rects measured once in `land`. If an SSE update re-sorts during the ~0.7 s flight, flyers land on stale rects. Fix in the motion module: an "animation busy" gate that the SSE hook (`useDashboard`) consults to hold the next snapshot until the morph's `finished` promises settle (≤ ~1 s), then render once (FLIP then glides anything that moved).
- **Sheet**: closing measures the slot's rect at close time, so updates while it's open are fine; if the PR disappeared, it falls back to the original rect (H already does this).

### Transform/opacity only

H's reorder, sheet and drag animate only `transform`/`opacity`. Two spots in `land` animate `left/top/width/height` on the fixed-position flyer box (so the tint and stripe stretch without distorting); either accept it (the flyers are out-of-flow clones, so no reflow of the board) or switch them to translate+scale with the content faded out, as the sheet does. Decide in the morph ticket; doesn't affect the choice of tool.

## Sources

- CSSWG, [CSS View Transitions Module Level 1](https://drafts.csswg.org/css-view-transitions-1/) (§1.1, §4.2, §6.1, §7.1.1, §7.3, §7.3.3)
- MDN, [view-transition-name](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/view-transition-name), [Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)
- [`@mdn/browser-compat-data`](https://www.npmjs.com/package/@mdn/browser-compat-data) 8.1.7 and [`web-features`](https://www.npmjs.com/package/web-features) `data.json`
- Motion: [animate()](https://motion.dev/docs/animate), [React layout animations](https://motion.dev/docs/react-layout-animations), npm metadata of `motion` / `framer-motion` 14.9.0
- AutoAnimate: [docs](https://auto-animate.formkit.com/), npm package `@formkit/auto-animate` 0.10.0 (`package.json` exports, `index.mjs`, `index.d.ts`, `preact/index.mjs`)
- Preact: [`compat/src/index.js`](https://github.com/preactjs/preact/blob/main/compat/src/index.js) (`flushSync`)
- Prototype: `web/prototype/variants/H.tsx` on `prototype/dashboard-layouts` (`spring`, `layoutPos`, `useFlip`, `Detail`, `liftFlyers`, `land`)
