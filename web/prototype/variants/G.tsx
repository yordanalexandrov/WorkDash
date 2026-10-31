// PROTOTYPE concept G: the kanban of B made alive: FLIP, drag to "видях", morphing detail sheet, replay of the last 48h.
import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ClosedPullRequest, DashboardPullRequest, Section } from "../../src/api.js";
import { statusBadges } from "../../src/badges.js";
import { age, sectionTitle, statusText } from "../../src/format.js";
import { type CiState, type MergeStateStatus, pushedAt, type ReviewState } from "../../../src/domain/types.js";
import type { VariantProps } from "../types.js";

export const name = "Жив канбан";

const STYLE = `
body { margin: 0; background: #eef0f7; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
@media (prefers-color-scheme: dark) { body { background: #0f1218; } }
.vG {
  --bg: #eef0f7; --col: rgba(255,255,255,.62); --col-solid: #f7f8fc; --card: #fff; --line: rgba(20,30,60,.12); --text: #1a1f2b;
  --muted: #5d6880; --faint: #8a93a8; --ok: #1f9d63; --bad: #e0453a; --pending: #c99400; --blue: #3b7cff; --merged: #7b61e8;
  --chip: rgba(255,255,255,.75); --chip-on: #1a1f2b; --chip-on-text: #fff; --glass: rgba(246,247,252,.8);
  --shadow: 0 1px 2px rgba(20,30,60,.10), 0 2px 6px rgba(20,30,60,.06);
  --lifted: 0 14px 30px -8px rgba(20,30,60,.28), 0 4px 10px rgba(20,30,60,.10);
  --tag-l: 40%; --tag-bg-l: 92%; --tint-l: 62%; --tint-mix: 17%; --stripe-l: 52%; --blob-a: .30; --dot: rgba(20,30,60,.07);
  color: var(--text); min-height: 100vh; position: relative; padding-bottom: 80px; box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .vG {
    --tint-l: 46%; --tint-mix: 24%; --stripe-l: 58%;
    --bg: #0f1218; --col: rgba(26,31,42,.72); --col-solid: #1a1f2a; --card: #232a37; --line: rgba(200,215,255,.11); --text: #e2e7f0;
    --muted: #9ba7bd; --faint: #6f7a90; --ok: #4fd69c; --bad: #ff6f63; --pending: #f0c419; --blue: #6c9dff; --merged: #a690ff;
    --chip: rgba(30,36,48,.8); --chip-on: #e2e7f0; --chip-on-text: #0f1218; --glass: rgba(15,18,24,.78);
    --shadow: 0 1px 2px rgba(0,0,0,.5), 0 0 0 1px rgba(200,215,255,.05);
    --lifted: 0 16px 34px -8px rgba(0,0,0,.7), 0 0 0 1px rgba(200,215,255,.10);
    --tag-l: 76%; --tag-bg-l: 22%; --blob-a: .16; --dot: rgba(200,215,255,.05);
  }
}
.vG * { box-sizing: border-box; }
.vG a { color: inherit; text-decoration: none; }
.vG a:hover { text-decoration: underline; }
.vG button { font: inherit; }

/* Slow gradient mesh behind everything. */
.vG .bg { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.vG .bg i { position: absolute; width: 70vmax; height: 70vmax; border-radius: 50%; will-change: transform;
  background: radial-gradient(circle at center, hsl(var(--h) 90% 62% / var(--blob-a)), transparent 62%);
  animation: vg-drift var(--d) ease-in-out infinite alternate; }
.vG .bg i:nth-child(1) { --h: 228; --d: 38s; left: -20vmax; top: -25vmax; }
.vG .bg i:nth-child(2) { --h: 330; --d: 46s; right: -25vmax; top: -10vmax; animation-delay: -12s; }
.vG .bg i:nth-child(3) { --h: 165; --d: 52s; left: 10vmax; bottom: -35vmax; animation-delay: -25s; }
.vG .bg i:nth-child(4) { --h: 270; --d: 60s; right: 0; bottom: -30vmax; animation-delay: -6s; }
.vG .bg::after { content: ""; position: absolute; inset: 0; background-image: radial-gradient(var(--dot) 1px, transparent 1.2px); background-size: 22px 22px; }
@keyframes vg-drift {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(8vmax, 6vmax) scale(1.15); }
  100% { transform: translate(-6vmax, 10vmax) scale(.92); }
}
.vG .wrap { position: relative; z-index: 1; }

.vG .top { position: sticky; top: 0; z-index: 5; padding: 12px 16px 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
  background: linear-gradient(var(--glass), var(--glass) 70%, transparent); }
.vG h1 { margin: 0; font-size: 19px; letter-spacing: -.02em; display: flex; align-items: center; gap: 8px; }
.vG h1 .live { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); position: relative; }
.vG h1 .live::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--ok); animation: vg-ping 2s cubic-bezier(0,0,.2,1) infinite; }
@keyframes vg-ping { 75%, 100% { transform: scale(2.6); opacity: 0; } }
.vG .status { color: var(--muted); font-size: 12px; flex: 1 1 auto; }
.vG .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; width: 100%; }
.vG .toolbar .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
.vG .chip { font-size: 12px; border: 1px solid var(--line); background: var(--chip); color: var(--text); border-radius: 999px; padding: 4px 11px;
  cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: transform .2s cubic-bezier(.34,1.56,.64,1), background .2s, color .2s; }
.vG .chip:hover { transform: translateY(-1px); }
.vG .chip:active { transform: scale(.94); }
.vG .chip.on { background: var(--chip-on); color: var(--chip-on-text); border-color: var(--chip-on); }
.vG .chip .dot { width: 8px; height: 8px; border-radius: 50%; }
.vG .chip .n { opacity: .65; }
.vG .play { margin-left: auto; border: 0; color: #fff; font-weight: 650; background: linear-gradient(110deg, #5b6cff, #b14dff, #ff5c8a, #5b6cff);
  background-size: 300% 100%; animation: vg-slide 6s linear infinite; box-shadow: 0 4px 16px -4px rgba(140,80,255,.6); }
.vG .play.on { background: var(--chip-on); color: var(--chip-on-text); animation: none; box-shadow: none; }
@keyframes vg-slide { to { background-position: 300% 0; } }

/* Replay panel */
.vG .replay { width: 100%; display: grid; grid-template-columns: auto auto 1fr auto; gap: 6px 12px; align-items: center; padding: 10px 12px;
  border-radius: 12px; background: var(--col-solid); box-shadow: var(--shadow); animation: vg-drop .45s cubic-bezier(.34,1.56,.64,1) both; }
@keyframes vg-drop { from { opacity: 0; transform: translateY(-12px) scale(.98); } }
.vG .replay .btn { border: 1px solid var(--line); background: var(--chip); color: var(--text); border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.vG .replay .btn.on { background: var(--chip-on); color: var(--chip-on-text); }
.vG .replay .clock { font: 600 20px/1 ui-monospace, monospace; letter-spacing: -.02em; min-width: 132px; font-variant-numeric: tabular-nums; }
.vG .replay .clock small { display: block; font: 11px system-ui, sans-serif; color: var(--muted); margin-top: 3px; }
.vG .replay .track { position: relative; height: 44px; }
.vG .replay svg { position: absolute; inset: 0 0 12px; width: 100%; height: 32px; }
.vG .replay input { position: absolute; left: 0; right: 0; bottom: -4px; width: 100%; margin: 0; accent-color: #8a5cff; }
.vG .replay .speeds { display: flex; gap: 4px; }
.vG .replay .fired { font-size: 11px; color: var(--muted); grid-column: 1 / -1; }

/* Feed of replayed events */
.vG .feed { position: fixed; right: 16px; top: 150px; width: 300px; display: flex; flex-direction: column; gap: 8px; z-index: 30; pointer-events: none; }
.vG .toast { pointer-events: auto; cursor: pointer; background: var(--col-solid); border-radius: 10px; padding: 8px 10px; box-shadow: var(--lifted);
  border-left: 3px solid var(--c); font-size: 12.5px; animation: vg-toast .5s cubic-bezier(.34,1.56,.64,1) both; }
.vG .toast.old { opacity: 0; transform: translateX(30px); transition: opacity .5s, transform .5s; }
.vG .toast .row { display: flex; align-items: center; gap: 6px; }
.vG .toast .snip { color: var(--muted); margin-top: 4px; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vG .toast.comment { --c: var(--blue); } .vG .toast.commit { --c: var(--pending); } .vG .toast.review { --c: var(--ok); }
.vG .toast.changes { --c: var(--bad); } .vG .toast.merged { --c: var(--merged); }
@keyframes vg-toast { from { opacity: 0; transform: translateX(60px) scale(.9); } }

/* Board */
.vG .board { position: relative; display: flex; gap: 12px; align-items: flex-start; overflow-x: auto; padding: 6px 16px 18px; }
.vG .col { position: relative; flex: 0 0 280px; border-radius: 14px; display: flex; flex-direction: column; max-height: calc(100vh - 160px);
  background: var(--col); box-shadow: inset 0 3px 0 var(--accent), var(--shadow);
  animation: vg-col .7s cubic-bezier(.22,1.3,.36,1) both; animation-delay: calc(var(--ci) * 80ms); }
.vG.booted .col, .vG.booted .slot { animation-delay: 0s; }
@keyframes vg-col { from { opacity: 0; transform: translateY(40px) scale(.94); } }
.vG .col > * { position: relative; z-index: 1; }
.vG .col-head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px; cursor: pointer; user-select: none; }
.vG .col-head h2 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
.vG .count { font-size: 12px; font-weight: 700; color: var(--text); background: var(--card); border-radius: 999px; padding: 1px 8px; min-width: 24px;
  text-align: center; font-variant-numeric: tabular-nums; box-shadow: var(--shadow); }
.vG .col-head .fold { margin-left: auto; color: var(--faint); font-size: 12px; transition: transform .3s; }
.vG .cards { position: relative; display: flex; flex-direction: column; gap: 9px; padding: 2px 9px 12px; overflow-y: auto; overflow-x: hidden; }
.vG .col.strip { flex: 0 0 46px; cursor: pointer; align-self: stretch; max-height: none; min-height: 240px; }
.vG .col.strip .col-head { flex-direction: column; padding: 12px 0; gap: 10px; }
.vG .col.strip h2 { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
.vG .col.strip .fold { margin: 0; }
.vG .empty { color: var(--faint); font-size: 12px; text-align: center; padding: 14px 0 6px; }

/* "Чака теб": rotating gradient border plus a breathing halo. */
.vG .col.hot { background: transparent; box-shadow: none; }
.vG .col.hot .col-head h2 { color: var(--bad); }
.vG .ring, .vG .halo { position: absolute; inset: 0; border-radius: 14px; pointer-events: none; z-index: 0; }
.vG .ring { overflow: hidden; }
.vG .ring::before { content: ""; position: absolute; left: 50%; top: 50%; width: 1800px; height: 1800px; margin: -900px 0 0 -900px;
  background: conic-gradient(from 0deg, var(--bad), #ff9f43, #b14dff, #3b7cff, var(--bad)); animation: vg-spin 7s linear infinite; }
.vG .ring::after { content: ""; position: absolute; inset: 2px; border-radius: 12px; background: var(--col-solid); }
.vG .halo { inset: -4px; border-radius: 18px; box-shadow: 0 0 28px 2px color-mix(in srgb, var(--bad) 45%, transparent); animation: vg-breathe 3s ease-in-out infinite; }
@keyframes vg-spin { to { transform: rotate(1turn); } }
@keyframes vg-breathe { 50% { opacity: .25; } }

/* Tickets: the slot moves (entrance, FLIP), the card tilts. */
.vG .slot { position: relative; animation: vg-in .65s cubic-bezier(.34,1.56,.64,1) both;
  animation-delay: calc(240ms + var(--ci) * 80ms + var(--ti) * 60ms); }
.vG .slot.ghost { visibility: hidden; }
.vG .slot.drag { touch-action: none; }
.vG .slot.drag .card { cursor: grab; }
@keyframes vg-in { from { opacity: 0; transform: translateY(26px) scale(.9) rotate(-1.5deg); } }
.vG .card { --tint: color-mix(in srgb, hsl(var(--rh, 220) 85% var(--tint-l)) var(--tint-mix), var(--card));
  position: relative; background: var(--tint); border-left: 4px solid hsl(var(--rh, 220) 70% var(--stripe-l)); border-radius: 10px; box-shadow: var(--shadow); padding: 9px 11px 8px; display: flex;
  flex-direction: column; gap: 6px; cursor: pointer; outline: none;
  transform: perspective(800px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(var(--lift, 0px));
  transition: transform .25s ease-out, box-shadow .25s ease-out; }
.vG .card:hover, .vG .card:focus-visible { --lift: -3px; box-shadow: var(--lifted); }
.vG .card:focus-visible { box-shadow: var(--lifted), 0 0 0 2px var(--blue); }
.vG .card::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0; transition: opacity .25s;
  background: radial-gradient(260px circle at var(--mx, 50%) var(--my, 0%), rgba(255,255,255,.55), transparent 45%); mix-blend-mode: soft-light; }
.vG .card:hover::before { opacity: 1; }
.vG .card::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0;
  box-shadow: 0 0 0 1.5px var(--urg), 0 0 18px -2px var(--urg); }
.vG .slot.u1 .card { --urg: var(--pending); } .vG .slot.u2 .card { --urg: var(--bad); }
.vG .slot.u1 .card::after { animation: vg-pulse 3.2s ease-in-out infinite; --peak: .45; }
.vG .slot.u2 .card::after { animation: vg-pulse 1.8s ease-in-out infinite; --peak: .95; }
@keyframes vg-pulse { 50% { opacity: var(--peak); } }
.vG .card.draft { background: repeating-linear-gradient(135deg, var(--tint), var(--tint) 8px, var(--col-solid) 8px, var(--col-solid) 10px); }
.vG .ripple { position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, var(--rc) 0%, transparent 70%); }
.vG .card-wrap { position: absolute; inset: 0; border-radius: 10px; overflow: hidden; pointer-events: none; }
.vG .card-top { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.vG .tag { font-weight: 650; border-radius: 5px; padding: 1px 6px; color: hsl(var(--h) 60% var(--tag-l)); background: hsl(var(--h) 70% var(--tag-bg-l));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.vG .num { color: var(--faint); }
.vG .age { margin-left: auto; color: var(--faint); white-space: nowrap; }
.vG .title { font-size: 13.5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.vG .reason { align-self: flex-start; font-size: 11px; font-weight: 700; border-radius: 5px; padding: 1px 7px; color: #fff; background: var(--bad); }
.vG .reason.pending { background: var(--pending); color: #1d2125; }
.vG .reason.muted { background: var(--faint); }
.vG .jira { display: flex; flex-wrap: wrap; gap: 4px; }
.vG .jira a { font-size: 10.5px; font-family: ui-monospace, monospace; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
.vG .card-foot { display: flex; align-items: center; gap: 6px; min-height: 24px; }
.vG .av { width: 22px; height: 22px; border-radius: 50%; display: inline-grid; place-items: center; flex: none; font-size: 9.5px; font-weight: 700;
  color: #fff; background: hsl(var(--h) 50% 50%); border: 2px solid var(--tint, var(--card)); }
.vG .icons { display: flex; align-items: center; gap: 5px; }
.vG .chk { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 650; color: var(--c); }
.vG .chk.ok { --c: var(--ok); } .vG .chk.bad { --c: var(--bad); } .vG .chk.pending { --c: var(--pending); }
.vG .chk svg { width: 15px; height: 15px; }
.vG .chk .trk { stroke: color-mix(in srgb, var(--c) 22%, transparent); }
.vG .chk .arc { stroke: var(--c); stroke-dasharray: 37.7; stroke-dashoffset: 0; animation: vg-draw .9s cubic-bezier(.3,.9,.3,1) both .5s; }
.vG .chk.pending .arc { stroke-dasharray: 11 26.7; animation: none; }
.vG .chk.pending svg { animation: vg-spin 1.1s linear infinite; }
@keyframes vg-draw { from { stroke-dashoffset: 37.7; } }
.vG .ic { font-size: 10.5px; font-weight: 650; border-radius: 4px; padding: 0 4px; line-height: 18px; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
.vG .ic.ok { --c: var(--ok); } .vG .ic.bad { --c: var(--bad); } .vG .ic.pending { --c: var(--pending); } .vG .ic.muted { --c: var(--faint); }
.vG .reviews { display: flex; margin-left: auto; }
.vG .reviews .av { width: 20px; height: 20px; margin-left: -6px; position: relative; }
.vG .av.rv::after { content: ""; position: absolute; right: -3px; bottom: -3px; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--tint, var(--card)); background: var(--c); }
.vG .av.ok { --c: var(--ok); } .vG .av.bad { --c: var(--bad); } .vG .av.muted { --c: var(--faint); }
.vG .av.ask { background: transparent; color: var(--muted); border: 1.5px dashed var(--faint); }
.vG .seen { font-size: 11px; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 5px; padding: 1px 7px; cursor: pointer;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
.vG .seen:hover { color: var(--text); border-color: var(--faint); transform: scale(1.06); }
.vG .grip { color: var(--faint); font-size: 11px; letter-spacing: -2px; margin-right: -2px; }
.vG .closed-st { font-size: 11px; font-weight: 650; }
.vG .closed-st.merged { color: var(--merged); } .vG .closed-st.bad { color: var(--bad); }
.vG .col.closed .card { box-shadow: none; border: 1px dashed var(--line); border-left: 4px solid hsl(var(--rh, 220) 70% var(--stripe-l)); background: color-mix(in srgb, var(--tint) 55%, transparent); }

/* Effects layer: drag clone, sparks, confetti. */
.vG .fx { position: fixed; inset: 0; pointer-events: none; z-index: 60; overflow: hidden; }
.vG .clone { position: absolute; margin: 0; animation: none !important; z-index: 2; }
.vG .clone .card { transform: none; transition: none; box-shadow: 0 26px 50px -10px rgba(0,0,0,.45), 0 0 0 2px var(--bad); cursor: grabbing; }
.vG .bit { position: absolute; left: 0; top: 0; border-radius: 2px; will-change: transform, opacity; }
.vG .bubble { position: absolute; left: 0; top: 0; font-weight: 800; font-size: 15px; color: var(--ok); white-space: nowrap; }
.vG .drop { position: fixed; left: 50%; bottom: 74px; z-index: 55; width: 300px; height: 92px; margin-left: -150px; border-radius: 22px;
  display: grid; place-items: center; text-align: center; font-weight: 750; font-size: 15px; color: var(--text); pointer-events: none;
  animation: vg-zone .5s cubic-bezier(.34,1.56,.64,1) both; transition: transform .25s cubic-bezier(.34,1.56,.64,1); }
.vG .drop small { display: block; font-weight: 500; font-size: 11.5px; color: var(--muted); }
.vG .drop .ring { border-radius: 22px; }
.vG .drop .ring::before { background: conic-gradient(from 0deg, var(--ok), #3bd1ff, #b14dff, var(--ok)); animation-duration: 2.5s; }
.vG .drop .ring::after { inset: 3px; border-radius: 19px; background: color-mix(in srgb, var(--col-solid) 92%, var(--ok)); }
.vG .drop .halo { border-radius: 26px; box-shadow: 0 0 40px 4px color-mix(in srgb, var(--ok) 55%, transparent); animation-duration: 1.2s; }
.vG .drop > div { position: relative; z-index: 1; }
.vG .drop.over { transform: scale(1.1); }
.vG .drop.over .ring::after { background: color-mix(in srgb, var(--col-solid) 70%, var(--ok)); }
@keyframes vg-zone { from { opacity: 0; transform: translateY(40px) scale(.8); } }

/* Detail sheet */
.vG .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(10,14,24,.42); }
.vG .sheet { position: fixed; z-index: 41; left: 50%; top: 6vh; width: min(760px, calc(100vw - 32px)); max-height: 86vh; transform-origin: 0 0;
  margin-left: calc(min(760px, calc(100vw - 32px)) / -2); background: var(--card); border-radius: 16px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.5);
  display: flex; flex-direction: column; overflow: hidden; }
.vG .sheet .inner { display: flex; flex-direction: column; min-height: 0; }
.vG .sheet header { padding: 16px 18px 12px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.vG .sheet header .card-top { font-size: 12px; }
.vG .sheet h2 { margin: 0; font-size: 18px; line-height: 1.3; letter-spacing: -.01em; }
.vG .sheet .x { margin-left: 8px; border: 0; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 6px; }
.vG .sheet .x:hover { background: var(--line); }
.vG .sheet .meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--muted); }
.vG .sheet .body { display: grid; grid-template-columns: 1.15fr 1fr; gap: 0; overflow: auto; min-height: 0; }
.vG .sheet .pane { padding: 14px 18px; min-width: 0; }
.vG .sheet .pane + .pane { border-left: 1px solid var(--line); }
.vG .sheet h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); }
.vG .sheet h3:not(:first-child) { margin-top: 16px; }
.vG .desc { white-space: pre-wrap; word-break: break-word; font-size: 12.5px; color: var(--muted); max-height: 46vh; overflow: auto; margin: 0; font-family: inherit; }
.vG .item { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; font-size: 12.5px; }
.vG .item + .item { border-top: 1px dashed var(--line); }
.vG .item .who { font-weight: 650; }
.vG .item .when { color: var(--faint); font-size: 11px; margin-left: 6px; }
.vG .item .txt { color: var(--muted); margin-top: 2px; white-space: pre-wrap; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.vG .item code { font-family: ui-monospace, monospace; font-size: 11.5px; }
.vG .sheet footer { padding: 10px 18px; border-top: 1px solid var(--line); display: flex; gap: 8px; justify-content: flex-end; }
.vG .sheet footer a, .vG .sheet footer button { border: 1px solid var(--line); background: var(--chip); color: var(--text); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
.vG .sheet footer .primary { background: var(--ok); color: #fff; border-color: transparent; font-weight: 650; }
.vG .none { color: var(--faint); font-size: 12px; }
@media (max-width: 640px) {
  .vG .sheet .body { grid-template-columns: 1fr; }
  .vG .sheet .pane + .pane { border-left: 0; border-top: 1px solid var(--line); }
  .vG .feed { width: calc(100vw - 32px); top: auto; bottom: 74px; }
  .vG .replay { grid-template-columns: auto 1fr; }
  .vG .replay .track { grid-column: 1 / -1; }
}
@media (prefers-reduced-motion: reduce) {
  .vG *, .vG *::before, .vG *::after { animation: none !important; transition: none !important; }
  .vG .card { transform: none; }
}
`;

const ACCENT: Record<Section | "closed", string> = {
  waiting_on_me: "var(--bad)",
  free_for_review: "var(--blue)",
  ready_to_merge: "var(--ok)",
  waiting_on_others: "var(--pending)",
  team: "var(--faint)",
  closed: "var(--merged)",
};

const URGENT = new Set(["ci_failed", "sonar_failed", "review_requested", "changes_requested", "conflict", "mention"]);

const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A damped spring sampled into a CSS linear() easing; falls back to an overshooting bezier where linear() is missing. */
function spring(stiffness: number, damping: number): { easing: string; duration: number } {
  let x = 0;
  let v = 0;
  const dt = 1 / 120;
  const samples: number[] = [];
  let t = 0;
  for (; t < 3; t += dt) {
    v += (stiffness * (1 - x) - damping * v) * dt;
    x += v * dt;
    samples.push(x);
    if (t > 0.2 && Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02) break;
  }
  const step = Math.max(1, Math.floor(samples.length / 48));
  const points = ["0", ...samples.filter((_, i) => i % step === 0).map((s) => s.toFixed(3)), "1"];
  const easing = `linear(${points.join(", ")})`;
  const ok = typeof CSS !== "undefined" && CSS.supports("transition-timing-function", easing);
  return { easing: ok ? easing : "cubic-bezier(.34,1.56,.64,1)", duration: Math.round(t * 1000) };
}

const GLIDE = spring(260, 24);
const BOUNCE = spring(320, 16);

function hue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

// Well-apart hues, one per repo in name order, so every project gets its own colour.
const REPO_HUES = [215, 28, 155, 285, 345, 190, 95, 50];
let repoHues = new Map<string, number>();
function assignRepoHues(repos: string[]) {
  repoHues = new Map([...new Set(repos)].sort().map((repo, i) => [repo, REPO_HUES[i % REPO_HUES.length]! + Math.floor(i / REPO_HUES.length) * 17]));
}
const repoHue = (repo: string) => repoHues.get(repo) ?? hue(repo);

const shortRepo = (repo: string) => repo.slice(repo.indexOf("/") + 1);
const keyOf = (pr: { repo: string; number: number }) => `${pr.repo}#${pr.number}`;
const same = (a: string | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function initials(login: string): string {
  const parts = login.split(/[-_.]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : login.slice(0, 2);
  return letters.toUpperCase();
}

function Avatar({ login, cls = "", title }: { login: string; cls?: string; title?: string }) {
  return (
    <span class={`av ${cls}`} style={{ "--h": hue(login) }} title={title ?? login}>
      {initials(login)}
    </span>
  );
}

// ---------- motion helpers ----------

/** Position in the layout, ignoring transforms, relative to the nearest [data-flip-root] above `el`. */
function layoutPos(el: HTMLElement): { x: number; y: number } {
  const root = el.parentElement?.closest("[data-flip-root]");
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) break;
    if (parent !== root) {
      x -= parent.scrollLeft;
      y -= parent.scrollTop;
    }
    node = parent;
  }
  return { x, y };
}

/** FLIP: after every render, elements marked [data-flip] that moved glide from where they were. */
function useFlip(ref: RefObject<HTMLElement>) {
  const before = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const now = new Map<string, { x: number; y: number }>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const id = el.dataset.flip!;
      const pos = layoutPos(el);
      now.set(id, pos);
      const old = before.current.get(id);
      if (REDUCED || !old) return;
      const dx = old.x - pos.x;
      const dy = old.y - pos.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: GLIDE.duration,
        easing: GLIDE.easing,
        composite: "add",
      });
    });
    before.current = now;
  });
}

function addBit(layer: HTMLElement, cls: string, css: Partial<CSSStyleDeclaration>, text = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = cls;
  Object.assign(el.style, css);
  el.textContent = text;
  layer.appendChild(el);
  return el;
}

function confetti(layer: HTMLElement, x: number, y: number, count = 46) {
  if (REDUCED) return;
  for (let i = 0; i < count; i++) {
    const bit = addBit(layer, "bit", {
      width: `${rand(5, 9)}px`,
      height: `${rand(8, 14)}px`,
      background: `hsl(${rand(0, 360)} 90% 60%)`,
    });
    const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const power = rand(120, 300);
    const dx = Math.cos(angle) * power;
    const peak = Math.sin(angle) * power;
    const spin = rand(-720, 720);
    bit
      .animate(
        [
          { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 1, easing: "cubic-bezier(.15,.8,.35,1)" },
          { transform: `translate(${x + dx * 0.75}px, ${y + peak}px) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.4, easing: "cubic-bezier(.5,0,.9,.6)" },
          { transform: `translate(${x + dx}px, ${y + peak + rand(220, 380)}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: rand(1300, 2000), fill: "forwards" },
      )
      .finished.then(() => bit.remove());
  }
}

function sparks(layer: HTMLElement, x: number, y: number, label: string) {
  if (REDUCED) return;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + rand(-0.2, 0.2);
    const dist = rand(40, 90);
    const size = rand(4, 8);
    const bit = addBit(layer, "bit", { width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: `hsl(${rand(120, 170)} 75% 55%)` });
    bit
      .animate(
        [
          { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 },
          { transform: `translate(${x + Math.cos(angle) * dist}px, ${y + Math.sin(angle) * dist}px) scale(.2)`, opacity: 0 },
        ],
        { duration: rand(500, 800), easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" },
      )
      .finished.then(() => bit.remove());
  }
  const bubble = addBit(layer, "bubble", {}, label);
  bubble
    .animate(
      [
        { transform: `translate(${x - 30}px, ${y - 10}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${x - 30}px, ${y - 40}px) scale(1.15)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${x - 30}px, ${y - 80}px) scale(1)`, opacity: 0 },
      ],
      { duration: 1100, easing: "ease-out", fill: "forwards" },
    )
    .finished.then(() => bubble.remove());
}

/** Makes a ticket on the board ripple, as if something just happened on it. */
function flashTicket(board: HTMLElement | null, key: string, color: string) {
  const slot = board?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(`pr:${key}`)}"]`);
  const wrap = slot?.querySelector<HTMLElement>(".card-wrap");
  const card = slot?.querySelector<HTMLElement>(".card");
  if (!wrap || !card) return;
  slot!.scrollIntoView({ block: "nearest", inline: "nearest", behavior: REDUCED ? "auto" : "smooth" });
  if (REDUCED) {
    card.animate([{ outline: `2px solid ${color}` }, { outline: `2px solid ${color}` }], { duration: 600 });
    return;
  }
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.setProperty("--rc", color);
  wrap.appendChild(ripple);
  ripple
    .animate([{ transform: "scale(0)", opacity: 0.9 }, { transform: "scale(9)", opacity: 0 }], { duration: 900, easing: "cubic-bezier(.2,.7,.3,1)" })
    .finished.then(() => ripple.remove());
  card.animate([{ scale: "1" }, { scale: "1.045" }, { scale: "1" }], { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" });
}

// ---------- small parts ----------

function CountUp({ value, delay }: { value: number; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(REDUCED ? value : 0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (from === value || REDUCED) {
      shown.current = value;
      el.textContent = String(value);
      return;
    }
    el.textContent = String(from);
    let frame = 0;
    let start = 0;
    const tick = (time: number) => {
      start ||= time + delay;
      const p = Math.min(1, Math.max(0, (time - start) / 700));
      const eased = 1 - Math.pow(1 - p, 3);
      shown.current = Math.round(from + (value - from) * eased);
      el.textContent = String(shown.current);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
<span class="count" ref={ref} />
  );
}

const CHECK_KIND: Record<CiState, string> = { SUCCESS: "ok", FAILURE: "bad", ERROR: "bad", PENDING: "pending", EXPECTED: "pending" };

function Ring({ label, state }: { label: string; state: CiState | null }) {
  if (!state) return null;
  const kind = CHECK_KIND[state];
  return (
    <span class={`chk ${kind}`} title={`${label}: ${state}`}>
      <svg viewBox="0 0 16 16" fill="none" stroke-width="2.2" stroke-linecap="round">
        <circle class="trk" cx="8" cy="8" r="6" />
        <circle class="arc" cx="8" cy="8" r="6" transform="rotate(-90 8 8)" />
        {kind === "ok" ? <path d="M5.4 8.2l1.8 1.8 3.4-3.6" stroke="currentColor" stroke-width="1.6" /> : null}
        {kind === "bad" ? <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.6" /> : null}
      </svg>
      {label}
    </span>
  );
}

const MERGE: Partial<Record<MergeStateStatus, [string, string, string]>> = {
  DIRTY: ["⨯ конфликт", "bad", "Има конфликт с base клона"],
  BEHIND: ["↻", "pending", "Клонът е изостанал, трябва rebase"],
  BLOCKED: ["⏸", "muted", "Merge е блокиран от правилата на repo-то"],
  CLEAN: ["⇢ merge", "ok", "Може да се merge-не"],
  HAS_HOOKS: ["⇢ merge", "ok", "Може да се merge-не"],
  UNSTABLE: ["⇢ merge", "ok", "Може да се merge-не, незадължителни проверки не минават"],
};

const REVIEW: Partial<Record<ReviewState, [string, string]>> = {
  APPROVED: ["ok", "одобри"],
  CHANGES_REQUESTED: ["bad", "иска промени"],
  COMMENTED: ["muted", "коментира"],
};

function mergeMark(pr: DashboardPullRequest) {
  const key = pr.mergeable === "CONFLICTING" ? "DIRTY" : pr.mergeStateStatus;
  return pr.reason === "needs_rebase" && key === "BEHIND" ? undefined : MERGE[key];
}

function askedReviewers(pr: DashboardPullRequest): string[] {
  const reviewed = new Set(pr.reviews.map((r) => r.author.toLowerCase()));
  return pr.requestedReviewers.filter((login) => !reviewed.has(login.toLowerCase()));
}

// ---------- tickets ----------

type TicketProps = {
  pr: DashboardPullRequest;
  now: Date;
  ci: number;
  ti: number;
  ghost: boolean;
  draggable: boolean;
  onOpen(pr: DashboardPullRequest, el: HTMLElement): void;
  onSeenClick?(pr: DashboardPullRequest, slot: HTMLElement): void;
  onGrab?(e: PointerEvent, pr: DashboardPullRequest, slot: HTMLElement): void;
  suppressClick: RefObject<boolean>;
};

function tilt(e: PointerEvent) {
  if (REDUCED || e.pointerType !== "mouse" || e.buttons) return;
  const card = e.currentTarget as HTMLElement;
  const r = card.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width;
  const py = (e.clientY - r.top) / r.height;
  card.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
  card.style.setProperty("--rx", `${(0.5 - py) * 9}deg`);
  card.style.setProperty("--mx", `${px * 100}%`);
  card.style.setProperty("--my", `${py * 100}%`);
}

function untilt(e: PointerEvent) {
  const card = e.currentTarget as HTMLElement;
  card.style.setProperty("--rx", "0deg");
  card.style.setProperty("--ry", "0deg");
}

function Ticket({ pr, now, ci, ti, ghost, draggable, onOpen, onSeenClick, onGrab, suppressClick }: TicketProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reason = pr.reason ? statusBadges(pr)[0] : undefined;
  const merge = mergeMark(pr);
  const urgency = pr.reason ? (URGENT.has(pr.reason) ? " u2" : " u1") : "";
  const open = (e: Event) => {
    if ((e.target as HTMLElement).closest("a, button") || suppressClick.current) return;
    onOpen(pr, ref.current!);
  };
  return (
    <div
      ref={ref}
      class={`slot${urgency}${ghost ? " ghost" : ""}${draggable ? " drag" : ""}`}
      data-flip={`pr:${keyOf(pr)}`}
      style={{ "--ci": ci, "--ti": ti }}
      onPointerDown={onGrab ? (e) => onGrab(e, pr, ref.current!) : undefined}
    >
      <article
        class={`card${pr.isDraft ? " draft" : ""}`}
        style={{ "--rh": repoHue(pr.repo) }}
        tabIndex={0}
        onPointerMove={tilt}
        onPointerLeave={untilt}
        onClick={open}
        onKeyDown={(e) => e.key === "Enter" && open(e)}
      >
        <div class="card-wrap" />
        <div class="card-top">
          {draggable ? (
            <span class="grip" title="Влачи до „видях“">
              ⠿
            </span>
          ) : null}
          <span class="tag" style={{ "--h": repoHue(pr.repo) }} title={pr.repo}>
            {shortRepo(pr.repo)}
          </span>
          <a class="num" href={pr.url} target="_blank" rel="noreferrer">
            #{pr.number}
          </a>
          <span class="age" title={`Отворен ${new Date(pr.createdAt).toLocaleString()} · обновен преди ${age(pr.updatedAt, now)}`}>
            {age(pr.createdAt, now)}
          </span>
        </div>
        {reason ? (
          <span class={`reason ${reason.kind}`} title={reason.title}>
            {reason.text}
          </span>
        ) : null}
        <a class="title" href={pr.url} target="_blank" rel="noreferrer">
          {pr.isDraft ? "[draft] " : ""}
          {pr.title}
        </a>
        {pr.jira.length ? (
          <div class="jira">
            {pr.jira.map((j) => (
              <a key={j.key} href={j.url} target="_blank" rel="noreferrer">
                {j.key}
              </a>
            ))}
          </div>
        ) : null}
        <div class="card-foot">
          <Avatar login={pr.author} title={`автор: ${pr.author}`} />
          <div class="icons">
            {pr.reason === "ci_failed" ? null : <Ring label="CI" state={pr.ci} />}
            {pr.reason === "sonar_failed" ? null : <Ring label="SQ" state={pr.sonar} />}
            {merge ? (
              <span class={`ic ${merge[1]}`} title={merge[2]}>
                {merge[0]}
              </span>
            ) : null}
            {pr.unreadComments ? (
              <span class="ic pending" title="непрочетени коментари">
                💬{pr.unreadComments}
              </span>
            ) : null}
          </div>
          <div class="reviews">
            {pr.reviews.map((r) => {
              const mark = REVIEW[r.state];
              return mark ? <Avatar key={r.author} login={r.author} cls={`rv ${mark[0]}`} title={`${r.author} ${mark[1]}`} /> : null;
            })}
            {askedReviewers(pr).map((login) => (
              <Avatar key={login} login={login} cls="ask" title={`${login}: чака се review`} />
            ))}
          </div>
          {onSeenClick ? (
            <button class="seen" onClick={() => onSeenClick(pr, ref.current!)} title="Маркирай като видян (или влачи картата надолу)">
              видях
            </button>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function ClosedTicket({ pr, now, ci, ti }: { pr: ClosedPullRequest; now: Date; ci: number; ti: number }) {
  const merged = pr.state === "MERGED";
  return (
    <div class="slot" data-flip={`pr:${keyOf(pr)}`} style={{ "--ci": ci, "--ti": ti }}>
      <article class="card" style={{ "--rh": repoHue(pr.repo) }} onPointerMove={tilt} onPointerLeave={untilt}>
        <div class="card-wrap" />
        <div class="card-top">
          <span class="tag" style={{ "--h": repoHue(pr.repo) }} title={pr.repo}>
            {shortRepo(pr.repo)}
          </span>
          <a class="num" href={pr.url} target="_blank" rel="noreferrer">
            #{pr.number}
          </a>
          <span class="age" title={new Date(pr.closedAt).toLocaleString()}>
            преди {age(pr.closedAt, now)}
          </span>
        </div>
        <a class="title" href={pr.url} target="_blank" rel="noreferrer">
          {pr.title}
        </a>
        <div class="card-foot">
          <Avatar login={pr.author} />
          <span class={`closed-st ${merged ? "merged" : "bad"}`}>{merged ? "🎉 merged" : "затворен без merge"}</span>
        </div>
      </article>
    </div>
  );
}

type ColumnProps = {
  id: Section | "closed";
  index: number;
  title: string;
  count: number;
  folded: Record<string, boolean>;
  toggle(id: string): void;
  onReveal?(el: HTMLElement): void;
  children: ComponentChildren;
};

function Column({ id, index, title, count, folded, toggle, onReveal, children }: ColumnProps) {
  const ref = useRef<HTMLElement>(null);
  const revealed = useRef(false);
  // Empty columns fold to a strip unless opened by hand; full ones fold only by hand.
  const strip = folded[id] ?? count === 0;
  const hot = id === "waiting_on_me" && count > 0 && !strip;
  useEffect(() => {
    if (strip || revealed.current || !onReveal || !count) return;
    revealed.current = true;
    const timer = setTimeout(() => ref.current && onReveal(ref.current), 700 + index * 80);
    return () => clearTimeout(timer);
  }, [strip]);
  const cls = `col${strip ? " strip" : ""}${id === "closed" ? " closed" : ""}${hot ? " hot" : ""}`;
  return (
    <section
      ref={ref}
      class={cls}
      data-flip={`col:${id}`}
      data-flip-root
      style={{ "--accent": ACCENT[id], "--ci": index }}
      onClick={strip ? () => toggle(id) : undefined}
    >
      {hot ? <span class="halo" /> : null}
      {hot ? <span class="ring" /> : null}
      <header class="col-head" onClick={strip ? undefined : () => toggle(id)} title={strip ? "Разгъни" : "Сгъни"}>
        {strip ? <CountUp value={count} delay={index * 80} /> : null}
        <h2>{title}</h2>
        {strip ? null : <CountUp value={count} delay={240 + index * 80} />}
        <span class="fold">{strip ? "›" : "‹"}</span>
      </header>
      {strip ? null : <div class="cards">{count ? children : <div class="empty">Празно</div>}</div>}
    </section>
  );
}

// ---------- detail sheet ----------

type Open = { pr: DashboardPullRequest; from: DOMRect; closing: boolean };

function Detail({ open, now, board, onClose, onSeen }: { open: Open; now: Date; board: HTMLElement | null; onClose(): void; onSeen?(): void }) {
  const sheet = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const { pr } = open;
  const morph = (from: DOMRect, to: DOMRect) =>
    `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

  useLayoutEffect(() => {
    if (REDUCED || !sheet.current) return;
    const to = sheet.current.getBoundingClientRect();
    sheet.current.animate([{ transform: morph(open.from, to), borderRadius: "10px" }, { transform: "none", borderRadius: "16px" }], {
      duration: 520,
      easing: "cubic-bezier(.2,.95,.25,1)",
    });
    inner.current?.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
      duration: 320,
      delay: 160,
      easing: "ease-out",
      fill: "backwards",
    });
    shade.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  }, []);

  useLayoutEffect(() => {
    if (!open.closing) return;
    if (REDUCED || !sheet.current) return onClose();
    const to = sheet.current.getBoundingClientRect();
    const slot = board?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(`pr:${keyOf(pr)}`)}"]`);
    const back = slot?.getBoundingClientRect() ?? open.from;
    inner.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" });
    shade.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: "forwards" });
    sheet.current
      .animate([{ transform: "none" }, { transform: morph(back, to), borderRadius: "10px" }], {
        duration: 420,
        easing: "cubic-bezier(.4,0,.2,1)",
        fill: "forwards",
      })
      .finished.then(onClose);
  }, [open.closing]);

  const reason = pr.reason ? statusBadges(pr)[0] : undefined;
  const merge = mergeMark(pr);
  const comments = [...pr.comments].reverse().slice(0, 6);
  const commits = [...pr.commits].reverse().slice(0, 6);
  const body = pr.body.replace(/<!--[\s\S]*?-->/g, "").trim();
  return (
    <>
      <div class="backdrop" ref={shade} />
      <div class="sheet" ref={sheet} role="dialog" aria-label={pr.title}>
        <div class="inner" ref={inner}>
          <header>
            <div class="card-top">
              <span class="tag" style={{ "--h": repoHue(pr.repo) }} title={pr.repo}>
                {pr.repo}
              </span>
              <a class="num" href={pr.url} target="_blank" rel="noreferrer">
                #{pr.number}
              </a>
              <span class="age">
                отворен преди {age(pr.createdAt, now)} · обновен преди {age(pr.updatedAt, now)}
              </span>
              <button class="x" onClick={() => onClose()} title="Затвори (Esc)" autoFocus>
                ✕
              </button>
            </div>
            <h2>
              <a href={pr.url} target="_blank" rel="noreferrer">
                {pr.isDraft ? "[draft] " : ""}
                {pr.title}
              </a>
            </h2>
            <div class="meta">
              {reason ? (
                <span class={`reason ${reason.kind}`} title={reason.title}>
                  {reason.text}
                </span>
              ) : null}
              <Ring label="CI" state={pr.ci} />
              <Ring label="Sonar" state={pr.sonar} />
              {merge ? (
                <span class={`ic ${merge[1]}`} title={merge[2]}>
                  {merge[0]}
                </span>
              ) : null}
              <span>
                <code>{pr.headRefName}</code>
              </span>
              {pr.jira.map((j) => (
                <span class="jira" key={j.key}>
                  <a href={j.url} target="_blank" rel="noreferrer">
                    {j.key}
                  </a>
                </span>
              ))}
            </div>
            <div class="meta">
              <Avatar login={pr.author} /> {pr.author}
              {pr.reviews.map((r) => {
                const mark = REVIEW[r.state];
                return mark ? (
                  <span key={r.author} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Avatar login={r.author} cls={`rv ${mark[0]}`} /> {r.author} {mark[1]} · {age(r.submittedAt, now)}
                  </span>
                ) : null;
              })}
              {askedReviewers(pr).map((login) => (
                <span key={login} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Avatar login={login} cls="ask" /> {login} чака се
                </span>
              ))}
            </div>
          </header>
          <div class="body">
            <div class="pane">
              <h3>Описание</h3>
              {body ? <pre class="desc">{body.length > 4000 ? `${body.slice(0, 4000)}…` : body}</pre> : <div class="none">Няма описание</div>}
            </div>
            <div class="pane">
              <h3>Последни коментари</h3>
              {comments.length ? (
                comments.map((c) => (
                  <div class="item" key={c.id}>
                    <Avatar login={c.author} />
                    <div style={{ minWidth: 0 }}>
                      <span class="who">{c.author}</span>
                      <span class="when">
                        преди {age(c.createdAt, now)}
                        {c.thread ? " · в review нишка" : ""}
                      </span>
                      <div class="txt">{c.body}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div class="none">Няма коментари</div>
              )}
              <h3>Commits</h3>
              {commits.length ? (
                commits.map((c) => (
                  <div class="item" key={c.oid}>
                    <code>{c.oid.slice(0, 7)}</code>
                    <span class="when">преди {age(pushedAt(c), now)}</span>
                  </div>
                ))
              ) : (
                <div class="none">Няма</div>
              )}
            </div>
          </div>
          <footer>
            <a href={pr.url} target="_blank" rel="noreferrer">
              Отвори в GitHub ↗
            </a>
            {onSeen ? (
              <button class="primary" onClick={onSeen}>
                видях
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    </>
  );
}

// ---------- replay ----------

type Kind = "comment" | "commit" | "review" | "changes" | "merged";
type Happening = { at: number; key: string; repo: string; number: number; kind: Kind; who: string; what: string; snippet?: string };

const KIND_COLOR: Record<Kind, string> = {
  comment: "var(--blue)",
  commit: "var(--pending)",
  review: "var(--ok)",
  changes: "var(--bad)",
  merged: "var(--merged)",
};

const WINDOW = 48 * 3_600_000;

function happenings(open: DashboardPullRequest[], closed: ClosedPullRequest[], start: number, end: number): Happening[] {
  const out: Happening[] = [];
  const push = (h: Happening) => h.at >= start && h.at <= end && out.push(h);
  for (const pr of open) {
    const base = { key: keyOf(pr), repo: pr.repo, number: pr.number };
    for (const c of pr.comments)
      push({ ...base, at: Date.parse(c.createdAt), kind: "comment", who: c.author, what: "коментира", snippet: c.body.replace(/\s+/g, " ").slice(0, 90) });
    for (const c of pr.commits) push({ ...base, at: Date.parse(pushedAt(c)), kind: "commit", who: pr.author, what: "push-на commit", snippet: c.oid.slice(0, 7) });
    for (const r of pr.reviews) {
      if (r.state === "DISMISSED") continue;
      const kind = r.state === "CHANGES_REQUESTED" ? "changes" : "review";
      const what = r.state === "APPROVED" ? "одобри" : r.state === "CHANGES_REQUESTED" ? "поиска промени" : "написа review";
      push({ ...base, at: Date.parse(r.submittedAt), kind, who: r.author, what });
    }
  }
  for (const pr of closed)
    push({
      key: keyOf(pr),
      repo: pr.repo,
      number: pr.number,
      at: Date.parse(pr.closedAt),
      kind: "merged",
      who: pr.author,
      what: pr.state === "MERGED" ? "merge-на" : "затвори",
    });
  return out.sort((a, b) => a.at - b.at);
}

type Toast = { id: number; h: Happening; born: number };

function Replay({ events, start, end, onFire, onOpen, onClose }: {
  events: Happening[];
  start: number;
  end: number;
  onFire(h: Happening): void;
  onOpen(key: string): void;
  onClose(): void;
}) {
  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const time = useRef(start);
  const fired = useRef(0);
  const feed = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  useFlip(feed);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (stamp: number) => {
      const dt = Math.min(100, stamp - last);
      last = stamp;
      const prev = time.current;
      // 1x: one hour per second; quiet stretches with nothing in the next 3 hours fly by 8x faster.
      const upcoming = events.find((h) => h.at > prev)?.at ?? end;
      const rush = upcoming - prev > 3 * 3_600_000 ? 8 : 1;
      const next = Math.min(end, prev + dt * speed * 3600 * rush);
      const due = events.filter((h) => h.at > prev && h.at <= next);
      time.current = next;
      fired.current = events.filter((h) => h.at <= next).length;
      if (due.length) {
        due.forEach(onFire);
        setToasts((old) => [...due.map((h) => ({ id: nextId.current++, h, born: stamp })).reverse(), ...old].slice(0, 6));
      }
      setToasts((old) => (old.some((x) => stamp - x.born > 9000) ? old.filter((x) => stamp - x.born <= 9000) : old));
      setT(next);
      if (next >= end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const scrub = (value: number) => {
    time.current = value;
    fired.current = events.filter((h) => h.at <= value).length;
    setT(value);
  };
  const toggle = () => {
    if (!playing && time.current >= end) scrub(start);
    setPlaying(!playing);
  };

  // One bar per hour of activity.
  const hours = Math.ceil((end - start) / 3_600_000);
  const buckets = new Array<number>(hours).fill(0);
  for (const h of events) buckets[Math.min(hours - 1, Math.floor((h.at - start) / 3_600_000))]! += 1;
  const peak = Math.max(1, ...buckets);
  const progress = (t - start) / (end - start);
  const bars = (fill: string) =>
    buckets.map((n, i) => (n ? <rect key={i} x={i * 10 + 1} y={32 - (n / peak) * 30} width={8} height={(n / peak) * 30} rx={2} fill={fill} /> : null));
  const clock = new Date(t).toLocaleString("bg-BG", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const behind = Math.round((end - t) / 3_600_000);
  const now = performance.now();

  return (
    <>
      <div class="replay">
        <button class="btn" onClick={toggle} title={playing ? "Пауза" : "Пусни"}>
          {playing ? "⏸" : "▶"}
        </button>
        <div class="clock">
          {clock}
          <small>{behind > 0 ? `${behind}ч до snapshot-а` : "snapshot-ът"}</small>
        </div>
        <div class="track">
          <svg viewBox={`0 0 ${hours * 10} 32`} preserveAspectRatio="none">
            <defs>
              <clipPath id="vg-played">
                <rect x="0" y="0" width={progress * hours * 10} height="32" />
              </clipPath>
            </defs>
            <g opacity=".28">{bars("var(--muted)")}</g>
            <g clip-path="url(#vg-played)">{bars("#8a5cff")}</g>
            <rect x={progress * hours * 10 - 0.6} y="0" width="1.2" height="32" fill="#ff5c8a" />
          </svg>
          <input type="range" min={start} max={end} step={60_000} value={t} onInput={(e) => scrub(Number((e.target as HTMLInputElement).value))} />
        </div>
        <div class="speeds">
          {[1, 4].map((s) => (
            <button key={s} class={`btn${speed === s ? " on" : ""}`} onClick={() => setSpeed(s)}>
              {s}x
            </button>
          ))}
          <button class="btn" onClick={onClose} title="Спри повторението">
            ✕
          </button>
        </div>
        <div class="fired">
          {fired.current} от {events.length} събития за последните 48ч · 1x = час в секунда, тихите часове се превъртат
        </div>
      </div>
      <div class="feed" ref={feed}>
        {toasts.map(({ id, h, born }) => (
          <div key={id} data-flip={String(id)} class={`toast ${h.kind}${now - born > 7500 ? " old" : ""}`} onClick={() => onOpen(h.key)}>
            <div class="row">
              <Avatar login={h.who} />
              <span>
                <b>{h.who}</b> {h.what}
              </span>
              <span class="tag" style={{ "--h": repoHue(h.repo), marginLeft: "auto" }}>
                #{h.number}
              </span>
            </div>
            {h.snippet ? <div class="snip">{h.snippet}</div> : null}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- the board ----------

type Drag = {
  pr: DashboardPullRequest;
  slot: HTMLElement;
  x0: number;
  y0: number;
  rect: DOMRect;
  clone?: HTMLElement;
  tx: number;
  ty: number;
  rot: number;
  lastX: number;
  over: boolean;
};

/** B's kanban, but alive: things glide, tickets can be thrown on "видях", and the last two days can be replayed. */
export function View({ state, onSeen }: VariantProps) {
  assignRepoHues([...state.sections.flatMap((group) => group.pullRequests.map((pr) => pr.repo)), ...state.recentlyClosed.map((pr) => pr.repo)]);
  const [repos, setRepos] = useState<string[]>([]);
  const [mine, setMine] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Open | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [booted, setBooted] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const drop = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  useFlip(board);

  const now = useMemo(() => (state.fetchedAt ? new Date(state.fetchedAt) : new Date()), [state.fetchedAt]);

  useEffect(() => {
    setBooted(false);
    const timer = setTimeout(() => setBooted(true), 2200);
    return () => clearTimeout(timer);
  }, [epoch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen((o) => (o ? { ...o, closing: true } : o));
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [!!open]);

  const allOpen = state.sections.flatMap((s) => s.pullRequests);
  const allRepos = [...new Set([...allOpen.map((pr) => pr.repo), ...state.recentlyClosed.map((pr) => pr.repo)])].sort();
  const repoCount = (repo: string) => allOpen.filter((pr) => pr.repo === repo).length;
  const keep = (pr: { repo: string; author: string }) => (repos.length === 0 || repos.includes(pr.repo)) && (!mine || same(state.viewer, pr.author));
  const closed = state.recentlyClosed.filter(keep);
  const flipRepo = (repo: string) => setRepos((old) => (old.includes(repo) ? old.filter((r) => r !== repo) : [...old, repo]));
  const isWaiting = (pr: DashboardPullRequest) => !!state.sections.find((s) => s.section === "waiting_on_me")?.pullRequests.includes(pr);
  const toggle = (id: string) =>
    setFolded((old) => {
      const isEmpty = id === "closed" ? !closed.length : !state.sections.find((s) => s.section === id)?.pullRequests.filter(keep).length;
      return { ...old, [id]: !(old[id] ?? isEmpty) };
    });

  const end = state.fetchedAt ? Date.parse(state.fetchedAt) : now.getTime();
  const events = useMemo(() => happenings(allOpen, state.recentlyClosed, end - WINDOW, end), [state]);

  const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  /** "видях" from the button: the ticket shrinks away with a burst, then the rest of the column closes the gap. */
  const seenWithFlourish = (pr: DashboardPullRequest, slot: HTMLElement) => {
    const c = centerOf(slot.getBoundingClientRect());
    if (fx.current) sparks(fx.current, c.x, c.y, "✓ видях");
    if (REDUCED) return onSeen(pr);
    slot
      .animate(
        [
          { transform: "none", opacity: 1 },
          { transform: "translateX(30px) scale(.96) rotate(2deg)", opacity: 1, offset: 0.35 },
          { transform: "translateX(260px) scale(.5) rotate(10deg)", opacity: 0 },
        ],
        { duration: 420, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards", composite: "add" },
      )
      .finished.then(() => onSeen(pr));
  };

  const grab = (e: PointerEvent, pr: DashboardPullRequest, slot: HTMLElement) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("a, button")) return;
    drag.current = { pr, slot, x0: e.clientX, y0: e.clientY, rect: slot.getBoundingClientRect(), tx: 0, ty: 0, rot: 0, lastX: e.clientX, over: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x0;
      const dy = ev.clientY - d.y0;
      if (!d.clone) {
        if (Math.hypot(dx, dy) < 7) return;
        // Lift a copy into the effects layer so the column's scroll box does not clip it.
        d.rect = d.slot.getBoundingClientRect();
        const clone = d.slot.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-flip");
        clone.classList.add("clone");
        Object.assign(clone.style, { left: `${d.rect.left}px`, top: `${d.rect.top}px`, width: `${d.rect.width}px` });
        fx.current!.appendChild(clone);
        d.clone = clone;
        d.slot.style.visibility = "hidden";
        setDragging(true);
        if (!REDUCED) clone.animate([{ scale: "1" }, { scale: "1.05" }], { duration: 180, fill: "forwards", easing: "ease-out" });
      }
      d.rot += ((ev.clientX - d.lastX) * 0.9 - d.rot) * 0.25;
      d.rot = Math.max(-14, Math.min(14, d.rot));
      d.lastX = ev.clientX;
      d.tx = dx;
      d.ty = dy;
      d.clone.style.transform = `translate(${dx}px, ${dy}px) rotate(${REDUCED ? 0 : d.rot}deg)`;
      const zone = drop.current?.getBoundingClientRect();
      const hit = !!zone && ev.clientX > zone.left - 20 && ev.clientX < zone.right + 20 && ev.clientY > zone.top - 20 && ev.clientY < zone.bottom + 20;
      if (hit !== d.over) {
        d.over = hit;
        setOver(hit);
      }
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      const d = drag.current;
      drag.current = null;
      if (!d?.clone) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      const clone = d.clone;
      const from = `translate(${d.tx}px, ${d.ty}px) rotate(${d.rot}deg)`;
      const zone = drop.current?.getBoundingClientRect();
      setDragging(false);
      setOver(false);
      if (d.over && zone) {
        const z = centerOf(zone);
        const c = centerOf(d.rect);
        if (fx.current) sparks(fx.current, z.x, z.y, "✓ видях");
        clone
          .animate(
            [
              { transform: from, opacity: 1 },
              { transform: `translate(${z.x - c.x}px, ${z.y - c.y}px) rotate(${d.rot > 0 ? 25 : -25}deg) scale(.12)`, opacity: 0 },
            ],
            { duration: REDUCED ? 1 : 380, easing: "cubic-bezier(.55,0,.8,.4)", fill: "forwards" },
          )
          .finished.then(() => {
            clone.remove();
            onSeen(d.pr);
          });
      } else {
        clone
          .animate([{ transform: from }, { transform: "translate(0, 0) rotate(0deg)", scale: "1" }], {
            duration: REDUCED ? 1 : BOUNCE.duration,
            easing: BOUNCE.easing,
            fill: "forwards",
          })
          .finished.then(() => {
            clone.remove();
            d.slot.style.visibility = "";
          });
      }
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  const openDetail = (pr: DashboardPullRequest, el: HTMLElement) => setOpen({ pr, from: el.getBoundingClientRect(), closing: false });
  const openByKey = (key: string) => {
    const pr = allOpen.find((p) => keyOf(p) === key);
    const slot = board.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(`pr:${key}`)}"]`);
    if (!pr) return;
    const rect = slot?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2 - 140, innerHeight / 2 - 60, 280, 120);
    setOpen({ pr, from: rect, closing: false });
  };

  const fire = (h: Happening) => {
    flashTicket(board.current, h.key, KIND_COLOR[h.kind].replace(/var\((--[a-z]+)\)/, (_, v: string) => getComputedStyle(board.current!).getPropertyValue(v)));
    if (h.kind === "merged" && fx.current) {
      const slot = board.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(`pr:${h.key}`)}"]`);
      if (slot) {
        const c = centerOf(slot.getBoundingClientRect());
        confetti(fx.current, c.x, c.y, 30);
      }
    }
  };

  const reveal = (col: HTMLElement) => {
    const head = col.querySelector(".col-head")?.getBoundingClientRect();
    if (head && fx.current && closed.some((pr) => pr.state === "MERGED")) confetti(fx.current, head.left + head.width / 2, head.top + head.height / 2);
  };

  return (
    <div class={`vG${booted ? " booted" : ""}`}>
      <style>{STYLE}</style>
      <div class="bg">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div class="wrap">
        <div class="top">
          <h1>
            <span class="live" />
            WorkDash
          </h1>
          <span class="status">{statusText(state)}</span>
          <div class="toolbar">
            <button class={`chip${repos.length === 0 ? " on" : ""}`} onClick={() => setRepos([])}>
              Всички repo-та
            </button>
            {allRepos.map((repo) => (
              <button key={repo} class={`chip${repos.includes(repo) ? " on" : ""}`} onClick={() => flipRepo(repo)} title={repo}>
                <span class="dot" style={{ background: `hsl(${repoHue(repo)} 60% 52%)` }} />
                {shortRepo(repo)}
                <span class="n">{repoCount(repo)}</span>
              </button>
            ))}
            <span class="sep" />
            <button class={`chip${mine ? " on" : ""}`} onClick={() => setMine(!mine)}>
              само моите
            </button>
            <button class="chip" onClick={() => setEpoch((n) => n + 1)} title="Изиграй входа отново">
              ✨
            </button>
            <button class={`chip play${replaying ? " on" : ""}`} onClick={() => setReplaying(!replaying)} title="Повтори активността от последните 48ч">
              {replaying ? "■ Спри" : "▶ Пусни деня"}
            </button>
          </div>
          {replaying ? (
            <Replay events={events} start={end - WINDOW} end={end} onFire={fire} onOpen={openByKey} onClose={() => setReplaying(false)} />
          ) : null}
        </div>
        <div class="board" ref={board} data-flip-root key={epoch}>
          {state.sections.map(({ section, pullRequests }, index) => {
            const shown = pullRequests.filter(keep);
            const waiting = section === "waiting_on_me";
            return (
              <Column key={section} id={section} index={index} title={sectionTitle(section)} count={shown.length} folded={folded} toggle={toggle}>
                {shown.map((pr, i) => (
                  <Ticket
                    key={keyOf(pr)}
                    pr={pr}
                    now={now}
                    ci={index}
                    ti={i}
                    ghost={open?.pr === pr}
                    draggable={waiting}
                    onOpen={openDetail}
                    suppressClick={suppressClick}
                    {...(waiting ? { onSeenClick: seenWithFlourish, onGrab: grab } : {})}
                  />
                ))}
              </Column>
            );
          })}
          <Column
            id="closed"
            index={state.sections.length}
            title="Затворени"
            count={closed.length}
            folded={folded}
            toggle={toggle}
            onReveal={reveal}
          >
            {closed.map((pr, i) => (
              <ClosedTicket key={keyOf(pr)} pr={pr} now={now} ci={state.sections.length} ti={i} />
            ))}
          </Column>
        </div>
      </div>
      {dragging ? (
        <div class={`drop${over ? " over" : ""}`} ref={drop}>
          <span class="halo" />
          <span class="ring" />
          <div>
            {over ? "Пусни! ✓" : "↓ Хвърли тук · видях"}
            <small>пусни другаде, за да върнеш картата</small>
          </div>
        </div>
      ) : null}
      {open ? (
        <Detail
          key={keyOf(open.pr)}
          open={open}
          now={now}
          board={board.current}
          onClose={() => (open.closing ? setOpen(null) : setOpen({ ...open, closing: true }))}
          {...(isWaiting(open.pr)
            ? {
                onSeen: () => {
                  const pr = open.pr;
                  setOpen(null);
                  onSeen(pr);
                },
              }
            : {})}
        />
      ) : null}
      <div class="fx" ref={fx} />
    </div>
  );
}
