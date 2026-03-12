import { useState, useEffect, useRef, useCallback } from "react";

// ─── Styles scoped under .okiru-root ──────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500&family=Geist+Mono:wght@400;500&display=swap');

  .okiru-root *, .okiru-root *::before, .okiru-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .okiru-root {
    --ink:   #0a0a0f;
    --ink2:  #111018;
    --rule:  rgba(255,255,255,0.07);
    --muted: rgba(255,255,255,0.32);
    --body:  rgba(255,255,255,0.56);
    --hi:    rgba(255,255,255,0.92);
    --pur:   #8b5cf6;
    --pur-d: #6d28d9;
    --pur-l: #a78bfa;
    --mono:  'Geist Mono', monospace;
    --serif: 'Instrument Serif', serif;
    --sans:  'Geist', sans-serif;

    background: var(--ink);
    color: var(--body);
    font-family: var(--sans);
    font-weight: 300;
    font-size: 15px;
    line-height: 1.65;
    overflow-x: hidden;
    min-height: 100%;
  }
  .okiru-root ::selection { background: rgba(139,92,246,0.25); }

  /* grain */
  .okiru-root .okiru-grain {
    position: fixed; inset: 0; z-index: 500; pointer-events: none;
    opacity: 0.038;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 256px;
  }

  /* nav */
  .okiru-root .ok-nav {
    position: fixed; top: 0; width: 100%; z-index: 200;
    height: 58px; display: flex; align-items: center;
    border-bottom: 1px solid var(--rule);
    background: rgba(10,10,15,0.85);
    backdrop-filter: blur(24px);
  }
  .okiru-root .ok-nav-w {
    width: 100%; max-width: 1100px; margin: 0 auto; padding: 0 48px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .okiru-root .ok-wordmark {
    font-family: var(--serif); font-style: italic; font-size: 20px;
    color: var(--hi); letter-spacing: -0.01em;
  }
  .okiru-root .ok-nav-chip {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--muted);
    border: 1px solid var(--rule); padding: 3px 9px; border-radius: 3px;
  }
  .okiru-root .ok-btn-ghost {
    font-family: var(--sans); font-size: 13px; color: var(--muted);
    background: none; border: none; cursor: pointer;
    padding: 6px 14px; border-radius: 4px; transition: color .2s;
  }
  .okiru-root .ok-btn-ghost:hover { color: var(--hi); }
  .okiru-root .ok-btn-pur {
    font-family: var(--sans); font-size: 13px; font-weight: 500;
    color: #fff; background: var(--pur); border: none; cursor: pointer;
    padding: 7px 20px; border-radius: 4px; letter-spacing: -0.01em;
    transition: background .2s, transform .15s;
  }
  .okiru-root .ok-btn-pur:hover { background: var(--pur-d); transform: translateY(-1px); }
  .okiru-root .ok-btn-pur:active { transform: none; }

  /* container */
  .okiru-root .ok-w { max-width: 1100px; margin: 0 auto; padding: 0 48px; }

  /* hero */
  .okiru-root .ok-hero {
    padding: 156px 0 0; position: relative;
    border-bottom: 1px solid var(--rule);
  }
  .okiru-root .ok-hero-line {
    position: absolute; left: 48px; top: 156px; bottom: 0; width: 1px;
    background: linear-gradient(to bottom, var(--pur) 0%, transparent 100%);
    opacity: 0.35;
  }
  .okiru-root .ok-eyebrow-hero {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--pur-l);
    margin-bottom: 28px; padding-left: 80px;
  }
  .okiru-root .ok-h1 {
    font-family: var(--serif);
    font-size: clamp(3.4rem, 6.2vw, 5.8rem);
    line-height: 1.02; letter-spacing: -0.03em;
    color: var(--hi); font-weight: 400;
    padding-left: 80px; max-width: 820px;
  }
  .okiru-root .ok-h1 em { font-style: italic; color: var(--pur-l); }
  .okiru-root .ok-hero-sub {
    margin-top: 28px; padding-left: 80px; max-width: 460px;
    font-size: 16px; color: var(--body); line-height: 1.8;
  }
  .okiru-root .ok-hero-btns {
    margin-top: 44px; padding-left: 80px;
    display: flex; align-items: center; gap: 16px;
  }
  .okiru-root .ok-btn-main {
    display: inline-flex; align-items: center; gap: 9px;
    font-family: var(--sans); font-size: 14px; font-weight: 500;
    color: #fff; background: var(--pur); border: none; cursor: pointer;
    padding: 12px 28px; border-radius: 4px; letter-spacing: -0.01em;
    transition: background .2s, transform .15s;
  }
  .okiru-root .ok-btn-main:hover { background: var(--pur-d); transform: translateY(-1px); }
  .okiru-root .ok-btn-main .arr { transition: transform .2s; display: inline-flex; }
  .okiru-root .ok-btn-main:hover .arr { transform: translateX(3px); }
  .okiru-root .ok-btn-sec {
    font-family: var(--sans); font-size: 13px; color: var(--muted);
    background: none; border: 1px solid var(--rule); cursor: pointer;
    padding: 12px 22px; border-radius: 4px;
    transition: color .2s, border-color .2s;
  }
  .okiru-root .ok-btn-sec:hover { color: var(--pur-l); border-color: rgba(139,92,246,.35); }

  /* stats */
  .okiru-root .ok-stats {
    display: grid; grid-template-columns: repeat(4,1fr);
    margin-top: 88px; border-top: 1px solid var(--rule);
  }
  .okiru-root .ok-stat {
    padding: 32px 0 32px 80px;
    border-right: 1px solid var(--rule);
  }
  .okiru-root .ok-stat:last-child { border-right: none; }
  .okiru-root .ok-stat-n {
    font-family: var(--serif); font-size: 2.6rem; line-height: 1;
    color: var(--hi); letter-spacing: -0.035em; margin-bottom: 5px;
  }
  .okiru-root .ok-stat-l {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.12em; color: var(--muted);
  }

  /* product split */
  .okiru-root .ok-split {
    display: grid; grid-template-columns: 5fr 7fr;
    border-bottom: 1px solid var(--rule); min-height: 520px;
  }
  .okiru-root .ok-split-l {
    padding: 72px 64px; border-right: 1px solid var(--rule);
    display: flex; flex-direction: column; justify-content: center;
  }
  .okiru-root .ok-split-r {
    padding: 72px 64px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .okiru-root .ok-eyebrow {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.14em; color: var(--pur-l); margin-bottom: 18px;
  }
  .okiru-root .ok-h2 {
    font-family: var(--serif); font-size: clamp(1.9rem,3.2vw,2.7rem);
    color: var(--hi); font-weight: 400; letter-spacing: -0.025em;
    line-height: 1.08; margin-bottom: 18px;
  }
  .okiru-root .ok-h2 em { font-style: italic; color: var(--pur-l); }
  .okiru-root .ok-prod-body { font-size: 15px; color: var(--body); line-height: 1.8; max-width: 340px; }

  /* scorecard widget */
  .okiru-root .ok-sc {
    position: relative; border-radius: 12px; overflow: hidden;
    background: #0d0c15;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.08);
    font-family: var(--mono);
  }
  .okiru-root .ok-sc::before {
    content: ''; position: absolute; inset: -1px; border-radius: 13px; z-index: -1;
    background: linear-gradient(135deg,rgba(139,92,246,0.15),transparent 60%);
    pointer-events: none;
  }
  .okiru-root .ok-sc-chrome {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.02);
  }
  .okiru-root .ok-sc-dots { display: flex; gap: 5px; }
  .okiru-root .ok-sc-dot { width: 9px; height: 9px; border-radius: 50%; }
  .okiru-root .ok-sc-url { font-size: 10px; letter-spacing: .06em; color: rgba(255,255,255,.22); }
  .okiru-root .ok-sc-live { display: flex; align-items: center; gap: 5px; font-size: 10px; color: rgba(255,255,255,.3); }

  @keyframes okiru-scPulse {
    0%,100% { opacity:1; box-shadow: 0 0 6px #8b5cf6; }
    50% { opacity:.3; box-shadow: 0 0 2px #8b5cf6; }
  }
  .okiru-root .ok-sc-livedot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #8b5cf6; box-shadow: 0 0 6px #8b5cf6;
    animation: okiru-scPulse 1.8s ease-in-out infinite;
  }
  .okiru-root .ok-sc-body { padding: 20px 20px 18px; }
  .okiru-root .ok-sc-level-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px; padding-bottom: 18px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .okiru-root .ok-sc-level-l { display: flex; align-items: baseline; gap: 8px; }
  .okiru-root .ok-sc-num {
    font-family: var(--serif); font-style: italic;
    font-size: 4rem; line-height: 1; color: var(--hi); letter-spacing: -0.04em;
    transition: opacity .4s ease, transform .4s ease;
  }
  .okiru-root .ok-sc-denom { font-size: 12px; color: rgba(255,255,255,.25); margin-top: 4px; }
  .okiru-root .ok-sc-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
  .okiru-root .ok-sc-badge-rec {
    font-size: 10px; letter-spacing: .07em; text-transform: uppercase;
    padding: 3px 10px; border-radius: 3px;
    color: #a78bfa; background: rgba(139,92,246,.12);
    border: 1px solid rgba(139,92,246,.2);
    transition: opacity .4s ease;
  }
  .okiru-root .ok-sc-badge-sub {
    font-size: 10px; color: rgba(255,255,255,.28);
    transition: opacity .4s ease;
  }
  .okiru-root .ok-sc-pillars { display: flex; flex-direction: column; gap: 11px; margin-bottom: 18px; }
  .okiru-root .ok-sc-pillar-meta {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;
  }
  .okiru-root .ok-sc-pillar-name { font-size: 11px; color: rgba(255,255,255,.38); }
  .okiru-root .ok-sc-pillar-val { font-size: 11px; color: rgba(255,255,255,.22); }
  .okiru-root .ok-sc-track {
    height: 4px; border-radius: 2px; overflow: hidden;
    background: rgba(255,255,255,0.05);
  }
  .okiru-root .ok-sc-fill {
    height: 100%; border-radius: 2px;
    transition: width 1s cubic-bezier(.16,1,.3,1);
    position: relative; overflow: hidden;
  }
  @keyframes okiru-shimmer {
    0% { left: -60%; }
    100% { left: 120%; }
  }
  .okiru-root .ok-sc-fill::after {
    content: ''; position: absolute; top: 0; left: -60%; width: 60%; height: 100%;
    background: linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);
    animation: okiru-shimmer 2.2s ease-in-out infinite;
  }
  .okiru-root .ok-sc-foot {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.05);
  }
  .okiru-root .ok-sc-ok {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; color: rgba(255,255,255,.3);
    transition: opacity .5s ease;
  }
  .okiru-root .ok-sc-export {
    font-size: 10px; color: rgba(139,92,246,.7);
    background: none; border: 1px solid rgba(139,92,246,.2);
    padding: 4px 11px; border-radius: 3px; cursor: pointer;
    font-family: var(--mono); letter-spacing: .04em;
    transition: background .2s, color .2s, opacity .5s ease;
  }
  .okiru-root .ok-sc-export:hover { background: rgba(139,92,246,.12); color: var(--pur-l); }
  .okiru-root .ok-sc-replay {
    text-align: center; padding: 10px 0 4px;
    font-size: 10px; font-family: var(--mono);
    color: rgba(255,255,255,.15); letter-spacing: .08em; cursor: pointer;
    transition: color .2s;
  }
  .okiru-root .ok-sc-replay:hover { color: rgba(139,92,246,.6); }

  /* features */
  .okiru-root .ok-feats { display: grid; grid-template-columns: repeat(4,1fr); border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-feat {
    padding: 52px 44px; border-right: 1px solid var(--rule);
    border-top: 1px solid var(--rule); transition: background .35s; cursor: default;
  }
  .okiru-root .ok-feat:last-child { border-right: none; }
  .okiru-root .ok-feat:hover { background: rgba(139,92,246,0.04); }
  .okiru-root .ok-feat--hl {
    background: rgba(139,92,246,0.03);
    border-left: 1px solid rgba(139,92,246,0.18) !important;
  }
  .okiru-root .ok-feat--hl:hover { background: rgba(139,92,246,0.07); }
  .okiru-root .ok-feat-idx {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: .12em; color: rgba(139,92,246,.45); margin-bottom: 22px;
  }
  .okiru-root .ok-feat--hl .ok-feat-idx { color: rgba(139,92,246,.65); }
  .okiru-root .ok-feat-h {
    font-family: var(--serif); font-size: 1.45rem; font-weight: 400;
    letter-spacing: -0.02em; color: var(--hi); line-height: 1.2; margin-bottom: 12px;
  }
  .okiru-root .ok-feat-p { font-size: 14px; color: var(--muted); line-height: 1.75; }

  /* entity builder */
  .okiru-root .ok-eb { display: grid; grid-template-columns: 5fr 7fr; border-bottom: 1px solid var(--rule); min-height: 560px; }
  .okiru-root .ok-eb-l {
    padding: 72px 64px; border-right: 1px solid var(--rule);
    display: flex; flex-direction: column; justify-content: center;
  }
  .okiru-root .ok-eb-r {
    padding: 72px 64px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .okiru-root .ok-eb-list { list-style: none; margin-top: 28px; display: flex; flex-direction: column; gap: 12px; }
  .okiru-root .ok-eb-list li { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--body); }
  .okiru-root .ok-eb-dot {
    flex-shrink: 0; width: 5px; height: 5px; border-radius: 50%;
    background: var(--pur); box-shadow: 0 0 6px rgba(139,92,246,.5);
  }
  .okiru-root .ok-eb-card {
    background: #0d0c15; border: 1px solid rgba(255,255,255,.07);
    border-radius: 10px; overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,.5); font-family: var(--mono);
  }
  .okiru-root .ok-eb-card-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,.06);
    background: rgba(255,255,255,.015);
  }
  .okiru-root .ok-eb-card-title { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.35); }
  .okiru-root .ok-eb-add {
    font-size: 11px; font-family: var(--mono); color: var(--pur-l);
    background: rgba(139,92,246,.1); border: 1px solid rgba(139,92,246,.2);
    padding: 4px 12px; border-radius: 4px; cursor: pointer; transition: background .2s;
  }
  .okiru-root .ok-eb-add:hover { background: rgba(139,92,246,.2); }
  .okiru-root .ok-eb-entity {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,.04);
    transition: background .2s; cursor: default;
  }
  .okiru-root .ok-eb-entity:hover { background: rgba(139,92,246,.05); }
  .okiru-root .ok-eb-entity:last-child { border-bottom: none; }
  .okiru-root .ok-eb-entity--active { background: rgba(139,92,246,.04); }
  .okiru-root .ok-eb-entity--draft { opacity: .5; }
  .okiru-root .ok-eb-entity-l { display: flex; align-items: center; gap: 12px; }
  .okiru-root .ok-eb-avatar {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 600; font-family: var(--sans); flex-shrink: 0;
  }
  .okiru-root .ok-eb-name { font-size: 12px; color: rgba(255,255,255,.75); margin-bottom: 2px; letter-spacing: .01em; }
  .okiru-root .ok-eb-meta { font-size: 10px; color: rgba(255,255,255,.25); letter-spacing: .04em; }
  .okiru-root .ok-eb-entity-r { display: flex; align-items: center; gap: 10px; }
  .okiru-root .ok-eb-chip {
    font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
    padding: 2px 8px; border-radius: 3px;
  }
  .okiru-root .ok-eb-chip--1 { color:#34d399; background:rgba(6,95,70,.2); border:1px solid rgba(52,211,153,.2); }
  .okiru-root .ok-eb-chip--2 { color:#a78bfa; background:rgba(124,58,237,.15); border:1px solid rgba(139,92,246,.25); }
  .okiru-root .ok-eb-chip--4 { color:#38bdf8; background:rgba(14,116,144,.15); border:1px solid rgba(56,189,248,.2); }
  .okiru-root .ok-eb-chip--d { color:rgba(255,255,255,.25); background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); }
  .okiru-root .ok-eb-members { display: flex; align-items: center; }
  .okiru-root .ok-eb-av {
    width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 8px; font-weight: 600; color: rgba(255,255,255,.8);
    font-family: var(--sans); margin-left: -5px;
    border: 1.5px solid #0d0c15; flex-shrink: 0;
  }
  .okiru-root .ok-eb-av--more { background: rgba(255,255,255,.08); color: rgba(255,255,255,.35); }
  .okiru-root .ok-eb-card-ftr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 18px; border-top: 1px solid rgba(255,255,255,.05);
    font-size: 10px; color: rgba(255,255,255,.2); letter-spacing: .04em;
  }

  /* process */
  .okiru-root .ok-proc { padding: 96px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-proc-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 80px; align-items: start; }
  .okiru-root .ok-proc-h2 {
    font-family: var(--serif); font-size: clamp(2rem,3.5vw,2.9rem);
    color: var(--hi); font-weight: 400; letter-spacing: -0.025em; line-height: 1.1;
    position: sticky; top: 96px;
  }
  .okiru-root .ok-proc-steps { display: flex; flex-direction: column; }
  .okiru-root .ok-proc-step {
    display: grid; grid-template-columns: 56px 1fr;
    padding: 36px 0; border-bottom: 1px solid var(--rule);
  }
  .okiru-root .ok-proc-step:last-child { border-bottom: none; }
  .okiru-root .ok-proc-num {
    font-family: var(--mono); font-size: 11px; letter-spacing: .1em;
    text-transform: uppercase; color: rgba(139,92,246,.45); padding-top: 3px;
  }
  .okiru-root .ok-proc-title {
    font-family: var(--serif); font-size: 1.3rem; color: var(--hi);
    font-weight: 400; letter-spacing: -0.02em; margin-bottom: 8px;
  }
  .okiru-root .ok-proc-desc { font-size: 14px; color: var(--muted); line-height: 1.7; }

  /* cta */
  .okiru-root .ok-cta { padding: 140px 0; border-bottom: 1px solid var(--rule); position: relative; }
  .okiru-root .ok-cta::after {
    content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg,transparent 5%,var(--pur) 50%,transparent 95%);
    opacity: .25;
  }
  .okiru-root .ok-cta-grid { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 48px; }
  .okiru-root .ok-cta-h2 {
    font-family: var(--serif); font-size: clamp(2.6rem,5vw,4.2rem);
    color: var(--hi); font-weight: 400; letter-spacing: -0.03em; line-height: 1.04;
  }
  .okiru-root .ok-cta-h2 em { font-style: italic; color: var(--pur-l); }
  .okiru-root .ok-cta-r { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .okiru-root .ok-cta-note { font-family: var(--mono); font-size: 11px; color: var(--muted); letter-spacing: .04em; }

  /* footer */
  .okiru-root footer { padding: 26px 0; }
  .okiru-root .ok-foot { display: flex; align-items: center; justify-content: space-between; }
  .okiru-root .ok-foot-wm { font-family: var(--serif); font-style: italic; font-size: 15px; color: var(--muted); }
  .okiru-root .ok-foot-c { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.15); letter-spacing: .06em; }

  /* scroll reveal */
  .okiru-root .ok-reveal { opacity: 0; transform: translateY(14px); transition: opacity .6s ease, transform .6s ease; }
  .okiru-root .ok-reveal.ok-in { opacity: 1; transform: none; }
  .okiru-root .ok-d1 { transition-delay: .1s; }
  .okiru-root .ok-d2 { transition-delay: .2s; }
  .okiru-root .ok-d3 { transition-delay: .3s; }

  /* hero entrance animations */
  @keyframes okiru-slideUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .okiru-root .ok-anim-1 { opacity: 0; animation: okiru-slideUp .6s ease forwards .08s; }
  .okiru-root .ok-anim-2 { opacity: 0; animation: okiru-slideUp .9s ease forwards .18s; }
  .okiru-root .ok-anim-3 { opacity: 0; animation: okiru-slideUp .7s ease forwards .32s; }
  .okiru-root .ok-anim-4 { opacity: 0; animation: okiru-slideUp .65s ease forwards .45s; }
  .okiru-root .ok-anim-5 { opacity: 0; animation: okiru-slideUp .5s ease forwards .55s; }
  .okiru-root .ok-anim-6 { opacity: 0; animation: okiru-slideUp .5s ease forwards .63s; }
  .okiru-root .ok-anim-7 { opacity: 0; animation: okiru-slideUp .5s ease forwards .71s; }
  .okiru-root .ok-anim-8 { opacity: 0; animation: okiru-slideUp .5s ease forwards .79s; }

  @media (max-width: 900px) {
    .okiru-root .ok-feats { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-feat:nth-child(2n) { border-right: none; }
  }
  @media (max-width: 760px) {
    .okiru-root .ok-h1 { font-size: 2.8rem; padding-left: 24px; }
    .okiru-root .ok-eyebrow-hero, .okiru-root .ok-hero-sub, .okiru-root .ok-hero-btns, .okiru-root .ok-stat { padding-left: 24px; }
    .okiru-root .ok-hero-line { left: 24px; }
    .okiru-root .ok-split, .okiru-root .ok-eb { grid-template-columns: 1fr; }
    .okiru-root .ok-split-l, .okiru-root .ok-eb-l { border-right: none; border-bottom: 1px solid var(--rule); padding: 48px 24px; }
    .okiru-root .ok-split-r, .okiru-root .ok-eb-r { padding: 48px 24px; }
    .okiru-root .ok-stats { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-feats { grid-template-columns: 1fr; }
    .okiru-root .ok-feat { border-right: none; }
    .okiru-root .ok-proc-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-cta-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-cta-r { align-items: flex-start; }
    .okiru-root .ok-w, .okiru-root .ok-nav-w { padding: 0 24px; }
  }
`;

// ─── Data ────────────────────────────────────────────────────────────────────
const PILLARS = [
  { id: 0, name: "Ownership", target: 87, bg: "linear-gradient(90deg,#7c3aed,#a78bfa)" },
  { id: 1, name: "Management Control", target: 61, bg: "linear-gradient(90deg,#0ea5e9,#38bdf8)" },
  { id: 2, name: "Skills Development", target: 95, bg: "linear-gradient(90deg,#059669,#34d399)" },
  { id: 3, name: "Enterprise & Supplier Dev", target: 74, bg: "linear-gradient(90deg,#d97706,#fbbf24)" },
  { id: 4, name: "Socio-Economic Dev", target: 100, bg: "linear-gradient(90deg,#be185d,#f472b6)" },
];

const FEATURES = [
  { idx: "01", title: "Smart Import", body: "Drop your Excel toolkit in. Our parser reads all 52 sheets and builds your scorecard automatically — no reformatting required." },
  { idx: "02", title: "Live Scorecard", body: "B-BBEE level, recognition percentage, and sub-minimum status update the moment your data changes." },
  { idx: "03", title: "One-Click Reports", body: "Export audit-ready Excel and PDF compliance packs on demand. Every figure traceable, every calculation verified." },
  { idx: "04", title: "Entity Builder", body: "Your team builds and manages entities directly inside Okiru — no external tools, no spreadsheet handoffs.", highlight: true },
];

const ENTITIES = [
  {
    letter: "A", name: "Acme Holdings (Pty) Ltd", meta: "Level 2 · 125% · 5 pillars", chipClass: "ok-eb-chip--2", chip: "Lvl 2", active: true,
    avatarBg: "rgba(139,92,246,.2)", avatarColor: "#a78bfa",
    members: [{ initials: "JM", bg: "#7c3aed" }, { initials: "SR", bg: "#0e7490" }, { initials: "TN", bg: "#065f46" }]
  },
  {
    letter: "B", name: "BlueSky Ventures (Pty) Ltd", meta: "Level 4 · 100% · 5 pillars", chipClass: "ok-eb-chip--4", chip: "Lvl 4",
    avatarBg: "rgba(14,116,144,.18)", avatarColor: "#38bdf8",
    members: [{ initials: "SR", bg: "#0e7490" }, { initials: "PK", bg: "#92400e" }]
  },
  {
    letter: "C", name: "Cedar Invest Group", meta: "Level 1 · 135% · 5 pillars", chipClass: "ok-eb-chip--1", chip: "Lvl 1",
    avatarBg: "rgba(6,95,70,.2)", avatarColor: "#34d399",
    members: [{ initials: "JM", bg: "#7c3aed" }, { initials: "TN", bg: "#065f46" }, { initials: "PK", bg: "#92400e" }, { initials: "+2", more: true }]
  },
  {
    letter: "+", name: "New entity in progress…", meta: "Draft · 0 pillars configured", chipClass: "ok-eb-chip--d", chip: "Draft", draft: true,
    avatarBg: "rgba(255,255,255,.04)", avatarColor: "rgba(255,255,255,.2)", members: []
  },
];

const STATS = [
  { n: "52", l: "Sheets parsed" },
  { n: "5", l: "Pillars scored" },
  { n: "<2s", l: "To scorecard" },
  { n: "100%", l: "Audit-ready output" },
];

const STEPS = [
  { num: "01", title: "Upload", desc: "Import your B-BBEE Excel toolkit directly. We handle every sheet, every formula, every edge case." },
  { num: "02", title: "Analyse", desc: "Instant scorecard across all five pillars. Sub-minimums are checked automatically. Results in under two seconds." },
  { num: "03", title: "Report", desc: "Export a professional compliance pack, ready for your verification agency. No reformatting, no chasing numbers." },
];

// ─── Icons ────────────────────────────────────────────────────────────────────
const ArrowRight = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
const Check = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useReveal(threshold = 0.08) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.unobserve(el); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function useCountUp(target, active, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return val;
}

// ─── Scorecard ────────────────────────────────────────────────────────────────
function Scorecard() {
  const scRef = useRef(null);
  const [showNum, setShowNum] = useState(false);
  const [showRec, setShowRec] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [activeBars, setActiveBars] = useState([]);
  const [showFoot, setShowFoot] = useState(false);
  const timerRefs = useRef([]);

  const clearTimers = () => { timerRefs.current.forEach(clearTimeout); timerRefs.current = []; };
  const t = (fn, ms) => { timerRefs.current.push(setTimeout(fn, ms)); };

  const play = useCallback(() => {
    clearTimers();
    setShowNum(false); setShowRec(false); setShowSub(false);
    setActiveBars([]); setShowFoot(false);

    t(() => setShowNum(true), 260);
    t(() => setShowRec(true), 560);
    t(() => setShowSub(true), 760);
    PILLARS.forEach((_, i) => t(() => setActiveBars(prev => [...prev, i]), 900 + i * 250));
    const done = 900 + PILLARS.length * 250 + 1100;
    t(() => setShowFoot(true), done);
    t(() => play(), done + 3200);
  }, []);

  useEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { play(); obs.unobserve(el); }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => { obs.disconnect(); clearTimers(); };
  }, [play]);

  return (
    <div className="ok-sc" ref={scRef}>
      <div className="ok-sc-chrome">
        <div className="ok-sc-dots">
          <span className="ok-sc-dot" style={{ background: "#ff5f56" }} />
          <span className="ok-sc-dot" style={{ background: "#ffbd2e" }} />
          <span className="ok-sc-dot" style={{ background: "#27c93f" }} />
        </div>
        <span className="ok-sc-url">scorecard.okiru.pro</span>
        <div className="ok-sc-live"><div className="ok-sc-livedot" />live</div>
      </div>
      <div className="ok-sc-body">
        <div className="ok-sc-level-row">
          <div className="ok-sc-level-l">
            <span className="ok-sc-num" style={{ opacity: showNum ? 1 : 0, transform: showNum ? "none" : "translateY(6px)" }}>2</span>
            <span className="ok-sc-denom">/ 8</span>
          </div>
          <div className="ok-sc-badges">
            <span className="ok-sc-badge-rec" style={{ opacity: showRec ? 1 : 0 }}>125% Recognition</span>
            <span className="ok-sc-badge-sub" style={{ opacity: showSub ? 1 : 0 }}>Sub-minimums met ✓</span>
          </div>
        </div>
        <div className="ok-sc-pillars">
          {PILLARS.map((p) => (
            <PillarRow key={p.id} pillar={p} active={activeBars.includes(p.id)} />
          ))}
        </div>
        <div className="ok-sc-foot">
          <div className="ok-sc-ok" style={{ opacity: showFoot ? 1 : 0 }}>
            <Check size={12} /> Sub-minimums met · Audit-ready
          </div>
          <button className="ok-sc-export" style={{ opacity: showFoot ? 1 : 0 }}>Export PDF ↗</button>
        </div>
      </div>
      <div className="ok-sc-replay" onClick={play}>↺ replay</div>
    </div>
  );
}

function PillarRow({ pillar, active }) {
  const val = useCountUp(pillar.target, active, 900);
  return (
    <div>
      <div className="ok-sc-pillar-meta">
        <span className="ok-sc-pillar-name">{pillar.name}</span>
        <span className="ok-sc-pillar-val">{val} / 100</span>
      </div>
      <div className="ok-sc-track">
        <div className="ok-sc-fill" style={{ width: active ? `${pillar.target}%` : "0%", background: pillar.bg }} />
      </div>
    </div>
  );
}

// ─── Reveal wrapper ───────────────────────────────────────────────────────────
function Reveal({ children, delay = "", className = "" }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={`ok-reveal ${visible ? "ok-in" : ""} ${delay} ${className}`}>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OkiruLanding({ onNavigateAuth }: { onNavigateAuth: () => void }) {
  // Inject scoped CSS once, keyed by ID so it's never duplicated
  useEffect(() => {
    const id = "okiru-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = GLOBAL_CSS;
      document.head.appendChild(s);
    }
    // Cleanup on unmount — removes styles when this component leaves the tree
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  return (
    // ← All Okiru markup lives inside .okiru-root, so every CSS rule is scoped here
    <div className="okiru-root">
      <div className="okiru-grain" />

      {/* ── Nav ── */}
      <nav className="ok-nav">
        <div className="ok-nav-w">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ok-wordmark">Okiru</span>
            <span className="ok-nav-chip">B-BBEE Intelligence</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="ok-btn-ghost" onClick={onNavigateAuth}>Sign in</button>
            <button className="ok-btn-pur" onClick={onNavigateAuth}>Get started</button>
          </div>
        </div>
      </nav>

      <main>
        {/* ── Hero ── */}
        <section className="ok-hero">
          <div className="ok-hero-line" />
          <div className="ok-w">
            <p className="ok-eyebrow-hero ok-anim-1">Compliance platform · South Africa</p>
            <h1 className="ok-h1 ok-anim-2">
              Your B-BBEE scorecard,<br /><em>always audit-ready.</em>
            </h1>
            <p className="ok-hero-sub ok-anim-3">
              Import your Excel toolkit. Get an instant, verified scorecard across all five pillars. Export compliance packs in one click.
            </p>
            <div className="ok-hero-btns ok-anim-4">
              <button className="ok-btn-main" onClick={onNavigateAuth}>
                Start for free <span className="arr"><ArrowRight size={14} /></span>
              </button>
              <button className="ok-btn-sec" onClick={onNavigateAuth}>Learn more</button>
            </div>
            <div className="ok-stats">
              {STATS.map((s, i) => (
                <div key={s.l} className={`ok-stat ok-anim-${5 + i}`}>
                  <div className="ok-stat-n">{s.n}</div>
                  <div className="ok-stat-l">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Scorecard ── */}
        <section className="ok-split">
          <Reveal className="ok-split-l">
            <p className="ok-eyebrow">Live scorecard</p>
            <h2 className="ok-h2">Real-time compliance intelligence.</h2>
            <p className="ok-prod-body">The moment your toolkit uploads, Okiru parses every cell, checks every sub-minimum, and surfaces a verified B-BBEE level — no spreadsheet formulas, no manual errors, no waiting.</p>
          </Reveal>
          <Reveal className="ok-split-r" delay="ok-d1">
            <Scorecard />
          </Reveal>
        </section>

        {/* ── Features ── */}
        <div className="ok-feats">
          {FEATURES.map((f, i) => (
            <Reveal key={f.idx} className={`ok-feat${f.highlight ? " ok-feat--hl" : ""}`} delay={i === 1 ? "ok-d1" : i === 2 ? "ok-d2" : i === 3 ? "ok-d3" : ""}>
              <div className="ok-feat-idx">{f.idx}</div>
              <div className="ok-feat-h">{f.title}</div>
              <div className="ok-feat-p">{f.body}</div>
            </Reveal>
          ))}
        </div>

        {/* ── Entity Builder ── */}
        <section className="ok-eb">
          <Reveal className="ok-eb-l">
            <p className="ok-eyebrow">Entity Builder</p>
            <h2 className="ok-h2">Your team. Your entities.<br /><em>Built together.</em></h2>
            <p className="ok-prod-body">Stop managing compliance in silos. Okiru's Entity Builder lets your team construct, configure, and maintain every legal entity in a single shared workspace — with role-based access so the right people see the right data.</p>
            <ul className="ok-eb-list">
              {["Add unlimited entities per organisation", "Assign team members with role-based permissions", "Each entity carries its own live scorecard", "Changes sync instantly across your whole team"].map(item => (
                <li key={item}><span className="ok-eb-dot" /><span>{item}</span></li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="ok-eb-r" delay="ok-d1">
            <div className="ok-eb-card">
              <div className="ok-eb-card-hdr">
                <span className="ok-eb-card-title">Organisation entities</span>
                <button className="ok-eb-add">+ Add entity</button>
              </div>
              <div>
                {ENTITIES.map(e => (
                  <div key={e.name} className={`ok-eb-entity${e.active ? " ok-eb-entity--active" : ""}${e.draft ? " ok-eb-entity--draft" : ""}`}>
                    <div className="ok-eb-entity-l">
                      <div className="ok-eb-avatar" style={{ background: e.avatarBg, color: e.avatarColor }}>{e.letter}</div>
                      <div>
                        <div className="ok-eb-name" style={e.draft ? { color: "rgba(255,255,255,.25)" } : {}}>{e.name}</div>
                        <div className="ok-eb-meta">{e.meta}</div>
                      </div>
                    </div>
                    <div className="ok-eb-entity-r">
                      <span className={`ok-eb-chip ${e.chipClass}`}>{e.chip}</span>
                      {e.members.length > 0 && (
                        <div className="ok-eb-members">
                          {e.members.map((m, mi) => (
                            <div key={mi} className={`ok-eb-av${m.more ? " ok-eb-av--more" : ""}`} style={m.more ? {} : { background: m.bg }}>{m.initials}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="ok-eb-card-ftr">
                <span>3 active · 1 draft</span>
                <span>Last updated 2 min ago</span>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Process ── */}
        <section className="ok-proc">
          <div className="ok-w">
            <div className="ok-proc-grid">
              <Reveal>
                <h2 className="ok-proc-h2">From spreadsheet<br />to submission.</h2>
              </Reveal>
              <div className="ok-proc-steps">
                {STEPS.map((s, i) => (
                  <Reveal key={s.num} className="ok-proc-step" delay={i === 1 ? "ok-d1" : i === 2 ? "ok-d2" : ""}>
                    <div className="ok-proc-num">{s.num}</div>
                    <div>
                      <div className="ok-proc-title">{s.title}</div>
                      <div className="ok-proc-desc">{s.desc}</div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="ok-cta">
          <div className="ok-w">
            <Reveal className="ok-cta-grid">
              <h2 className="ok-cta-h2">Compliance shouldn't<br />take <em>all week.</em></h2>
              <div className="ok-cta-r">
                <button className="ok-btn-main" style={{ fontSize: 15, padding: "14px 34px" }} onClick={onNavigateAuth}>
                  Start for free <span className="arr"><ArrowRight size={15} /></span>
                </button>
                <span className="ok-cta-note">No credit card · Free to start</span>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer>
        <div className="ok-w">
          <div className="ok-foot">
            <span className="ok-foot-wm">Okiru</span>
            <span className="ok-foot-c">© {new Date().getFullYear()} Okiru.Pro — B-BBEE Intelligence Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}