import { useState, useEffect, useRef, useCallback } from "react";
import okiruLogo from "@toolkit-assets/okiru_logo_v2.png";

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');

  .okiru-root *, .okiru-root *::before, .okiru-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .okiru-root {
    --ink:   #0b0f1a;
    --ink2:  #0d1220;
    --rule:  rgba(255,255,255,0.07);
    --muted: rgba(255,255,255,0.32);
    --body:  rgba(255,255,255,0.56);
    --hi:    rgba(255,255,255,0.92);
    --pur:   #6366f1;
    --pur-d: #4338ca;
    --pur-l: #818cf8;
    --coral: #e8724a;
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
  .okiru-root ::selection { background: rgba(99,102,241,0.25); }

  .okiru-root .okiru-grain {
    position: fixed; inset: 0; z-index: 500; pointer-events: none;
    opacity: 0.032;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 256px;
  }

  /* nav */
  .okiru-root .ok-nav {
    position: fixed; top: 0; width: 100%; z-index: 200;
    height: 60px; display: flex; align-items: center;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    background: rgba(11,15,26,0.72);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }
  .okiru-root .ok-nav-w {
    width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 48px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .okiru-root .ok-brand {
    display: inline-flex; align-items: center; gap: 9px;
    text-decoration: none;
  }
  .okiru-root .ok-brand-mark {
    width: 26px; height: 26px; display: block;
    transition: filter .35s ease, transform .35s ease;
  }
  .okiru-root .ok-brand:hover .ok-brand-mark {
    transform: rotate(8deg);
  }
  .okiru-root .ok-wordmark {
    font-family: var(--sans); font-weight: 500; font-size: 15px;
    color: var(--hi); letter-spacing: -0.02em;
  }
  .okiru-root .ok-wordmark strong { font-weight: 600; }
  .okiru-root .ok-wordmark span { font-weight: 300; color: rgba(255,255,255,.6); }

  .okiru-root .ok-nav-links {
    display: flex; align-items: center; gap: 2px;
  }
  .okiru-root .ok-nav-link {
    font-family: var(--sans); font-size: 13.5px; font-weight: 400;
    color: rgba(255,255,255,0.62); background: none; border: none;
    cursor: pointer; padding: 6px 13px; border-radius: 6px;
    transition: color .2s, background .2s;
    text-decoration: none; display: inline-block;
  }
  .okiru-root .ok-nav-link:hover { color: var(--hi); background: rgba(255,255,255,0.05); }

  .okiru-root .ok-btn-demo {
    font-family: var(--sans); font-size: 13px; font-weight: 600;
    color: #fff; background: var(--coral); border: none; cursor: pointer;
    padding: 8px 18px; border-radius: 6px; letter-spacing: -0.01em;
    transition: background .2s, transform .15s;
    display: inline-flex; align-items: center; gap: 7px;
  }
  .okiru-root .ok-btn-demo:hover { background: #d4622f; transform: translateY(-1px); }
  .okiru-root .ok-btn-demo .arr { display: inline-flex; transition: transform .2s; }
  .okiru-root .ok-btn-demo:hover .arr { transform: translateX(3px); }

  .okiru-root .ok-hamburger {
    display: none; background: none; border: none; cursor: pointer; padding: 6px;
    color: var(--hi);
  }
  .okiru-root .ok-mobile-menu {
    display: none; position: fixed; top: 60px; left: 0; right: 0; z-index: 199;
    background: rgba(11,15,26,0.97); backdrop-filter: blur(24px);
    border-bottom: 1px solid var(--rule);
    padding: 20px 24px; flex-direction: column; gap: 12px;
  }
  .okiru-root .ok-mobile-menu.ok-menu-open { display: flex; }

  /* container */
  .okiru-root .ok-w { max-width: 1280px; margin: 0 auto; padding: 0 48px; }

  /* hero */
  .okiru-root .ok-hero {
    padding: 130px 0 52px; position: relative;
    display: flex; align-items: center;
    border-bottom: 1px solid var(--rule); overflow: hidden;
  }

  /* beam / background effect */
  .okiru-root .ok-hero-bg {
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    overflow: hidden;
    background: var(--ink);
  }
  .okiru-root .ok-hero-beam {
    position: absolute;
    top: -10%; right: -5%; width: 55%; height: 120%;
    background: conic-gradient(
      from 195deg at 85% 20%,
      transparent 0deg,
      rgba(180,210,255,0.055) 10deg,
      rgba(220,235,255,0.11) 18deg,
      rgba(200,220,255,0.07) 26deg,
      transparent 38deg
    );
    pointer-events: none;
  }
  .okiru-root .ok-hero-beam-2 {
    position: absolute;
    top: -5%; right: 2%; width: 45%; height: 100%;
    background: conic-gradient(
      from 200deg at 90% 18%,
      transparent 0deg,
      rgba(150,180,255,0.04) 6deg,
      rgba(180,205,255,0.08) 12deg,
      rgba(160,190,255,0.05) 18deg,
      transparent 28deg
    );
    pointer-events: none;
  }
  .okiru-root .ok-hero-glow {
    position: absolute; top: -20%; right: -8%;
    width: 600px; height: 600px; border-radius: 50%;
    background: radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%);
    pointer-events: none;
  }

  /* hero tag chip */
  .okiru-root .ok-hero-tag {
    display: inline-flex; align-items: center; gap: 12px;
    border: 1px solid rgba(255,255,255,0.13);
    background: rgba(255,255,255,0.04);
    border-radius: 4px;
    padding: 6px 14px;
    margin-bottom: 22px;
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em;
    text-transform: uppercase; color: rgba(255,255,255,0.55);
  }
  .okiru-root .ok-hero-tag-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #34d399; box-shadow: 0 0 8px rgba(52,211,153,0.6);
    flex-shrink: 0;
    animation: okiru-tagPulse 2.4s ease-in-out infinite;
  }
  @keyframes okiru-tagPulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(52,211,153,0.6); }
    50% { opacity: .5; box-shadow: 0 0 3px rgba(52,211,153,0.3); }
  }
  .okiru-root .ok-hero-tag-div {
    width: 1px; height: 12px; background: rgba(255,255,255,0.15);
  }
  .okiru-root .ok-hero-tag-brand {
    color: rgba(255,255,255,0.35); letter-spacing: 0.12em;
  }

  /* hero headline */
  .okiru-root .ok-h1 {
    font-family: var(--serif);
    font-size: clamp(2.8rem, 5.8vw, 5.2rem);
    line-height: 1.0; letter-spacing: -0.03em;
    color: #ffffff; font-weight: 400;
    max-width: min(60rem, 100%);
    margin-bottom: 20px;
  }
  .okiru-root .ok-h1-gradient {
    display: block;
    background: linear-gradient(100deg, #f97316 0%, #ef4444 38%, #a855f7 80%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    font-style: italic;
  }

  .okiru-root .ok-hero-sub {
    max-width: min(44rem, 100%);
    font-size: 15px; color: rgba(255,255,255,0.75); line-height: 1.75;
    font-weight: 400; margin-bottom: 32px;
  }
  .okiru-root .ok-hero-sub strong { color: rgba(255,255,255,0.92); font-weight: 500; }

  .okiru-root .ok-hero-btns {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  }
  .okiru-root .ok-btn-main {
    display: inline-flex; align-items: center; gap: 9px;
    font-family: var(--sans); font-size: 15px; font-weight: 600;
    color: #fff; background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.3); cursor: pointer;
    padding: 13px 28px; border-radius: 999px; letter-spacing: -0.01em;
    transition: background .2s, border-color .2s;
  }
  .okiru-root .ok-btn-main:hover { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.5); }
  .okiru-root .ok-btn-main .arr { transition: transform .2s; display: inline-flex; }
  .okiru-root .ok-btn-main:hover .arr { transform: translateX(3px); }
  .okiru-root .ok-btn-cta {
    display: inline-flex; align-items: center; gap: 9px;
    font-family: var(--sans); font-size: 15px; font-weight: 600;
    color: #fff; background: rgba(255,255,255,0.94);
    color: #0b0f1a;
    border: none; cursor: pointer;
    padding: 13px 28px; border-radius: 999px; letter-spacing: -0.01em;
    transition: background .2s, transform .15s;
  }
  .okiru-root .ok-btn-cta:hover { background: #fff; transform: translateY(-1px); }
  .okiru-root .ok-btn-cta .arr { display: inline-flex; transition: transform .2s; }
  .okiru-root .ok-btn-cta:hover .arr { transform: translateX(3px); }
  .okiru-root .ok-btn-sec {
    font-family: var(--sans); font-size: 15px; font-weight: 500;
    color: rgba(255,255,255,0.8);
    background: transparent;
    border: 1px solid rgba(255,255,255,0.22); cursor: pointer;
    padding: 13px 28px; border-radius: 999px;
    transition: border-color .2s, color .2s, background .2s;
  }
  .okiru-root .ok-btn-sec:hover {
    border-color: rgba(255,255,255,0.45);
    color: #fff;
    background: rgba(255,255,255,0.05);
  }

  /* service strip */
  .okiru-root .ok-services {
    display: flex; align-items: stretch;
    border-bottom: 1px solid var(--rule);
  }
  .okiru-root .ok-service {
    flex: 1; padding: 22px 32px;
    border-right: 1px solid var(--rule);
    transition: background .3s;
  }
  .okiru-root .ok-service:last-child { border-right: none; }
  .okiru-root .ok-service:hover { background: rgba(255,255,255,0.02); }
  .okiru-root .ok-service-name {
    font-family: var(--serif); font-size: 1.15rem; font-weight: 400;
    color: var(--hi); margin-bottom: 3px;
  }
  .okiru-root .ok-service-meta {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--muted);
  }

  /* quote block */
  .okiru-root .ok-quote {
    padding: 56px 0; border-bottom: 1px solid var(--rule);
    background: linear-gradient(to bottom, rgba(99,102,241,0.025) 0%, transparent 100%);
  }
  .okiru-root .ok-quote-inner {
    max-width: 820px;
  }
  .okiru-root .ok-quote-text {
    font-family: var(--serif); font-style: italic;
    font-size: clamp(1.55rem, 3.2vw, 2.2rem);
    line-height: 1.38; letter-spacing: -0.02em;
    color: rgba(255,255,255,0.88);
  }
  .okiru-root .ok-quote-text em {
    font-style: italic;
    color: var(--coral);
  }

  /* scroll indicator */
  .okiru-root .ok-scroll-ind {
    position: absolute; bottom: 32px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
    text-transform: uppercase; color: rgba(255,255,255,0.25);
    animation: okiru-scrollBob 2.5s ease-in-out infinite;
  }
  @keyframes okiru-scrollBob {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50% { transform: translateX(-50%) translateY(5px); }
  }

  /* stats */
  .okiru-root .ok-stats {
    display: grid; grid-template-columns: repeat(4,1fr);
    border-bottom: 1px solid var(--rule);
  }
  .okiru-root .ok-stat {
    padding: 32px 0 32px 64px;
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
  .okiru-root .ok-prod-body { font-size: 15px; color: var(--body); line-height: 1.8; max-width: min(28rem, 100%); }

  /* scorecard widget */
  .okiru-root .ok-sc {
    position: relative; border-radius: 12px; overflow: hidden;
    background: #0d0c15;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.08);
    font-family: var(--mono);
  }
  .okiru-root .ok-sc::before {
    content: ''; position: absolute; inset: -1px; border-radius: 13px; z-index: -1;
    background: linear-gradient(135deg,rgba(99,102,241,0.15),transparent 60%);
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
    0%,100% { opacity:1; box-shadow: 0 0 6px #6366f1; }
    50% { opacity:.3; box-shadow: 0 0 2px #6366f1; }
  }
  .okiru-root .ok-sc-livedot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #6366f1; box-shadow: 0 0 6px #6366f1;
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
    color: #818cf8; background: rgba(99,102,241,.12);
    border: 1px solid rgba(99,102,241,.2);
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
    font-size: 10px; color: rgba(99,102,241,.7);
    background: none; border: 1px solid rgba(99,102,241,.2);
    padding: 4px 11px; border-radius: 3px; cursor: pointer;
    font-family: var(--mono); letter-spacing: .04em;
    transition: background .2s, color .2s, opacity .5s ease;
  }
  .okiru-root .ok-sc-export:hover { background: rgba(99,102,241,.12); color: var(--pur-l); }
  .okiru-root .ok-sc-replay {
    display: block; width: 100%; text-align: center; padding: 10px 0 4px;
    font-size: 10px; font-family: var(--mono);
    color: rgba(255,255,255,.15); letter-spacing: .08em; cursor: pointer;
    transition: color .2s; background: none; border: none;
  }
  .okiru-root .ok-sc-replay:hover { color: rgba(99,102,241,.6); }

  /* features */
  .okiru-root .ok-feats { display: grid; grid-template-columns: repeat(3,1fr); border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-feat {
    padding: 52px 44px; border-right: 1px solid var(--rule);
    border-top: 1px solid var(--rule); transition: background .35s; cursor: default;
  }
  .okiru-root .ok-feat:last-child { border-right: none; }
  .okiru-root .ok-feat:hover { background: rgba(99,102,241,0.03); }
  .okiru-root .ok-feat-idx {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: .12em; color: rgba(99,102,241,.45); margin-bottom: 22px;
  }
  .okiru-root .ok-feat-h {
    font-family: var(--serif); font-size: 1.45rem; font-weight: 400;
    letter-spacing: -0.02em; color: var(--hi); line-height: 1.2; margin-bottom: 12px;
  }
  .okiru-root .ok-feat-p { font-size: 14px; color: var(--muted); line-height: 1.75; }

  /* sectors */
  .okiru-root .ok-sectors { padding: 96px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-sectors-hdr { text-align: center; margin-bottom: 56px; }
  .okiru-root .ok-sectors-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  }
  .okiru-root .ok-sector-card {
    background: rgba(255,255,255,0.02); border: 1px solid var(--rule);
    border-radius: 10px; padding: 28px 24px; transition: background .3s, border-color .3s;
  }
  .okiru-root .ok-sector-card:hover { background: rgba(99,102,241,0.04); border-color: rgba(99,102,241,.2); }
  .okiru-root .ok-sector-badge {
    display: inline-block; font-family: var(--mono); font-size: 10px; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 3px 10px; border-radius: 3px; margin-bottom: 14px;
  }
  .okiru-root .ok-sector-name {
    font-family: var(--serif); font-size: 1.2rem; color: var(--hi);
    font-weight: 400; margin-bottom: 6px;
  }
  .okiru-root .ok-sector-meta {
    font-family: var(--mono); font-size: 10px; color: var(--muted);
    letter-spacing: 0.04em; line-height: 1.8;
  }

  /* process steps */
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
    text-transform: uppercase; color: rgba(99,102,241,.45); padding-top: 3px;
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
    opacity: .2;
  }
  .okiru-root .ok-cta-grid { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 48px; }
  .okiru-root .ok-cta-h2 {
    font-family: var(--serif); font-size: clamp(2.2rem,5vw,4.2rem);
    color: var(--hi); font-weight: 400; letter-spacing: -0.03em; line-height: 1.04;
  }
  .okiru-root .ok-cta-h2 em { font-style: italic; color: var(--coral); }
  .okiru-root .ok-cta-r { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .okiru-root .ok-cta-note { font-family: var(--mono); font-size: 11px; color: var(--muted); letter-spacing: .04em; }

  /* footer */
  .okiru-root footer { padding: 26px 0; }
  .okiru-root .ok-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .okiru-root .ok-foot-wm { font-family: var(--serif); font-style: italic; font-size: 15px; color: var(--muted); }
  .okiru-root .ok-foot-c { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.15); letter-spacing: .06em; }
  .okiru-root .ok-foot-links { display: flex; align-items: center; gap: 14px; }
  .okiru-root .ok-foot-link { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.35); letter-spacing: .08em; text-decoration: none; text-transform: uppercase; transition: color .2s ease; }
  .okiru-root .ok-foot-link:hover { color: var(--pur-l); }

  /* scroll reveal */
  .okiru-root .ok-reveal { opacity: 0; transform: translateY(14px); transition: opacity .6s ease, transform .6s ease; }
  .okiru-root .ok-reveal.ok-in { opacity: 1; transform: none; }
  .okiru-root .ok-d1 { transition-delay: .1s; }
  .okiru-root .ok-d2 { transition-delay: .2s; }
  .okiru-root .ok-d3 { transition-delay: .3s; }

  /* hero entrance animations */
  @keyframes okiru-slideUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .okiru-root .ok-anim-1 { opacity: 0; animation: okiru-slideUp .55s ease forwards .05s; }
  .okiru-root .ok-anim-2 { opacity: 0; animation: okiru-slideUp .7s ease forwards .18s; }
  .okiru-root .ok-anim-3 { opacity: 0; animation: okiru-slideUp .65s ease forwards .32s; }
  .okiru-root .ok-anim-4 { opacity: 0; animation: okiru-slideUp .6s ease forwards .46s; }
  .okiru-root .ok-anim-5 { opacity: 0; animation: okiru-slideUp .55s ease forwards .58s; }
  .okiru-root .ok-anim-6 { opacity: 0; animation: okiru-slideUp .5s ease forwards .68s; }

  /* ──── Responsive ──── */
  @media (max-width: 1024px) {
    .okiru-root .ok-sectors-grid { grid-template-columns: repeat(2, 1fr); }
    .okiru-root .ok-services { flex-wrap: wrap; }
    .okiru-root .ok-service { flex: 0 0 33.33%; }
    .okiru-root .ok-service:nth-child(3) { border-right: none; }
  }

  @media (max-width: 900px) {
    .okiru-root .ok-feats { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-feat:nth-child(2n) { border-right: none; }
    .okiru-root .ok-feat:nth-child(3) { border-right: 1px solid var(--rule); }
    .okiru-root .ok-nav-links { display: none; }
  }

  @media (max-width: 760px) {
    .okiru-root .ok-nav-w { padding: 0 20px; }
    .okiru-root .ok-btn-demo { display: none; }
    .okiru-root .ok-hamburger { display: block; }
    .okiru-root .ok-nav-links { display: none; }

    .okiru-root .ok-w { padding: 0 20px; }
    .okiru-root .ok-hero { padding: 120px 0 80px; }
    .okiru-root .ok-h1 { font-size: clamp(2.4rem, 9vw, 3.2rem); }
    .okiru-root .ok-hero-sub { font-size: 15px; }

    .okiru-root .ok-stats { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-stat { padding-left: 20px; }
    .okiru-root .ok-stat:nth-child(2) { border-right: none; }

    .okiru-root .ok-split { grid-template-columns: 1fr; }
    .okiru-root .ok-split-l { border-right: none; border-bottom: 1px solid var(--rule); padding: 48px 20px; }
    .okiru-root .ok-split-r { padding: 48px 20px; }

    .okiru-root .ok-feats { grid-template-columns: 1fr; }
    .okiru-root .ok-feat { border-right: none; }
    .okiru-root .ok-feat:nth-child(3) { border-right: none; }

    .okiru-root .ok-sectors-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-proc-grid { grid-template-columns: 1fr; gap: 40px; }
    .okiru-root .ok-proc-h2 { position: static; }
    .okiru-root .ok-proc-step { grid-template-columns: 44px 1fr; }

    .okiru-root .ok-services { flex-direction: column; }
    .okiru-root .ok-service { border-right: none; border-bottom: 1px solid var(--rule); }
    .okiru-root .ok-service:last-child { border-bottom: none; }

    .okiru-root .ok-cta { padding: 80px 0; }
    .okiru-root .ok-cta-grid { grid-template-columns: 1fr; gap: 32px; }
    .okiru-root .ok-cta-r { align-items: flex-start; }
    .okiru-root .ok-prod-body { max-width: 100%; }
    .okiru-root .ok-sc-num { font-size: 3rem; }

    .okiru-root .ok-quote { padding: 56px 0; }
  }

  @media (max-width: 480px) {
    .okiru-root .ok-h1 { font-size: 2.2rem; }
    .okiru-root .ok-hero-btns { flex-direction: column; align-items: stretch; gap: 10px; }
    .okiru-root .ok-btn-cta, .okiru-root .ok-btn-sec { width: 100%; justify-content: center; text-align: center; }
    .okiru-root .ok-stats { grid-template-columns: 1fr; }
    .okiru-root .ok-stat { border-right: none; }
    .okiru-root .ok-cta-h2 { font-size: 1.8rem; }
  }
`;

const PILLARS = [
  { id: 0, name: "Ownership", target: 87, bg: "linear-gradient(90deg,#4f46e5,#818cf8)" },
  { id: 1, name: "Management Control", target: 61, bg: "linear-gradient(90deg,#0ea5e9,#38bdf8)" },
  { id: 2, name: "Skills Development", target: 95, bg: "linear-gradient(90deg,#059669,#34d399)" },
  { id: 3, name: "Enterprise & Supplier Dev", target: 74, bg: "linear-gradient(90deg,#d97706,#fbbf24)" },
  { id: 4, name: "Socio-Economic Dev", target: 100, bg: "linear-gradient(90deg,#be185d,#f472b6)" },
];

const SERVICES = [
  { name: "B-BBEE", meta: "Certified experts" },
  { name: "ESG", meta: "Strategy & reporting" },
  { name: "AI", meta: "Integration & training" },
  { name: "EE", meta: "Workforce equity" },
  { name: "WSP", meta: "Skills & reporting" },
];

const FEATURES = [
  { idx: "01", title: "B-BBEE Scorecard Engine", body: "Upload your sector-specific B-BBEE Excel toolkit. Our engine parses every sheet, maps every formula, and scores all five pillars automatically against the latest sector codes — RCOGP, ICT, FSC, AgriBEE." },
  { idx: "02", title: "ESG & Net-Zero Reporting", body: "Track ESG metrics, emissions data, and Net-Zero targets in one place. Produce audit-ready sustainability reports aligned to GRI, TCFD, and the latest JSE disclosure requirements." },
  { idx: "03", title: "AI-Powered Document Extraction", body: "Upload compliance documents and let AI-powered entity extraction pull structured data using ontology-backed templates — skills matrices, payroll records, supplier certificates, and more." },
];

const SECTORS = [
  { code: "RCOGP", name: "Retail, Construction, Oil & Gas, Property", types: "Generic + QSE", nodes: "2,985", edges: "5,695", color: "#60a5fa", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.25)" },
  { code: "ICT", name: "Information & Communications Technology", types: "Generic + QSE", nodes: "5,193", edges: "9,415", color: "#a78bfa", bg: "rgba(167,139,250,.12)", border: "rgba(167,139,250,.2)" },
  { code: "FSC", name: "Financial Sector Code", types: "Generic", nodes: "487", edges: "689", color: "#fbbf24", bg: "rgba(251,191,36,.12)", border: "rgba(251,191,36,.2)" },
  { code: "AGRI", name: "Agriculture (AgriBEE)", types: "Generic", nodes: "3,281", edges: "6,267", color: "#34d399", bg: "rgba(52,211,153,.12)", border: "rgba(52,211,153,.2)" },
];

const STATS = [
  { n: "6", l: "Sector templates" },
  { n: "5", l: "Pillars scored" },
  { n: "12k+", l: "Formula nodes" },
  { n: "4", l: "Frameworks" },
];

const STEPS = [
  { num: "01", title: "Connect your data", desc: "Import your B-BBEE Excel workbook, payroll exports, supplier registers, and training records. We parse every sheet and build a computation graph specific to your sector code." },
  { num: "02", title: "Score automatically", desc: "Our computation engine evaluates your scorecard across all five pillars against the relevant sector code. Sub-minimums are checked, recognition levels calculated in real time." },
  { num: "03", title: "Extract & verify", desc: "Upload supporting documents. AI-powered extraction pulls entity data using ontology templates — identify gaps before your verification agency does." },
  { num: "04", title: "Export & submit", desc: "Generate audit-ready compliance packs. Every figure is traceable back to its source document and formula. Report-ready for ESG, B-BBEE, WSP, and EE submissions." },
];

const NAV_LINKS = ["Toolkit", "Frameworks", "Engagement", "Net-Zero", "Why Okiru"];

const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
const Check = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const ScrollArrow = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="1" x2="6" y2="13" /><polyline points="2 9 6 13 10 9" />
  </svg>
);

function useReveal(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
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
  return [ref, visible] as const;
}

function useCountUp(target: number, active: boolean, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
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

function Scorecard() {
  const scRef = useRef<HTMLDivElement>(null);
  const [showNum, setShowNum] = useState(false);
  const [showRec, setShowRec] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [activeBars, setActiveBars] = useState<number[]>([]);
  const [showFoot, setShowFoot] = useState(false);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timerRefs.current.forEach(clearTimeout); timerRefs.current = []; };
  const t = (fn: () => void, ms: number) => { timerRefs.current.push(setTimeout(fn, ms)); };

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
            <span className="ok-sc-badge-sub" style={{ opacity: showSub ? 1 : 0 }}>Sub-minimums met</span>
          </div>
        </div>
        <div className="ok-sc-pillars">
          {PILLARS.map((p) => (
            <PillarRow key={p.id} pillar={p} active={activeBars.includes(p.id)} />
          ))}
        </div>
        <div className="ok-sc-foot">
          <div className="ok-sc-ok" style={{ opacity: showFoot ? 1 : 0 }}>
            <Check size={12} /> Audit-ready
          </div>
          <button className="ok-sc-export" style={{ opacity: showFoot ? 1 : 0 }}>Export Pack</button>
        </div>
      </div>
      <button type="button" className="ok-sc-replay" onClick={play}>replay</button>
    </div>
  );
}

function PillarRow({ pillar, active }: { pillar: typeof PILLARS[0]; active: boolean }) {
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

function Reveal({ children, delay = "", className = "" }: { children: React.ReactNode; delay?: string; className?: string }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={`ok-reveal ${visible ? "ok-in" : ""} ${delay} ${className}`}>
      {children}
    </div>
  );
}

export default function OkiruLanding({ onNavigateAuth, onNavigateRegister, onNavigateCertificates }: { onNavigateAuth: () => void; onNavigateRegister?: () => void; onNavigateCertificates?: () => void }) {
  const goRegister = onNavigateRegister || onNavigateAuth;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const id = "okiru-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = GLOBAL_CSS;
      document.head.appendChild(s);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
      document.addEventListener("keydown", handleKey);
      return () => { document.body.style.overflow = ""; document.removeEventListener("keydown", handleKey); };
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 761px)");
    const handler = () => { if (mq.matches) setMenuOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="okiru-root">
      <div className="okiru-grain" />

      {/* ── Nav ── */}
      <nav className="ok-nav">
        <div className="ok-nav-w">
          <a href="/" className="ok-brand" aria-label="Okiru home">
            <img src={okiruLogo} alt="" className="ok-brand-mark" />
            <span className="ok-wordmark"><strong>Okiru</strong><span> Consulting</span></span>
          </a>

          <div className="ok-nav-links">
            {NAV_LINKS.map(link => (
              <button key={link} className="ok-nav-link" onClick={link === "Toolkit" ? goRegister : undefined}>
                {link}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="ok-btn-demo" onClick={goRegister}>
              Book a demo <span className="arr"><ArrowRight size={13} /></span>
            </button>
            <button className="ok-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen} aria-controls="ok-mobile-nav">
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile menu ── */}
      <div id="ok-mobile-nav" role="navigation" className={`ok-mobile-menu ${menuOpen ? "ok-menu-open" : ""}`}>
        {NAV_LINKS.map(link => (
          <button key={link} className="ok-nav-link" style={{ textAlign: "left", padding: "12px 0", fontSize: 16, color: "var(--hi)" }}
            onClick={() => { setMenuOpen(false); if (link === "Toolkit") goRegister(); }}>
            {link}
          </button>
        ))}
        <button className="ok-btn-login" style={{ justifyContent: "center", marginTop: 8, padding: "12px 0", background: "var(--coral)", border: "none", color: "#fff", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
          onClick={() => { setMenuOpen(false); onNavigateAuth(); }}>
          Sign in
        </button>
        <button className="ok-btn-demo" style={{ justifyContent: "center" }} onClick={() => { setMenuOpen(false); goRegister(); }}>
          Book a demo <span className="arr"><ArrowRight size={13} /></span>
        </button>
      </div>

      <main>
        {/* ── Hero ── */}
        <section className="ok-hero">
          <div className="ok-hero-bg" aria-hidden>
            <div className="ok-hero-beam" />
            <div className="ok-hero-beam-2" />
            <div className="ok-hero-glow" />
          </div>

          <div className="ok-w" style={{ position: "relative", zIndex: 1, width: "100%" }}>
            <div className="ok-hero-tag ok-anim-1">
              <span className="ok-hero-tag-dot" />
              ESG&nbsp;·&nbsp;B-BBEE&nbsp;·&nbsp;AI&nbsp;·&nbsp;Skills&nbsp;·&nbsp;WSP
              <span className="ok-hero-tag-div" />
              <span className="ok-hero-tag-brand">Okiru Consulting&nbsp;&nbsp;·&nbsp;&nbsp;Est.&nbsp;2023</span>
            </div>

            <h1 className="ok-h1 ok-anim-2">
              Transformation<br />
              <span className="ok-h1-gradient">Toolkit.</span>
            </h1>

            <p className="ok-hero-sub ok-anim-3">
              Expert ESG, B-BBEE, AI &amp; Skills Development advisory for South African
              businesses ready to transform. <strong>One toolkit. Every framework.</strong> Net-Zero ready.
            </p>

            <div className="ok-hero-btns ok-anim-4">
              <button className="ok-btn-cta" onClick={goRegister}>
                Book a 45-min demo <span className="arr"><ArrowRight size={14} /></span>
              </button>
              <button className="ok-btn-sec" onClick={goRegister}>
                Explore the toolkit
              </button>
            </div>
          </div>

        </section>

        {/* ── Service strip ── */}
        <div className="ok-services">
          {SERVICES.map(s => (
            <div key={s.name} className="ok-service">
              <div className="ok-service-name">{s.name}</div>
              <div className="ok-service-meta">{s.meta}</div>
            </div>
          ))}
        </div>

        {/* ── Quote ── */}
        <section className="ok-quote">
          <div className="ok-w">
            <Reveal className="ok-quote-inner">
              <p className="ok-quote-text">
                "Every credible ESG strategy ends at Net Zero.{" "}
                <em>Most begin without the data to get there.</em>"
              </p>
            </Reveal>
          </div>
          <div className="ok-scroll-ind" style={{ position: "relative", bottom: "auto", left: "auto", transform: "none", margin: "40px auto 0", display: "flex" }} aria-hidden>
            <span>SCROLL</span>
            <ScrollArrow />
          </div>
        </section>

        {/* ── Stats ── */}
        <div className="ok-stats">
          {STATS.map((s, i) => (
            <Reveal key={s.l} className="ok-stat" delay={i > 0 ? `ok-d${Math.min(i, 3)}` : ""}>
              <div className="ok-stat-n">{s.n}</div>
              <div className="ok-stat-l">{s.l}</div>
            </Reveal>
          ))}
        </div>

        {/* ── Product split: scorecard ── */}
        <section className="ok-split">
          <Reveal className="ok-split-l">
            <p className="ok-eyebrow">Live scorecard</p>
            <h2 className="ok-h2">Real-time<br /><em>compliance scoring.</em></h2>
            <p className="ok-prod-body">Upload your B-BBEE Excel toolkit and Okiru instantly builds a formula dependency graph, evaluates every calculation, checks sub-minimums, and surfaces your verified B-BBEE level across all five pillars.</p>
          </Reveal>
          <Reveal className="ok-split-r" delay="ok-d1">
            <Scorecard />
          </Reveal>
        </section>

        {/* ── Features ── */}
        <div className="ok-feats">
          {FEATURES.map((f, i) => (
            <Reveal key={f.idx} className="ok-feat" delay={i === 1 ? "ok-d1" : i === 2 ? "ok-d2" : ""}>
              <div className="ok-feat-idx">{f.idx}</div>
              <div className="ok-feat-h">{f.title}</div>
              <div className="ok-feat-p">{f.body}</div>
            </Reveal>
          ))}
        </div>

        {/* ── Sector coverage ── */}
        <section className="ok-sectors">
          <div className="ok-w">
            <Reveal className="ok-sectors-hdr">
              <p className="ok-eyebrow" style={{ textAlign: "center" }}>Sector coverage</p>
              <h2 className="ok-h2" style={{ textAlign: "center" }}>Four sectors.<br /><em>Six scorecard templates.</em></h2>
              <p className="ok-prod-body" style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
                Each template is backed by a formula graph extracted directly from the official B-BBEE toolkit Excel workbooks, with thousands of interconnected nodes and edges.
              </p>
            </Reveal>
            <div className="ok-sectors-grid">
              {SECTORS.map((s, i) => (
                <Reveal key={s.code} delay={i > 0 ? `ok-d${Math.min(i, 3)}` : ""}>
                  <div className="ok-sector-card">
                    <span className="ok-sector-badge" style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>{s.code}</span>
                    <div className="ok-sector-name">{s.name}</div>
                    <div className="ok-sector-meta">
                      {s.types}<br />
                      {s.nodes} nodes · {s.edges} edges
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="ok-proc">
          <div className="ok-w">
            <div className="ok-proc-grid">
              <Reveal>
                <h2 className="ok-proc-h2">From data to<br />compliance pack.</h2>
              </Reveal>
              <div className="ok-proc-steps">
                {STEPS.map((s, i) => (
                  <Reveal key={s.num} className="ok-proc-step" delay={i === 1 ? "ok-d1" : i === 2 ? "ok-d2" : i === 3 ? "ok-d3" : ""}>
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
                <button className="ok-btn-demo" style={{ fontSize: 15, padding: "14px 34px", borderRadius: 999 }} onClick={goRegister}>
                  Book a demo <span className="arr"><ArrowRight size={15} /></span>
                </button>
                <span className="ok-cta-note">Free discovery session</span>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer>
        <div className="ok-w">
          <div className="ok-foot">
            <span className="ok-foot-wm" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <img src={okiruLogo} alt="" style={{ width: 22, height: 22, opacity: 0.85 }} />
              Okiru Consulting
            </span>
            <span className="ok-foot-c">&copy; {new Date().getFullYear()} Okiru Pro — B-BBEE &amp; ESG Compliance Platform</span>
            <div className="ok-foot-links">
              <button className="ok-foot-link" onClick={onNavigateAuth} style={{ background: "none", border: "none", cursor: "pointer" }}>Sign in</button>
              <a href="/devmode" className="ok-foot-link" data-testid="link-devmode">{`{DevMode}`}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
