import { useState, useEffect, useRef } from "react";
import okiruLogo from "@toolkit-assets/okiru_logo_v2.png";
import { PRODUCT_TABS, PRODUCTS } from "./productLandingConfig";

/* ─────────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────────── */
export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');

  .okiru-root *, .okiru-root *::before, .okiru-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .okiru-root {
    --ink:    #0b0f1a;
    --ink2:   #0d1220;
    --rule:   rgba(255,255,255,0.07);
    --muted:  rgba(255,255,255,0.32);
    --body:   rgba(255,255,255,0.56);
    --hi:     rgba(255,255,255,0.92);
    /* Logo brand palette */
    --orange: #e8441a;
    --cyan:   #06b6d4;
    --pur:    #9333ea;
    --pur-d:  #7e22ce;
    --pur-l:  #c084fc;
    --coral:  #e8441a;
    --green:  #34d399;
    /* Logo gradient — orange → cyan → purple */
    --grad:       linear-gradient(135deg, #e8441a 0%, #06b6d4 50%, #9333ea 100%);
    --grad-r:     linear-gradient(135deg, #9333ea 0%, #06b6d4 50%, #e8441a 100%);
    --grad-text:  linear-gradient(100deg, #e8441a 0%, #06b6d4 48%, #9333ea 95%);
    --grad-h:     linear-gradient(90deg, #e8441a, #06b6d4, #9333ea);
    --mono:  'Geist Mono', monospace;
    --serif: 'Instrument Serif', serif;
    --sans:  'Geist', sans-serif;
    background: var(--ink); color: var(--body);
    font-family: var(--sans); font-weight: 300;
    font-size: 15px; line-height: 1.65; overflow-x: hidden; min-height: 100%;
  }
  .okiru-root ::selection { background: rgba(6,182,212,0.22); }

  .okiru-root .okiru-grain {
    position: fixed; inset: 0; z-index: 500; pointer-events: none; opacity: 0.032;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 256px;
  }

  /* ── NAV (floating command bar) ── */
  .okiru-root .ok-nav {
    position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
    width: calc(100% - 32px); max-width: 1200px; z-index: 200;
    border-radius: 15px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(11,15,26,0.62);
    backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
    box-shadow: 0 10px 40px rgba(0,0,0,0.35);
    animation: okiru-navDrop .8s cubic-bezier(.16,1,.3,1) both;
    transition: top .45s cubic-bezier(.16,1,.3,1), max-width .45s cubic-bezier(.16,1,.3,1),
                background .35s, box-shadow .35s, border-radius .35s;
  }
  .okiru-root .ok-nav.ok-nav-scrolled {
    top: 8px; max-width: 940px; border-radius: 13px;
    background: rgba(11,15,26,0.9);
    box-shadow: 0 12px 46px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02);
  }
  @keyframes okiru-navDrop {
    from { opacity: 0; transform: translate(-50%, -150%); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }
  /* animated purple→blue→orange hairline border */
  .okiru-root .ok-nav::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
    background: linear-gradient(115deg, transparent 8%, rgba(147,51,234,0.55) 28%, rgba(6,182,212,0.55) 50%, rgba(232,68,26,0.5) 72%, transparent 92%);
    background-size: 260% 100%;
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    animation: okiru-navSheen 9s linear infinite; opacity: 0.75; pointer-events: none;
  }
  @keyframes okiru-navSheen { 0% { background-position: 0% 50%; } 100% { background-position: 260% 50%; } }

  .okiru-root .ok-nav-inner {
    position: relative; z-index: 1;
    width: 100%; margin: 0 auto; padding: 0 22px;
    height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .okiru-root .ok-nav-inner > * { opacity: 0; animation: okiru-navFade .6s ease forwards; }
  .okiru-root .ok-nav-inner > *:nth-child(1) { animation-delay: .18s; }
  .okiru-root .ok-nav-inner > *:nth-child(2) { animation-delay: .28s; }
  .okiru-root .ok-nav-inner > *:nth-child(3) { animation-delay: .38s; }
  @keyframes okiru-navFade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

  .okiru-root .ok-brand { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; flex-shrink: 0; }
  .okiru-root .ok-brand-mark {
    width: 26px; height: 26px; display: block;
    transition: transform .5s cubic-bezier(.16,1,.3,1);
    animation: okiru-markGlow 4.5s ease-in-out infinite;
  }
  @keyframes okiru-markGlow {
    0%, 100% { filter: drop-shadow(0 0 2px rgba(147,51,234,0)); }
    50%      { filter: drop-shadow(0 0 7px rgba(147,51,234,0.5)); }
  }
  .okiru-root .ok-brand:hover .ok-brand-mark { transform: rotate(-12deg) scale(1.08); }
  .okiru-root .ok-wordmark { font-family: var(--sans); font-weight: 500; font-size: 15px; color: var(--hi); letter-spacing: -0.02em; }
  .okiru-root .ok-wordmark strong { font-weight: 600; }
  .okiru-root .ok-wordmark span { font-weight: 300; color: rgba(255,255,255,.5); }

  .okiru-root .ok-nav-center { display: flex; align-items: center; gap: 2px; }
  .okiru-root .ok-nav-link {
    position: relative; font-family: var(--sans); font-size: 13.5px; font-weight: 400;
    color: rgba(255,255,255,0.55); background: none; border: none; cursor: pointer;
    padding: 7px 14px; border-radius: 8px; transition: color .25s; text-decoration: none;
    white-space: nowrap;
  }
  .okiru-root .ok-nav-link::after {
    content: ''; position: absolute; left: 14px; right: 14px; bottom: 4px; height: 1.5px;
    background: var(--grad); border-radius: 2px;
    transform: scaleX(0); transform-origin: center;
    transition: transform .32s cubic-bezier(.16,1,.3,1);
  }
  .okiru-root .ok-nav-link:hover { color: var(--hi); }
  .okiru-root .ok-nav-link:hover::after { transform: scaleX(1); }
  .okiru-root .ok-nav-link.ok-nav-active { color: var(--hi); }
  .okiru-root .ok-nav-link.ok-nav-active::after { transform: scaleX(1); }
  .okiru-root .ok-nav-div { width: 1px; height: 16px; background: rgba(255,255,255,0.12); margin: 0 6px; flex-shrink: 0; }

  .okiru-root .ok-nav-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .okiru-root .ok-nav-signin {
    font-family: var(--sans); font-size: 13px; font-weight: 400;
    color: rgba(255,255,255,0.55); background: none; border: 1px solid rgba(255,255,255,0.12); cursor: pointer;
    padding: 7px 16px; border-radius: 8px; transition: color .2s, border-color .2s, background .2s;
  }
  .okiru-root .ok-nav-signin:hover { color: var(--hi); border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.04); }
  .okiru-root .ok-nav-demo-btn {
    position: relative; overflow: hidden;
    font-family: var(--sans); font-size: 13px; font-weight: 600;
    color: #fff; background: var(--grad); border: none; cursor: pointer;
    padding: 8px 18px; border-radius: 8px; letter-spacing: -0.01em;
    transition: transform .18s cubic-bezier(.16,1,.3,1), box-shadow .25s;
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
  }
  .okiru-root .ok-nav-demo-btn::before {
    content: ''; position: absolute; top: 0; left: -80%; width: 55%; height: 100%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent);
    transform: skewX(-18deg); pointer-events: none;
  }
  .okiru-root .ok-nav-demo-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(147,51,234,0.35); }
  .okiru-root .ok-nav-demo-btn:hover::before { animation: okiru-btnSheen .7s ease; }
  @keyframes okiru-btnSheen { from { left: -80%; } to { left: 130%; } }
  .okiru-root .ok-nav-demo-btn > * { position: relative; z-index: 1; }
  .okiru-root .ok-nav-demo-btn .arr { display: inline-flex; transition: transform .2s; }
  .okiru-root .ok-nav-demo-btn:hover .arr { transform: translateX(3px); }

  .okiru-root .ok-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 6px; color: var(--hi); }
  .okiru-root .ok-mobile-menu {
    display: none; position: fixed; top: 80px; left: 16px; right: 16px; z-index: 199;
    background: rgba(11,15,26,0.97); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    border: 1px solid var(--rule); border-radius: 16px; padding: 14px 20px 20px; flex-direction: column; gap: 4px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .okiru-root .ok-mobile-menu.ok-menu-open { display: flex; animation: okiru-menuIn .3s cubic-bezier(.16,1,.3,1) both; }
  @keyframes okiru-menuIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  .okiru-root .ok-mobile-link {
    font-family: var(--sans); font-size: 15px; font-weight: 400;
    color: rgba(255,255,255,.75); background: none; border: none; cursor: pointer;
    padding: 12px 2px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.06); width: 100%;
    transition: color .2s, padding-left .2s;
  }
  .okiru-root .ok-mobile-link:last-of-type { border-bottom: none; }
  .okiru-root .ok-mobile-link:hover { color: var(--hi); padding-left: 8px; }
  .okiru-root .ok-mobile-cta {
    margin-top: 16px; width: 100%; padding: 14px; border-radius: 10px;
    background: var(--grad); border: none; cursor: pointer; font-family: var(--sans);
    font-size: 15px; font-weight: 600; color: #fff;
  }

  /* ── MODAL ── */
  .okiru-root .ok-modal-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(5,8,18,0.88); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center; padding: 24px;
    animation: okiru-fadeIn .2s ease;
  }
  @keyframes okiru-fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes okiru-slideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

  .okiru-root .ok-modal {
    width: 100%; max-width: 540px; background: #0d1120;
    border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
    box-shadow: 0 40px 100px rgba(0,0,0,0.7);
    animation: okiru-slideUp .25s ease;
    overflow: hidden;
  }
  .okiru-root .ok-modal-head {
    padding: 28px 32px 0;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  }
  .okiru-root .ok-modal-title {
    font-family: var(--serif); font-size: 1.55rem; color: var(--hi);
    font-weight: 400; letter-spacing: -0.02em; line-height: 1.15; margin-bottom: 6px;
  }
  .okiru-root .ok-modal-sub { font-size: 13px; color: var(--muted); line-height: 1.6; }
  .okiru-root .ok-modal-close {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px; cursor: pointer; color: var(--muted); padding: 7px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: background .2s, color .2s;
  }
  .okiru-root .ok-modal-close:hover { background: rgba(255,255,255,0.1); color: var(--hi); }

  .okiru-root .ok-modal-body { padding: 24px 32px 32px; }
  .okiru-root .ok-form { display: flex; flex-direction: column; gap: 16px; }
  .okiru-root .ok-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .okiru-root .ok-field { display: flex; flex-direction: column; gap: 6px; }
  .okiru-root .ok-label {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
    color: rgba(255,255,255,0.4);
  }
  .okiru-root .ok-label .ok-req { color: var(--coral); margin-left: 2px; }
  .okiru-root .ok-input, .okiru-root .ok-textarea {
    font-family: var(--sans); font-size: 14px; font-weight: 400;
    color: var(--hi); background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
    padding: 11px 14px; outline: none; width: 100%;
    transition: border-color .2s, background .2s;
  }
  .okiru-root .ok-input::placeholder, .okiru-root .ok-textarea::placeholder { color: rgba(255,255,255,0.2); }
  .okiru-root .ok-input:focus, .okiru-root .ok-textarea:focus { border-color: rgba(6,182,212,0.5); background: rgba(6,182,212,0.03); }
  .okiru-root .ok-input.ok-err { border-color: rgba(239,68,68,0.5); }
  .okiru-root .ok-textarea { resize: vertical; min-height: 88px; line-height: 1.6; }
  .okiru-root .ok-field-err { font-size: 11.5px; color: #f87171; }
  .okiru-root .ok-form-submit {
    font-family: var(--sans); font-size: 15px; font-weight: 600; color: #fff;
    background: var(--grad); border: none; cursor: pointer; padding: 14px 24px;
    border-radius: 8px; transition: opacity .2s, transform .15s; display: flex;
    align-items: center; justify-content: center; gap: 9px; margin-top: 4px;
  }
  .okiru-root .ok-form-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  .okiru-root .ok-form-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

  .okiru-root .ok-modal-success {
    padding: 48px 32px; text-align: center;
  }
  .okiru-root .ok-success-icon {
    width: 52px; height: 52px; border-radius: 50%; background: rgba(52,211,153,.12);
    border: 1px solid rgba(52,211,153,.25); display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px; color: var(--green);
  }
  .okiru-root .ok-success-title { font-family: var(--serif); font-size: 1.5rem; color: var(--hi); margin-bottom: 10px; }
  .okiru-root .ok-success-sub { font-size: 14px; color: var(--muted); line-height: 1.75; max-width: 340px; margin: 0 auto; }

  /* ── CONTAINER ── */
  .okiru-root .ok-w { max-width: 1280px; margin: 0 auto; padding: 0 48px; }

  /* ── HERO ── */
  .okiru-root .ok-hero {
    padding: 132px 0 52px; position: relative;
    border-bottom: 1px solid var(--rule); overflow: hidden;
  }
  .okiru-root .ok-hero-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; background: var(--ink); }
  .okiru-root .ok-hero-beam {
    position: absolute; top: -10%; right: -5%; width: 55%; height: 120%;
    background: conic-gradient(from 195deg at 85% 20%, transparent 0deg, rgba(6,182,212,0.06) 10deg, rgba(147,51,234,0.10) 18deg, rgba(232,68,26,0.05) 26deg, transparent 38deg);
  }
  .okiru-root .ok-hero-beam-2 {
    position: absolute; top: -5%; right: 2%; width: 45%; height: 100%;
    background: conic-gradient(from 200deg at 90% 18%, transparent 0deg, rgba(232,68,26,0.04) 6deg, rgba(6,182,212,0.07) 12deg, rgba(147,51,234,0.04) 18deg, transparent 28deg);
  }
  .okiru-root .ok-hero-glow {
    position: absolute; top: -20%; right: -8%; width: 700px; height: 700px; border-radius: 50%;
    background: radial-gradient(circle, rgba(6,182,212,0.08) 0%, rgba(147,51,234,0.05) 40%, transparent 70%);
  }
  .okiru-root .ok-hero-glow-2 {
    position: absolute; bottom: -10%; left: -5%; width: 500px; height: 500px; border-radius: 50%;
    background: radial-gradient(circle, rgba(232,68,26,0.06) 0%, transparent 65%);
  }

  .okiru-root .ok-hero-tag {
    display: inline-flex; align-items: center; gap: 12px;
    border: 1px solid rgba(255,255,255,0.13); background: rgba(255,255,255,0.04);
    border-radius: 4px; padding: 6px 14px; margin-bottom: 22px;
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em;
    text-transform: uppercase; color: rgba(255,255,255,0.55);
  }
  .okiru-root .ok-hero-tag-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #34d399;
    box-shadow: 0 0 8px rgba(52,211,153,0.6); flex-shrink: 0;
    animation: okiru-tagPulse 2.4s ease-in-out infinite;
  }
  @keyframes okiru-tagPulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(52,211,153,0.6); }
    50% { opacity: .5; box-shadow: 0 0 3px rgba(52,211,153,0.3); }
  }
  .okiru-root .ok-hero-tag-div { width: 1px; height: 12px; background: rgba(255,255,255,0.15); }
  .okiru-root .ok-hero-tag-brand { color: rgba(255,255,255,0.35); letter-spacing: 0.12em; }

  .okiru-root .ok-h1 {
    font-family: var(--serif); font-size: clamp(2.8rem, 5.8vw, 5.2rem);
    line-height: 1.0; letter-spacing: -0.03em; color: #ffffff; font-weight: 400;
    max-width: min(60rem, 100%); margin-bottom: 20px;
  }
  .okiru-root .ok-h1-gradient {
    display: block;
    background: var(--grad-text);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-style: italic;
  }
  .okiru-root .ok-hero-sub {
    max-width: min(44rem, 100%); font-size: 15px; color: rgba(255,255,255,0.75);
    line-height: 1.75; font-weight: 400; margin-bottom: 32px;
  }
  .okiru-root .ok-hero-sub strong { color: rgba(255,255,255,0.92); font-weight: 500; }
  .okiru-root .ok-hero-btns { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

  .okiru-root .ok-btn-cta {
    display: inline-flex; align-items: center; gap: 9px; font-family: var(--sans);
    font-size: 15px; font-weight: 600; color: #fff; background: var(--grad);
    border: none; cursor: pointer; padding: 13px 28px; border-radius: 999px;
    letter-spacing: -0.01em; transition: opacity .2s, transform .15s; position: relative;
  }
  .okiru-root .ok-btn-cta:hover { opacity: 0.88; transform: translateY(-1px); }
  .okiru-root .ok-btn-cta .arr { display: inline-flex; transition: transform .2s; }
  .okiru-root .ok-btn-cta:hover .arr { transform: translateX(3px); }
  .okiru-root .ok-btn-sec {
    font-family: var(--sans); font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.8);
    background: transparent; border: 1px solid rgba(255,255,255,0.22); cursor: pointer;
    padding: 13px 28px; border-radius: 999px; transition: border-color .2s, color .2s, background .2s;
  }
  .okiru-root .ok-btn-sec:hover { border-color: rgba(255,255,255,0.45); color: #fff; background: rgba(255,255,255,0.05); }

  /* ── SERVICE STRIP ── */
  .okiru-root .ok-services { display: flex; align-items: stretch; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-service { flex: 1; padding: 22px 32px; border-right: 1px solid var(--rule); transition: background .3s; }
  .okiru-root .ok-service:last-child { border-right: none; }
  .okiru-root .ok-service:hover { background: rgba(255,255,255,0.02); }
  .okiru-root .ok-service-name { font-family: var(--serif); font-size: 1.15rem; font-weight: 400; color: var(--hi); margin-bottom: 3px; }
  .okiru-root .ok-service-meta { font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }

  /* ── QUOTE ── */
  .okiru-root .ok-quote {
    padding: 56px 0 40px; border-bottom: 1px solid var(--rule);
    background: linear-gradient(to bottom, rgba(6,182,212,0.025) 0%, transparent 100%);
  }
  .okiru-root .ok-quote-inner { max-width: 820px; }
  .okiru-root .ok-quote-text {
    font-family: var(--serif); font-style: italic;
    font-size: clamp(1.55rem, 3.2vw, 2.2rem); line-height: 1.38;
    letter-spacing: -0.02em; color: rgba(255,255,255,0.88);
  }
  .okiru-root .ok-quote-text em { font-style: italic; color: var(--coral); }

  .okiru-root .ok-scroll-ind {
    display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 36px;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(255,255,255,0.2);
    animation: okiru-scrollBob 2.5s ease-in-out infinite;
  }
  @keyframes okiru-scrollBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(5px); } }

  /* ── SHARED SECTION STYLES ── */
  .okiru-root .ok-section { padding: 96px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-sec-num {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
    background: var(--grad-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; margin-bottom: 10px; display: inline-block;
  }
  .okiru-root .ok-eyebrow {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.14em; color: #22d3ee; margin-bottom: 16px; display: block;
  }
  .okiru-root .ok-h2 {
    font-family: var(--serif); font-size: clamp(1.9rem,3.2vw,2.8rem);
    color: var(--hi); font-weight: 400; letter-spacing: -0.025em; line-height: 1.08;
  }
  .okiru-root .ok-h3 {
    font-family: var(--serif); font-size: clamp(1.4rem,2.2vw,1.9rem);
    color: var(--hi); font-weight: 400; letter-spacing: -0.02em; line-height: 1.1;
  }
  .okiru-root .ok-lead { font-size: 15px; color: var(--body); line-height: 1.8; margin-top: 16px; }
  .okiru-root .ok-lead-l { font-size: 15px; color: var(--body); line-height: 1.8; margin-top: 16px; max-width: 42rem; }

  /* ── SECTION 02: CHALLENGE ── */
  .okiru-root .ok-challenge-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 2px; margin-top: 56px; }
  .okiru-root .ok-challenge-card {
    padding: 40px 36px; border: 1px solid var(--rule);
    background: rgba(255,255,255,0.015); position: relative; overflow: hidden; transition: background .3s;
  }
  .okiru-root .ok-challenge-card:hover { background: rgba(99,102,241,0.04); }
  .okiru-root .ok-challenge-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--grad-h); opacity: 0.7;
  }
  .okiru-root .ok-challenge-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #06b6d4; margin-bottom: 14px; display: block; }
  .okiru-root .ok-challenge-title { font-family: var(--serif); font-size: 1.3rem; color: var(--hi); font-weight: 400; letter-spacing: -0.02em; margin-bottom: 10px; }
  .okiru-root .ok-challenge-stat { font-family: var(--serif); font-size: 2.4rem; color: var(--hi); font-style: italic; letter-spacing: -0.04em; margin-bottom: 4px; line-height: 1; }
  .okiru-root .ok-challenge-stat-label { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px; }
  .okiru-root .ok-challenge-desc { font-size: 13.5px; color: var(--muted); line-height: 1.75; }

  /* ── SECTION 03: WHO WE ARE ── */
  .okiru-root .ok-about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; margin-top: 56px; }
  .okiru-root .ok-about-pillar { display: grid; grid-template-columns: 56px 1fr; padding: 28px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-about-pillar:last-child { border-bottom: none; }
  .okiru-root .ok-about-pillar-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(6,182,212,.5); padding-top: 4px; }
  .okiru-root .ok-about-pillar-name { font-family: var(--serif); font-size: 1.1rem; color: var(--hi); font-weight: 400; margin-bottom: 5px; }
  .okiru-root .ok-about-pillar-sub { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px; }
  .okiru-root .ok-about-pillar-desc { font-size: 13.5px; color: var(--muted); line-height: 1.7; }
  .okiru-root .ok-about-badges { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 32px; }
  .okiru-root .ok-about-badge { padding: 20px; border: 1px solid var(--rule); border-radius: 8px; background: rgba(255,255,255,0.02); }
  .okiru-root .ok-about-badge-val { font-family: var(--serif); font-size: 1.8rem; color: var(--hi); letter-spacing: -0.03em; line-height: 1; }
  .okiru-root .ok-about-badge-label { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 5px; }

  /* ── SECTION 04: OKIRU DIFFERENCE ── */
  .okiru-root .ok-diff-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0; border-top: 1px solid var(--rule); border-left: 1px solid var(--rule); margin-top: 56px; }
  .okiru-root .ok-diff-card { padding: 36px 32px; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); transition: background .3s; }
  .okiru-root .ok-diff-card:hover { background: rgba(99,102,241,0.03); }
  .okiru-root .ok-diff-idx { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(6,182,212,.5); margin-bottom: 14px; }
  .okiru-root .ok-diff-title { font-family: var(--serif); font-size: 1.15rem; color: var(--hi); font-weight: 400; margin-bottom: 10px; }
  .okiru-root .ok-diff-desc { font-size: 13.5px; color: var(--muted); line-height: 1.75; }
  .okiru-root .ok-diff-stats { display: grid; grid-template-columns: repeat(6,1fr); border-top: 1px solid var(--rule); }
  .okiru-root .ok-diff-stat { padding: 28px 24px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-diff-stat:last-child { border-right: none; }
  .okiru-root .ok-diff-stat-n { font-family: var(--serif); font-size: 2rem; color: var(--hi); letter-spacing: -0.04em; line-height: 1; font-style: italic; }
  .okiru-root .ok-diff-stat-l { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 5px; }

  /* ── SECTION 05: TOOLKIT ── */
  .okiru-root .ok-toolkit-hdr { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-bottom: 56px; }
  .okiru-root .ok-toolkit-pillar-wrap { display: grid; grid-template-columns: repeat(3,1fr); gap: 2px; }
  .okiru-root .ok-toolkit-pillar { border: 1px solid var(--rule); padding: 32px 28px; background: rgba(255,255,255,0.015); }
  .okiru-root .ok-toolkit-pillar-letter { font-family: var(--serif); font-style: italic; font-size: 3.5rem; line-height: 1; letter-spacing: -0.05em; margin-bottom: 6px; }
  .okiru-root .ok-toolkit-pillar-name { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .okiru-root .ok-toolkit-pillar-weight { font-family: var(--mono); font-size: 11px; color: rgba(255,255,255,.35); letter-spacing: 0.04em; margin-bottom: 20px; }
  .okiru-root .ok-toolkit-items { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .okiru-root .ok-toolkit-items li { font-size: 12.5px; color: var(--muted); display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; }
  .okiru-root .ok-toolkit-items li::before { content: '—'; color: rgba(6,182,212,.4); flex-shrink: 0; }
  .okiru-root .ok-toolkit-bullet { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: rgba(255,255,255,.75); margin-bottom: 10px; }
  .okiru-root .ok-toolkit-dot { width: 5px; height: 5px; border-radius: 50%; background: #06b6d4; box-shadow: 0 0 8px rgba(6,182,212,.6); flex-shrink: 0; margin-top: 8px; }

  /* ── SECTION 06: ARCHITECTURE ── */
  .okiru-root .ok-arch-layers { display: flex; flex-direction: column; gap: 2px; margin-top: 56px; }
  .okiru-root .ok-arch-layer { display: grid; grid-template-columns: 80px 1fr 1fr; gap: 0; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); transition: background .3s; }
  .okiru-root .ok-arch-layer:hover { background: rgba(99,102,241,0.03); }
  .okiru-root .ok-arch-num-col { display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--rule); padding: 32px 16px; font-family: var(--serif); font-size: 2.2rem; font-style: italic; color: rgba(255,255,255,.15); letter-spacing: -0.04em; }
  .okiru-root .ok-arch-main { padding: 32px 36px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-arch-detail { padding: 32px 36px; }
  .okiru-root .ok-arch-tag { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #22d3ee; margin-bottom: 10px; }
  .okiru-root .ok-arch-title { font-family: var(--serif); font-size: 1.25rem; color: var(--hi); font-weight: 400; margin-bottom: 8px; }
  .okiru-root .ok-arch-desc { font-size: 13.5px; color: var(--muted); line-height: 1.75; }
  .okiru-root .ok-arch-sheets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
  .okiru-root .ok-arch-sheet { font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em; color: rgba(255,255,255,.4); background: rgba(255,255,255,.04); border: 1px solid var(--rule); padding: 3px 8px; border-radius: 3px; }

  /* ── SECTION 07: FRAMEWORKS ── */
  .okiru-root .ok-fw-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 32px; margin-top: 56px; }
  .okiru-root .ok-fw-col-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #22d3ee; margin-bottom: 20px; display: block; padding-bottom: 12px; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-fw-items { list-style: none; }
  .okiru-root .ok-fw-item { padding: 12px 0; border-bottom: 1px solid var(--rule); display: flex; flex-direction: column; gap: 3px; }
  .okiru-root .ok-fw-item:last-child { border-bottom: none; }
  .okiru-root .ok-fw-name { font-size: 13.5px; color: var(--hi); font-weight: 500; }
  .okiru-root .ok-fw-desc { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.04em; }

  /* ── SECTION 08: OUTCOMES ── */
  .okiru-root .ok-outcomes-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 2px; margin-top: 56px; }
  .okiru-root .ok-outcome-card { padding: 44px 40px; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); transition: background .3s; }
  .okiru-root .ok-outcome-card:hover { background: rgba(99,102,241,0.04); }
  .okiru-root .ok-outcome-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #22d3ee; margin-bottom: 14px; display: block; }
  .okiru-root .ok-outcome-title { font-family: var(--serif); font-size: 1.5rem; color: var(--hi); font-weight: 400; letter-spacing: -0.02em; margin-bottom: 14px; }
  .okiru-root .ok-outcome-desc { font-size: 14px; color: var(--muted); line-height: 1.8; }
  .okiru-root .ok-outcome-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--rule); font-family: var(--serif); font-style: italic; font-size: 13.5px; color: rgba(255,255,255,.4); }

  /* ── SECTION 09: ENGAGEMENT ── */
  .okiru-root .ok-eng-hdr { display: grid; grid-template-columns: 1fr 2fr; gap: 80px; margin-bottom: 56px; }
  .okiru-root .ok-eng-phases { display: grid; grid-template-columns: repeat(3,1fr); gap: 2px; }
  .okiru-root .ok-eng-phase { padding: 36px 32px; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); position: relative; transition: background .3s; }
  .okiru-root .ok-eng-phase:hover { background: rgba(99,102,241,0.04); }
  .okiru-root .ok-eng-phase::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--grad-h); opacity: 0.65; }
  .okiru-root .ok-eng-phase-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(6,182,212,.55); margin-bottom: 10px; }
  .okiru-root .ok-eng-phase-name { font-family: var(--serif); font-size: 1.25rem; color: var(--hi); font-weight: 400; margin-bottom: 4px; }
  .okiru-root .ok-eng-phase-sub { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.06em; margin-bottom: 20px; }
  .okiru-root .ok-eng-phase-items { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .okiru-root .ok-eng-phase-items li { font-size: 13px; color: rgba(255,255,255,.7); display: flex; align-items: flex-start; gap: 10px; }
  .okiru-root .ok-eng-phase-items li::before { content: '→'; color: #06b6d4; flex-shrink: 0; font-size: 12px; margin-top: 1px; }

  /* ── SECTION 10: DASHBOARD ── */
  .okiru-root .ok-dash-scores { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 40px; }
  .okiru-root .ok-dash-score-card { border: 1px solid var(--rule); border-radius: 8px; padding: 24px; background: rgba(255,255,255,0.02); }
  .okiru-root .ok-dash-score-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .okiru-root .ok-dash-score-val { font-family: var(--serif); font-size: 2rem; color: var(--hi); letter-spacing: -0.03em; line-height: 1; margin-bottom: 4px; }
  .okiru-root .ok-dash-score-status { font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; }
  .okiru-root .ok-dash-score-gap { font-size: 12px; color: var(--muted); margin-top: 8px; }
  .okiru-root .ok-dash-table-wrap { overflow-x: auto; border: 1px solid var(--rule); border-radius: 8px; }
  .okiru-root .ok-dash-table { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 11px; }
  .okiru-root .ok-dash-table th { padding: 10px 14px; text-align: right; color: rgba(255,255,255,.35); letter-spacing: 0.06em; text-transform: uppercase; background: rgba(255,255,255,.02); border-bottom: 1px solid var(--rule); white-space: nowrap; }
  .okiru-root .ok-dash-table th:first-child { text-align: left; }
  .okiru-root .ok-dash-table td { padding: 10px 14px; text-align: right; color: var(--muted); border-bottom: 1px solid rgba(255,255,255,.04); white-space: nowrap; }
  .okiru-root .ok-dash-table td:first-child { text-align: left; color: rgba(255,255,255,.6); }
  .okiru-root .ok-dash-table tr:last-child td { border-bottom: none; color: var(--hi); font-weight: 500; border-top: 1px solid var(--rule); }
  .okiru-root .ok-dash-note { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.2); letter-spacing: 0.06em; margin-top: 12px; }

  /* ── SECTION 11: NET-ZERO ── */
  .okiru-root .ok-nz-hdr { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-bottom: 48px; }
  .okiru-root .ok-nz-targets { display: grid; grid-template-columns: repeat(4,1fr); gap: 2px; margin-bottom: 40px; }
  .okiru-root .ok-nz-target { border: 1px solid var(--rule); padding: 24px 20px; background: rgba(255,255,255,0.015); }
  .okiru-root .ok-nz-target-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .okiru-root .ok-nz-target-val { font-family: var(--serif); font-size: 1.7rem; color: var(--hi); letter-spacing: -0.03em; font-style: italic; line-height: 1; }
  .okiru-root .ok-nz-milestones { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 40px; }
  .okiru-root .ok-nz-milestone { border: 1px solid var(--rule); border-radius: 8px; padding: 24px 20px; background: rgba(255,255,255,0.02); }
  .okiru-root .ok-nz-milestone-year { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; color: #22d3ee; margin-bottom: 6px; }
  .okiru-root .ok-nz-milestone-name { font-family: var(--serif); font-size: 1.1rem; color: var(--hi); font-weight: 400; margin-bottom: 8px; }
  .okiru-root .ok-nz-milestone-desc { font-size: 12.5px; color: var(--muted); line-height: 1.65; }
  .okiru-root .ok-nz-levers { display: flex; flex-wrap: wrap; gap: 10px; }
  .okiru-root .ok-nz-lever { font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; color: rgba(6,182,212,.9); background: rgba(6,182,212,.07); border: 1px solid rgba(6,182,212,.2); padding: 6px 14px; border-radius: 4px; }

  /* ── SECTION 12: OKIRU PRO ── */
  .okiru-root .ok-pro-grid { display: grid; grid-template-columns: 5fr 7fr; gap: 0; border: 1px solid var(--rule); }
  .okiru-root .ok-pro-l { padding: 56px 52px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-pro-r { padding: 56px 52px; }
  .okiru-root .ok-pro-step { display: grid; grid-template-columns: 48px 1fr; padding: 22px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-pro-step:last-child { border-bottom: none; }
  .okiru-root .ok-pro-step-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(6,182,212,.5); padding-top: 3px; }
  .okiru-root .ok-pro-step-title { font-family: var(--serif); font-size: 1.05rem; color: var(--hi); font-weight: 400; margin-bottom: 5px; }
  .okiru-root .ok-pro-step-desc { font-size: 13px; color: var(--muted); line-height: 1.7; }
  .okiru-root .ok-hub-sector { display: grid; grid-template-columns: 80px 1fr 1fr; align-items: center; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .okiru-root .ok-hub-sector:last-child { border-bottom: none; }
  .okiru-root .ok-hub-sector-code { font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; }
  .okiru-root .ok-hub-sector-name { font-size: 13px; color: rgba(255,255,255,.65); }
  .okiru-root .ok-hub-sector-meta { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.25); letter-spacing: 0.04em; text-align: right; }

  /* ── SECTION 13: VS MARKET ── */
  .okiru-root .ok-vs-edges { display: flex; flex-direction: column; gap: 2px; margin-bottom: 56px; }
  .okiru-root .ok-vs-edge { display: grid; grid-template-columns: 80px 1fr; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); transition: background .3s; }
  .okiru-root .ok-vs-edge:hover { background: rgba(99,102,241,.04); }
  .okiru-root .ok-vs-edge-num { display: flex; align-items: flex-start; justify-content: center; padding: 28px 16px; border-right: 1px solid var(--rule); font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(6,182,212,.5); }
  .okiru-root .ok-vs-edge-body { padding: 28px 36px; }
  .okiru-root .ok-vs-edge-title { font-family: var(--serif); font-size: 1.15rem; color: var(--hi); font-weight: 400; margin-bottom: 8px; }
  .okiru-root .ok-vs-edge-desc { font-size: 13.5px; color: var(--muted); line-height: 1.75; }
  .okiru-root .ok-vs-table-wrap { overflow-x: auto; border: 1px solid var(--rule); border-radius: 8px; }
  .okiru-root .ok-vs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .okiru-root .ok-vs-table th { padding: 12px 16px; text-align: center; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); background: rgba(255,255,255,.02); border-bottom: 1px solid var(--rule); border-right: 1px solid var(--rule); white-space: nowrap; }
  .okiru-root .ok-vs-table th:first-child { text-align: left; }
  .okiru-root .ok-vs-table th:last-child { border-right: none; }
  .okiru-root .ok-vs-table td { padding: 12px 16px; text-align: center; color: var(--muted); border-bottom: 1px solid rgba(255,255,255,.04); border-right: 1px solid rgba(255,255,255,.04); font-size: 12.5px; }
  .okiru-root .ok-vs-table td:first-child { text-align: left; color: rgba(255,255,255,.75); }
  .okiru-root .ok-vs-table td:last-child { border-right: none; }
  .okiru-root .ok-vs-table tr:last-child td { border-bottom: none; }
  .okiru-root .ok-vs-full { color: #34d399; font-weight: 600; }
  .okiru-root .ok-vs-basic { color: #fbbf24; }
  .okiru-root .ok-vs-none { color: rgba(255,255,255,.2); }
  .okiru-root .ok-vs-table-note { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.2); letter-spacing: 0.06em; margin-top: 12px; }

  /* ── SECTION 14: SECTORS ── */
  .okiru-root .ok-sectors-list { display: grid; grid-template-columns: repeat(4,1fr); gap: 2px; margin-top: 48px; }
  .okiru-root .ok-sector-item { padding: 28px 24px; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); transition: background .3s; }
  .okiru-root .ok-sector-item:hover { background: rgba(99,102,241,.04); }
  .okiru-root .ok-sector-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(6,182,212,.45); margin-bottom: 10px; }
  .okiru-root .ok-sector-name { font-family: var(--serif); font-size: 1.1rem; color: var(--hi); font-weight: 400; margin-bottom: 6px; }
  .okiru-root .ok-sector-badge-sm { font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; color: #06b6d4; background: rgba(6,182,212,.07); border: 1px solid rgba(6,182,212,.2); padding: 2px 8px; border-radius: 3px; display: inline-block; }

  /* ── SECTION 15: BOOK A DEMO ── */
  .okiru-root .ok-demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 56px; border: 1px solid var(--rule); }
  .okiru-root .ok-demo-l { padding: 56px 52px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-demo-r { padding: 56px 52px; background: rgba(255,255,255,0.015); }
  .okiru-root .ok-demo-contact { display: flex; flex-direction: column; gap: 20px; margin-top: 36px; }
  .okiru-root .ok-demo-contact-item { display: flex; flex-direction: column; gap: 4px; }
  .okiru-root .ok-demo-contact-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,.3); }
  .okiru-root .ok-demo-contact-val { font-size: 14px; color: rgba(255,255,255,.75); }
  .okiru-root .ok-demo-contact-val a { color: var(--pur-l); text-decoration: none; }
  .okiru-root .ok-demo-contact-val a:hover { color: var(--hi); }
  .okiru-root .ok-demo-agenda-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
  .okiru-root .ok-demo-agenda-item { display: grid; grid-template-columns: 100px 1fr; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .okiru-root .ok-demo-agenda-item:last-child { border-bottom: none; }
  .okiru-root .ok-demo-agenda-time { font-family: var(--mono); font-size: 11px; color: rgba(255,255,255,.3); letter-spacing: 0.04em; padding-top: 1px; }
  .okiru-root .ok-demo-agenda-desc { font-size: 13.5px; color: rgba(255,255,255,.7); }

  /* ── SCORECARD WIDGET ── */
  .okiru-root .ok-sc-pillar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .okiru-root .ok-sc-pillar-name { font-family: var(--sans); font-size: 11px; color: rgba(255,255,255,.55); letter-spacing: -0.01em; }
  .okiru-root .ok-sc-pillar-val  { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.28); letter-spacing: .04em; }
  .okiru-root .ok-sc-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,.06); overflow: hidden; margin-bottom: 2px; }
  .okiru-root .ok-sc-fill  { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(.22,1,.36,1); position: relative; overflow: hidden; }

  /* ── FOOTER ── */
  .okiru-root footer { padding: 40px 0; border-top: 1px solid var(--rule); }
  .okiru-root .ok-foot-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; margin-bottom: 40px; }
  .okiru-root .ok-foot-col-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,.3); margin-bottom: 14px; }
  .okiru-root .ok-foot-col-items { display: flex; flex-direction: column; gap: 6px; }
  .okiru-root .ok-foot-col-item { font-size: 13px; color: rgba(255,255,255,.5); line-height: 1.5; }
  .okiru-root .ok-foot-col-item a { color: rgba(255,255,255,.5); text-decoration: none; transition: color .2s; }
  .okiru-root .ok-foot-col-item a:hover { color: var(--hi); }
  .okiru-root .ok-foot-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 24px; border-top: 1px solid var(--rule); }
  .okiru-root .ok-foot-wm { font-family: var(--serif); font-style: italic; font-size: 15px; color: var(--muted); display: inline-flex; align-items: center; gap: 10px; }
  .okiru-root .ok-foot-c { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.15); letter-spacing: .06em; }
  .okiru-root .ok-foot-links { display: flex; align-items: center; gap: 14px; }
  .okiru-root .ok-foot-link { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.35); letter-spacing: .08em; text-decoration: none; text-transform: uppercase; transition: color .2s ease; background: none; border: none; cursor: pointer; }
  .okiru-root .ok-foot-link:hover { color: #22d3ee; }

  /* ── REVEAL ── */
  .okiru-root .ok-reveal { opacity: 0; transform: translateY(14px); transition: opacity .6s ease, transform .6s ease; }
  .okiru-root .ok-reveal.ok-in { opacity: 1; transform: none; }
  .okiru-root .ok-d1 { transition-delay: .1s; }
  .okiru-root .ok-d2 { transition-delay: .2s; }
  .okiru-root .ok-d3 { transition-delay: .3s; }

  .okiru-root .ok-anim-1 { opacity: 0; animation: okiru-slideUp .55s ease forwards .05s; }
  .okiru-root .ok-anim-2 { opacity: 0; animation: okiru-slideUp .7s ease forwards .18s; }
  .okiru-root .ok-anim-3 { opacity: 0; animation: okiru-slideUp .65s ease forwards .32s; }
  .okiru-root .ok-anim-4 { opacity: 0; animation: okiru-slideUp .6s ease forwards .46s; }

  /* ── REDUCED MOTION ── */
  @media (prefers-reduced-motion: reduce) {
    .okiru-root .ok-nav,
    .okiru-root .ok-nav-inner > *,
    .okiru-root .ok-brand-mark,
    .okiru-root .ok-nav::before,
    .okiru-root .ok-nav-demo-btn:hover::before,
    .okiru-root .ok-mobile-menu.ok-menu-open { animation: none; opacity: 1; }
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 1100px) {
    .okiru-root .ok-nav-link { font-size: 13px; padding: 6px 10px; }
  }
  @media (max-width: 1024px) {
    .okiru-root .ok-diff-grid { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-diff-stats { grid-template-columns: repeat(3,1fr); }
    .okiru-root .ok-arch-layer { grid-template-columns: 60px 1fr; }
    .okiru-root .ok-arch-detail { display: none; }
    .okiru-root .ok-fw-grid { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-nz-targets { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-nz-milestones { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-sectors-list { grid-template-columns: repeat(3,1fr); }
    .okiru-root .ok-foot-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 900px) {
    .okiru-root .ok-nav-center { display: none; }
    .okiru-root .ok-challenge-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-about-grid { grid-template-columns: 1fr; gap: 48px; }
    .okiru-root .ok-toolkit-hdr { grid-template-columns: 1fr; gap: 40px; }
    .okiru-root .ok-toolkit-pillar-wrap { grid-template-columns: 1fr; }
    .okiru-root .ok-eng-hdr { grid-template-columns: 1fr; gap: 32px; }
    .okiru-root .ok-eng-phases { grid-template-columns: 1fr; }
    .okiru-root .ok-dash-scores { grid-template-columns: 1fr; }
    .okiru-root .ok-outcomes-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-nz-hdr { grid-template-columns: 1fr; gap: 32px; }
    .okiru-root .ok-pro-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-pro-l { border-right: none; border-bottom: 1px solid var(--rule); }
    .okiru-root .ok-demo-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-demo-l { border-right: none; border-bottom: 1px solid var(--rule); }
    .okiru-root .ok-sectors-list { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-form-row { grid-template-columns: 1fr; }
  }
  @media (max-width: 760px) {
    .okiru-root .ok-nav-inner { padding: 0 20px; }
    .okiru-root .ok-nav-signin { display: none; }
    .okiru-root .ok-nav-demo-btn { display: none; }
    .okiru-root .ok-hamburger { display: block; }
    .okiru-root .ok-w { padding: 0 20px; }
    .okiru-root .ok-hero { padding: 120px 0 48px; }
    .okiru-root .ok-h1 { font-size: clamp(2.4rem, 9vw, 3.2rem); }
    .okiru-root .ok-section { padding: 64px 0; }
    .okiru-root .ok-services { flex-direction: column; }
    .okiru-root .ok-service { border-right: none; border-bottom: 1px solid var(--rule); }
    .okiru-root .ok-service:last-child { border-bottom: none; }
    .okiru-root .ok-diff-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-diff-stats { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-fw-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-sectors-list { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-foot-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-modal { max-width: calc(100vw - 32px); }
    .okiru-root .ok-modal-head { padding: 24px 24px 0; }
    .okiru-root .ok-modal-body { padding: 20px 24px 24px; }
  }
  @media (max-width: 480px) {
    .okiru-root .ok-h1 { font-size: 2.2rem; }
    .okiru-root .ok-hero-btns { flex-direction: column; align-items: stretch; }
    .okiru-root .ok-btn-cta, .okiru-root .ok-btn-sec { width: 100%; justify-content: center; }
    .okiru-root .ok-nz-targets { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-nz-milestones { grid-template-columns: 1fr; }
    .okiru-root .ok-sectors-list { grid-template-columns: 1fr; }
  }
`;

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const SERVICES = [
  { name: "B-BBEE", meta: "Certified experts" },
  { name: "ESG", meta: "Strategy & reporting" },
  { name: "AI", meta: "Integration & training" },
  { name: "EE", meta: "Workforce equity" },
  { name: "WSP", meta: "Skills & reporting" },
];

/* ─────────────────────────────────────────────
   SMALL ICONS
───────────────────────────────────────────── */
const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
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
const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const FullIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ─────────────────────────────────────────────
   HOOKS
───────────────────────────────────────────── */
function useReveal(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

/* ─────────────────────────────────────────────
   REVEAL WRAPPER
───────────────────────────────────────────── */
function Reveal({ children, delay = "", className = "" }: { children: React.ReactNode; delay?: string; className?: string }) {
  const [ref, visible] = useReveal();
  return <div ref={ref} className={`ok-reveal ${visible ? "ok-in" : ""} ${delay} ${className}`}>{children}</div>;
}

/* ─────────────────────────────────────────────
   DEMO MODAL
───────────────────────────────────────────── */
interface DemoFormState {
  name: string; company: string; email: string; phone: string; message: string;
}
interface DemoFormErrors {
  name?: string; company?: string; email?: string;
}

function DemoModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<DemoFormState>({ name: "", company: "", email: "", phone: "", message: "" });
  const [errors, setErrors] = useState<DemoFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k: keyof DemoFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (errors[k as keyof DemoFormErrors]) setErrors(er => ({ ...er, [k]: undefined }));
  };

  const validate = () => {
    const errs: DemoFormErrors = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.company.trim()) errs.company = "Company is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Enter a valid email";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="ok-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ok-modal" role="dialog" aria-modal="true" aria-label="Book a demo">
        {submitted ? (
          <div className="ok-modal-success">
            <div className="ok-success-icon"><CheckIcon /></div>
            <div className="ok-success-title">Request received.</div>
            <p className="ok-success-sub">
              Thank you, <strong style={{ color:"var(--hi)" }}>{form.name}</strong>. We'll be in touch within one business day to confirm your 45-minute session.
            </p>
            <button className="ok-form-submit" style={{ marginTop:28, maxWidth:200, margin:"28px auto 0" }} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="ok-modal-head">
              <div>
                <div className="ok-modal-title">Book a 45-min demo</div>
                <p className="ok-modal-sub">A working session — not a sales pitch. We'll walk through the live Okiru Toolkit mapped to your reporting cycle.</p>
              </div>
              <button className="ok-modal-close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            <div className="ok-modal-body">
              <form className="ok-form" onSubmit={handleSubmit} noValidate>
                <div className="ok-form-row">
                  <div className="ok-field">
                    <label className="ok-label">Name<span className="ok-req">*</span></label>
                    <input className={`ok-input${errors.name ? " ok-err" : ""}`} value={form.name} onChange={set("name")} placeholder="Thabo Nkosi" autoFocus />
                    {errors.name && <span className="ok-field-err">{errors.name}</span>}
                  </div>
                  <div className="ok-field">
                    <label className="ok-label">Company<span className="ok-req">*</span></label>
                    <input className={`ok-input${errors.company ? " ok-err" : ""}`} value={form.company} onChange={set("company")} placeholder="Acme Corp" />
                    {errors.company && <span className="ok-field-err">{errors.company}</span>}
                  </div>
                </div>
                <div className="ok-form-row">
                  <div className="ok-field">
                    <label className="ok-label">Email<span className="ok-req">*</span></label>
                    <input type="email" className={`ok-input${errors.email ? " ok-err" : ""}`} value={form.email} onChange={set("email")} placeholder="you@company.co.za" />
                    {errors.email && <span className="ok-field-err">{errors.email}</span>}
                  </div>
                  <div className="ok-field">
                    <label className="ok-label">Phone <span style={{ opacity:.5, fontSize:9 }}>(optional)</span></label>
                    <input className="ok-input" value={form.phone} onChange={set("phone")} placeholder="+27 78 000 0000" />
                  </div>
                </div>
                <div className="ok-field">
                  <label className="ok-label">Anything specific you'd like to cover? <span style={{ opacity:.5, fontSize:9 }}>(optional)</span></label>
                  <textarea className="ok-textarea" value={form.message} onChange={set("message")} placeholder="e.g. We need to submit our B-BBEE certificate in Q1 and want to understand our Scope 2 exposure…" />
                </div>
                <button type="submit" className="ok-form-submit" disabled={loading}>
                  {loading ? "Sending…" : <><span>Send request</span><span className="arr"><ArrowRight size={15} /></span></>}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function OkiruLanding({ onNavigateAuth, onNavigateRegister, onNavigateProduct }: { onNavigateAuth: () => void; onNavigateRegister?: () => void; onNavigateCertificates?: () => void; onNavigateProduct?: (slug: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const openDemo = () => { setDemoOpen(true); setMenuOpen(false); };
  // Wire the marketing "Get started" CTA to the register flow (falls back to the
  // shared auth screen, where "Create account" is still reachable, if the host
  // didn't pass a register handler).
  const goRegister = () => { setMenuOpen(false); (onNavigateRegister ?? onNavigateAuth)(); };

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const id = "okiru-styles";
    if (!document.getElementById(id)) {
      const s = document.createElement("style"); s.id = id; s.textContent = GLOBAL_CSS; document.head.appendChild(s);
    }
    return () => { const el = document.getElementById(id); if (el) el.remove(); };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = (menuOpen || demoOpen) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen, demoOpen]);

  return (
    <div className="okiru-root">
      <div className="okiru-grain" aria-hidden />

      {/* ── DEMO MODAL ── */}
      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}

      {/* ── NAV ── */}
      <nav className={`ok-nav ${scrolled ? "ok-nav-scrolled" : ""}`}>
        <div className="ok-nav-inner">
          <a href="/" className="ok-brand" aria-label="Okiru home">
            <img src={okiruLogo} alt="" className="ok-brand-mark" />
            <span className="ok-wordmark"><strong>Okiru</strong></span>
          </a>

          <div className="ok-nav-center">
            <button className="ok-nav-link" onClick={() => scrollTo("sec-about")}>About</button>
            {PRODUCT_TABS.map(t => (
              <button key={t.slug} className="ok-nav-link" onClick={() => onNavigateProduct?.(t.slug)}>
                {t.label}
              </button>
            ))}
            <div className="ok-nav-div" />
            <button className="ok-nav-link" onClick={() => scrollTo("sec-contact")}>Contact</button>
          </div>

          <div className="ok-nav-right">
            <button className="ok-nav-signin" onClick={onNavigateAuth}>Sign in</button>
            <button className="ok-nav-demo-btn" onClick={openDemo}>
              Book a demo <span className="arr"><ArrowRight size={13} /></span>
            </button>
            <button className="ok-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── MOBILE MENU ── */}
      <div className={`ok-mobile-menu ${menuOpen ? "ok-menu-open" : ""}`}>
        <button className="ok-mobile-link" onClick={() => scrollTo("sec-about")}>About</button>
        {PRODUCT_TABS.map(t => (
          <button key={t.slug} className="ok-mobile-link" onClick={() => { setMenuOpen(false); onNavigateProduct?.(t.slug); }}>{t.label}</button>
        ))}
        <button className="ok-mobile-link" onClick={() => scrollTo("sec-contact")}>Contact</button>
        <button className="ok-mobile-link" onClick={() => { setMenuOpen(false); onNavigateAuth(); }}>Sign in</button>
        <button className="ok-mobile-cta" onClick={openDemo}>Book a 45-min demo →</button>
      </div>

      <main>
        {/* ── 01: HERO ── */}
        <section className="ok-hero">
          <div className="ok-hero-bg" aria-hidden>
            <div className="ok-hero-beam" /><div className="ok-hero-beam-2" />
            <div className="ok-hero-glow" /><div className="ok-hero-glow-2" />
          </div>
          <div className="ok-w" style={{ position:"relative", zIndex:1, width:"100%" }}>
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
                Get started <span className="arr"><ArrowRight size={14} /></span>
              </button>
              <button className="ok-btn-sec" onClick={openDemo}>Book a 45-min demo</button>
              <button className="ok-btn-sec" onClick={() => scrollTo("sec-products")}>Explore the toolkits</button>
            </div>
          </div>
        </section>

        {/* ── SERVICE STRIP ── */}
        <div className="ok-services">
          {SERVICES.map(s => (
            <div key={s.name} className="ok-service">
              <div className="ok-service-name">{s.name}</div>
              <div className="ok-service-meta">{s.meta}</div>
            </div>
          ))}
        </div>

        {/* ── QUOTE ── */}
        <section className="ok-quote">
          <div className="ok-w">
            <Reveal className="ok-quote-inner">
              <p className="ok-quote-text">
                "Every credible ESG strategy ends at Net Zero.{" "}
                <em>Most begin without the data to get there.</em>"
              </p>
            </Reveal>
          </div>
          <div className="ok-scroll-ind" aria-hidden>
            <span>Scroll</span>
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="1" x2="6" y2="13" /><polyline points="2 9 6 13 10 9" />
            </svg>
          </div>
        </section>

        {/* ── 02: THE CHALLENGE ── */}
        <section className="ok-section" id="sec-challenge">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">02</span>
              <h2 className="ok-h2" style={{ marginBottom:12 }}>The Challenge</h2>
              <p className="ok-h3" style={{ marginBottom:8 }}>Why most organisations can't get to Net Zero — and what Okiru solves.</p>
              <p className="ok-lead-l">Three structural gaps stand between South African organisations and credible, audit-grade transformation reporting.</p>
            </Reveal>
            <div className="ok-challenge-grid">
              {[
                { label:"The Measurement Gap", title:"Scope 3 remains uncaptured", stat:"70–90%", statLabel:"of emissions sit in the supply chain", desc:"Most organisations measure Scope 1 confidently, Scope 2 with effort, and Scope 3 with estimates. The majority of supply-chain emissions are the hardest to measure — and the largest opportunity to reduce." },
                { label:"The Reporting Gap", title:"Frameworks are tightening", stat:"IFRS S2", statLabel:"CDP & SBTi are raising the bar", desc:"IFRS S1 and S2 are mandatory in many jurisdictions. CDP penalises spend-based methodologies. SBTi requires activity-based targets. The bar for credible reporting rises every cycle." },
                { label:"The Execution Gap", title:"Data lives in the wrong places", stat:"5 silos", statLabel:"→ one annual report", desc:"Energy is in finance. Waste is in operations. Workforce is in HR. CSI is in marketing. Until these sources speak to each other, the ESG report is reconstructed from scratch every year." },
              ].map((c, i) => (
                <Reveal key={c.label} delay={i > 0 ? `ok-d${i}` : ""}>
                  <div className="ok-challenge-card">
                    <span className="ok-challenge-label">{c.label}</span>
                    <div className="ok-challenge-title">{c.title}</div>
                    <div className="ok-challenge-stat">{c.stat}</div>
                    <div className="ok-challenge-stat-label">{c.statLabel}</div>
                    <div className="ok-challenge-desc">{c.desc}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 03: WHO WE ARE ── */}
        <section className="ok-section" id="sec-about">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">03</span>
              <h2 className="ok-h2">Who We Are</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>A South African transformation advisory. Methodology specialists. Disclosure-fluent.</p>
            </Reveal>
            <div className="ok-about-grid">
              <div>
                <Reveal>
                  <h3 className="ok-h3">About Okiru Consulting</h3>
                  <p className="ok-lead" style={{ marginTop:14 }}>Founded in 2023, Okiru Consulting helps organisations turn ESG, B-BBEE, and compliance obligations into measurable, board-ready performance. Headquartered in Braamfontein, Johannesburg, our practice marries technology and human expertise to remove the friction between capturing data and disclosing it.</p>
                  <p style={{ marginTop:16, fontSize:14, color:"var(--muted)", lineHeight:1.7 }}><strong style={{ color:"rgba(255,255,255,.7)", fontStyle:"normal" }}>Our Mission</strong><br />To make transformation measurable, defensible and permanent for every South African organisation we serve.</p>
                </Reveal>
                <div className="ok-about-badges" style={{ marginTop:28 }}>
                  {[["Accuracy","Audit-grade outputs"],["Independence","Verifier-defensible"],["Transformation","Methodology-led"],["Innovation","60%+ time saved"]].map(([val, label]) => (
                    <Reveal key={val}>
                      <div className="ok-about-badge">
                        <div className="ok-about-badge-val">{val}</div>
                        <div className="ok-about-badge-label">{label}</div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ display:"flex", flexDirection:"column" }}>
                  {[
                    { num:"01", name:"ESG Advisory", sub:"IFRS S1/S2 · GRI · TCFD · CDP · SBTi", desc:"Net-Zero strategy, GHG measurement, and board-ready sustainability disclosure for JSE-listed and private companies." },
                    { num:"02", name:"B-BBEE & Compliance", sub:"Generic & sector codes · Verification", desc:"Sector code strategy, EE Act compliance, Skills Development WSP/ATR, Employment Equity plans, and ownership advisory." },
                    { num:"03", name:"AI & Digital Tools", sub:"Zoho & Microsoft 365 automation", desc:"AI-enabled compliance workflows and WSP integration for intelligent, scalable transformation reporting that cuts reporting time by 60%+." },
                  ].map((p, i) => (
                    <Reveal key={p.num} delay={i > 0 ? `ok-d${i}` : ""}>
                      <div className="ok-about-pillar">
                        <div className="ok-about-pillar-num">{p.num}</div>
                        <div>
                          <div className="ok-about-pillar-name">{p.name}</div>
                          <div className="ok-about-pillar-sub">{p.sub}</div>
                          <div className="ok-about-pillar-desc">{p.desc}</div>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 04: THE OKIRU DIFFERENCE ── */}
        <section className="ok-section">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">04</span>
              <h2 className="ok-h2">The Okiru Difference</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Six reasons leading South African organisations choose our Transformation Toolkit.</p>
            </Reveal>
          </div>
          <div className="ok-diff-grid">
            {[
              { idx:"01", title:"One integrated toolkit", desc:"ESG, B-BBEE, EE, and Skills Dev in one workbook. No re-keying, no reconciliation gaps, no separate platforms." },
              { idx:"02", title:"Activity-based accuracy", desc:"DEFRA 2024, Eskom NERSA, SBTi CNZS 2.0. CDP-defensible, audit-grade outputs aligned to every major framework." },
              { idx:"03", title:"Deep local expertise", desc:"Built for SA regulation: King V, B-BBEE Codes, EE Act, POPIA, JSE ESG Guidance, and sector-specific requirements." },
              { idx:"04", title:"AI-powered innovation", desc:"AI-enabled workflows cut ESG reporting time by 60%+ and eliminate manual data consolidation risk." },
              { idx:"05", title:"Measurable business impact", desc:"Improved B-BBEE scores, reduced verification risk, stronger investor ESG ratings, and compliance-led growth." },
              { idx:"06", title:"Built-in capability transfer", desc:"Your team leaves every engagement knowing how to run the toolkit independently. We build capability, not dependency." },
            ].map((d, i) => (
              <Reveal key={d.idx} className="ok-diff-card" delay={i % 3 > 0 ? `ok-d${i % 3}` : ""}>
                <div className="ok-diff-idx">{d.idx}</div>
                <div className="ok-diff-title">{d.title}</div>
                <div className="ok-diff-desc">{d.desc}</div>
              </Reveal>
            ))}
          </div>
          <div className="ok-diff-stats">
            {[["29","Integrated sheets"],["1,583","Live formulas"],["12","Frameworks covered"],["120","Glossary entries"],["0","Reconciliation gaps"],["60%+","Time saved via AI"]].map(([n, l], i) => (
              <Reveal key={l} className="ok-diff-stat" delay={i > 0 ? `ok-d${Math.min(i,3)}` : ""}>
                <div className="ok-diff-stat-n">{n}</div>
                <div className="ok-diff-stat-l">{l}</div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── 05: OUR PRODUCTS ── */}
        <section className="ok-section" id="sec-products">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">05</span>
              <h2 className="ok-h2">Our Products</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Three focused toolkits, one measurement methodology. Each has its own dedicated walkthrough — pick a starting point.</p>
            </Reveal>
            <div className="ok-challenge-grid" style={{ marginTop:56 }}>
              {PRODUCTS.map((p, i) => (
                <Reveal key={p.slug} delay={i > 0 ? `ok-d${Math.min(i,3)}` : ""}>
                  <button
                    className="ok-challenge-card"
                    onClick={() => onNavigateProduct?.(p.slug)}
                    style={{ textAlign:"left", width:"100%", cursor:"pointer", font:"inherit", color:"inherit", display:"block" }}
                  >
                    <span className="ok-challenge-label">{p.heroTag}</span>
                    <div className="ok-challenge-title">{p.navLabel}</div>
                    <div className="ok-challenge-desc">{p.heroSub}</div>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:22, fontFamily:"var(--mono)", fontSize:11, letterSpacing:".08em", textTransform:"uppercase", color:"var(--pur-l)" }}>
                      Explore <ArrowRight size={12} />
                    </span>
                  </button>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 06: FRAMEWORKS ── */}
        <section className="ok-section" id="sec-frameworks">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">06</span>
              <h2 className="ok-h2">Frameworks &amp; Benchmarks</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Globally recognised standards. Publicly defensible authority on every factor.</p>
            </Reveal>
            <div className="ok-fw-grid">
              {[
                { title:"Global Disclosure Frameworks", items:[["GHG Protocol","Scope 1 / 2 / 3 inventory"],["IFRS S1 + S2","ISSB sustainability + climate"],["TCFD","6-family climate risk taxonomy"],["CDP","Climate + water disclosure"],["SBTi CNZS 2.0","Net-zero pathway alignment"],["ISO 14083","Trip-level transport emissions"],["GRI","Topical standards"]] },
                { title:"South African Compliance", items:[["King V","Apply-or-Explain governance"],["B-BBEE Codes","All five pillars + sector forks"],["ISO 14001","Environmental management"],["EE / Skills Dev","EEA2/EEA4 · WSP/ATR"],["NEMWA","Waste classification & reporting"],["POPIA","Data protection compliance"]] },
                { title:"Emission Factors & Standards", items:[["DEFRA 2024","GHG conversion factors — Scope 1 + 3"],["Eskom NERSA 2024","Scope 2 location-based, SA grid"],["GLEC Framework","80 gCO₂e/t·km road freight norm"],["SBTi CNZS 2.0","Net-zero pathway alignment"],["IFRS S2","ISSB climate disclosure structure"],["King V","170-point Apply-or-Explain scorecard"]] },
              ].map((col, ci) => (
                <div key={col.title}>
                  <Reveal delay={ci > 0 ? `ok-d${ci}` : ""}>
                    <span className="ok-fw-col-title">{col.title}</span>
                    <ul className="ok-fw-items">
                      {col.items.map(([n,d]) => (
                        <li key={n} className="ok-fw-item"><span className="ok-fw-name">{n}</span><span className="ok-fw-desc">{d}</span></li>
                      ))}
                    </ul>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 07: OUTCOMES ── */}
        <section className="ok-section">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">07</span>
              <h2 className="ok-h2">Operational Outcomes</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Four shifts that change how your ESG function works — permanently.</p>
            </Reveal>
          </div>
          <div className="ok-outcomes-grid">
            {[
              { label:"Governance", title:"Single source of truth", desc:"One workbook. Every framework. Every number traces to a documented source row through a documented formula chain. The audit committee, auditor, JSE, and integrated report all see the same numbers calculated the same way." },
              { label:"Efficiency", title:"Clean data flows", desc:"Inputs captured once flow through to every framework simultaneously. No re-keying fleet litres into the GHG inventory, ISO 14083 register, Carbon Tax submission and CDP response separately." },
              { label:"Insight", title:"Embedded analytics", desc:"Year-on-year variance built in. Intensity ratios calculated automatically. Materiality flagged dynamically. The Stance toggle lets you stress-test performance under Lean, Standard and Strict scoring assumptions." },
              { label:"Reporting", title:"Board-ready disclosure", desc:"Pre-formatted disclosure blocks aligned to IFRS S1/S2, GRI, CDP and B-BBEE structures. Lift directly into your integrated annual report. Methodology lives inside your finance function — not on a consultant's hard drive.", footer:"Not a portal. Not a certificate. A measurement system with people behind it." },
            ].map((o, i) => (
              <Reveal key={o.label} delay={i % 2 === 1 ? "ok-d1" : ""}>
                <div className="ok-outcome-card">
                  <span className="ok-outcome-label">{o.label}</span>
                  <div className="ok-outcome-title">{o.title}</div>
                  <div className="ok-outcome-desc">{o.desc}</div>
                  {o.footer && <div className="ok-outcome-footer">{o.footer}</div>}
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── 08: ENGAGEMENT MODEL ── */}
        <section className="ok-section">
          <div className="ok-w">
            <div className="ok-eng-hdr">
              <Reveal>
                <span className="ok-sec-num">08</span>
                <h2 className="ok-h2">Engagement Model</h2>
              </Reveal>
              <Reveal delay="ok-d1">
                <p className="ok-lead">From scoping session to live reporting cadence in three structured phases.</p>
                <p style={{ marginTop:16, fontSize:13.5, color:"var(--muted)", lineHeight:1.75, fontStyle:"italic" }}>Your team owns the data and the strategy. Okiru owns the methodology, data loading, and framework refresh as standards evolve.</p>
              </Reveal>
            </div>
            <div className="ok-eng-phases">
              {[
                { num:"01", name:"Scoping & Configuration", sub:"2 weeks", items:["Sector-configured workbook","Data source map","Methodology sign-off"] },
                { num:"02", name:"Data Migration", sub:"3 weeks", items:["Reconciled historical data","Validation at zero errors","First dashboard refresh"] },
                { num:"03", name:"Live Reporting Cadence", sub:"Ongoing", items:["Monthly refresh cycle","Quarterly board pack","Annual report support"] },
              ].map((p, i) => (
                <Reveal key={p.num} delay={i > 0 ? `ok-d${i}` : ""}>
                  <div className="ok-eng-phase">
                    <div className="ok-eng-phase-num">Phase {p.num}</div>
                    <div className="ok-eng-phase-name">{p.name}</div>
                    <div className="ok-eng-phase-sub">{p.sub}</div>
                    <ul className="ok-eng-phase-items">
                      {p.items.map(item => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 09: OKIRU VS MARKET ── */}
        <section className="ok-section">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">09</span>
              <h2 className="ok-h2">Okiru vs the Market</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>We don't compete on cheaper software. We compete on what we own.</p>
            </Reveal>
            <div className="ok-vs-edges" style={{ marginTop:40 }}>
              {[
                { num:"Edge 01", title:"Only SA firm integrating B-BBEE + ESG in one toolkit", desc:"BEE platforms score pillars. Okiru links your B-BBEE score to your GHG inventory, EE plan, and IFRS S2 disclosure — one source of truth for every framework simultaneously." },
                { num:"Edge 02", title:"Methodology lives inside your business — not on our server", desc:"Every formula, factor, and threshold is documented in your own workbook. When the engagement ends, your finance team owns the methodology. No platform lock-in. No annual licence." },
                { num:"Edge 03", title:"Consultant accountability, not just software access", desc:"BEE123 gives you a tool. Updapt tracks your ESG data. Okiru builds the strategy, loads the data, validates every number, and stands behind the output when your verifier asks questions." },
              ].map((e, i) => (
                <Reveal key={e.num} delay={i > 0 ? `ok-d${Math.min(i,2)}` : ""}>
                  <div className="ok-vs-edge">
                    <div className="ok-vs-edge-num">{e.num}</div>
                    <div className="ok-vs-edge-body">
                      <div className="ok-vs-edge-title">{e.title}</div>
                      <div className="ok-vs-edge-desc">{e.desc}</div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <p className="ok-eyebrow" style={{ marginBottom:16, marginTop:40 }}>Capability Matrix</p>
              <div className="ok-vs-table-wrap">
                <table className="ok-vs-table">
                  <thead>
                    <tr>
                      <th>Capability</th><th>Okiru B-BBEE + ESG</th><th>BEE 123</th><th>Updapt ESG Tech</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["All 5 B-BBEE pillars scored","Full","Full","Full"],
                      ["AI toolkit upload → instant scorecard","Full","—","—"],
                      ["GHG Scope 1, 2 & 3 measurement","Full","—","—"],
                      ["IFRS S1/S2, TCFD, CDP, GRI, SBTi","Full","—","—"],
                      ["Net-Zero Roadmap (SBTi CNZS 2.0)","Full","—","—"],
                      ["Employment Equity (EEA2/EEA4)","Full","Basic","—"],
                      ["Dedicated consultant relationship","Full","—","Full"],
                      ["Board-ready disclosure outputs","Full","B-BBEE only","Cert. only"],
                      ["Annual framework refresh","Full","B-BBEE codes","—"],
                    ].map(([cap, ...vals]) => (
                      <tr key={cap}>
                        <td>{cap}</td>
                        {vals.map((v, i) => (
                          <td key={i} className={v==="Full"?"ok-vs-full":v==="Basic"||v.includes("only")||v.includes("codes")?"ok-vs-basic":"ok-vs-none"}>
                            {v==="Full"?<span style={{display:"inline-flex",alignItems:"center",gap:4}}><FullIcon/> Full</span>:v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ok-vs-table-note">Public information · May 2026</p>
            </Reveal>
          </div>
        </section>

        {/* ── 10: SECTORS ── */}
        <section className="ok-section" id="sec-sectors">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">10</span>
              <h2 className="ok-h2">Sectors We Serve</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Cross-sector advisory across South Africa's transformation economy. Client names withheld pending consent.</p>
            </Reveal>
            <div className="ok-sectors-list">
              {[["01","Financial Services"],["02","Chemicals"],["03","Retail & Pharmacy"],["04","Public Sector"],["05","Logistics"],["06","Water & Utilities"],["07","Mid-Cap Corporates"],["08","JSE-Listed Corporates"]].map(([num, name], i) => (
                <Reveal key={name} delay={i % 4 > 0 ? `ok-d${Math.min(i%4,3)}` : ""}>
                  <div className="ok-sector-item">
                    <div className="ok-sector-num">{num}</div>
                    <div className="ok-sector-name">{name}</div>
                    <span className="ok-sector-badge-sm">Toolkit deployed</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 11: CONTACT / BOOK A DEMO ── */}
        <section className="ok-section" id="sec-contact">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">11 · Contact</span>
              <h2 className="ok-h2" style={{ marginTop:8 }}>Let's make your transformation measurable.</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>A 45-minute working session — not a sales pitch. We'll walk through the live Okiru Toolkit, map it to your reporting cycle, and show you the Net-Zero pathway implied by your own data.</p>
            </Reveal>
            <div className="ok-demo-grid">
              <div className="ok-demo-l">
                <h3 className="ok-h3" style={{ marginBottom:8 }}>Get in touch</h3>
                <div className="ok-demo-contact">
                  {[["Email","contact@okiru.co.za"],["Phone","+27 78 104 6527"],["Office","Braamfontein, Johannesburg"],["Web","okiru.co.za"],["Registration","2023/597303/07"]].map(([label, val]) => (
                    <div key={label} className="ok-demo-contact-item">
                      <span className="ok-demo-contact-label">{label}</span>
                      <span className="ok-demo-contact-val">
                        {label==="Email"?<a href={`mailto:${val}`}>{val}</a>:label==="Web"?<a href={`https://${val}`} target="_blank" rel="noopener">{val}</a>:val}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:36 }}>
                  <button className="ok-btn-cta" onClick={openDemo}>
                    Book a 45-min demo <span className="arr"><ArrowRight size={14} /></span>
                  </button>
                </div>
              </div>
              <div className="ok-demo-r">
                <div className="ok-demo-agenda-title">
                  <span>Demo Agenda</span>
                  <span style={{ color:"var(--pur-l)" }}>45 min</span>
                </div>
                {[["00:00 – 10:00","Your transformation reporting today"],["10:00 – 25:00","Live walkthrough · Okiru Toolkit"],["25:00 – 35:00","Net-Zero Roadmap · your data"],["35:00 – 45:00","Engagement model & next steps"]].map(([time, desc]) => (
                  <div key={time} className="ok-demo-agenda-item">
                    <span className="ok-demo-agenda-time">{time}</span>
                    <span className="ok-demo-agenda-desc">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer>
        <div className="ok-w">
          <div className="ok-foot-grid">
            <div>
              <div className="ok-foot-col-title">Contact</div>
              <div className="ok-foot-col-items">
                <div className="ok-foot-col-item"><a href="mailto:contact@okiru.co.za">contact@okiru.co.za</a></div>
                <div className="ok-foot-col-item">+27 78 104 6527</div>
                <div className="ok-foot-col-item"><a href="https://okiru.co.za" target="_blank" rel="noopener">okiru.co.za</a></div>
              </div>
            </div>
            <div>
              <div className="ok-foot-col-title">Practice</div>
              <div className="ok-foot-col-items">
                {["ESG Advisory","B-BBEE & Compliance","AI & Digital Tools","Skills Development"].map(p => (
                  <div key={p} className="ok-foot-col-item">{p}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="ok-foot-col-title">Frameworks</div>
              <div className="ok-foot-col-items">
                <div className="ok-foot-col-item" style={{ fontSize:12, lineHeight:1.8 }}>IFRS S1/S2 · GRI · TCFD · CDP · SBTi CNZS 2.0 · King V · B-BBEE Codes · EE Act · ISO 14001 · POPIA · ISO 14083</div>
              </div>
            </div>
          </div>
          <div className="ok-foot-bottom">
            <span className="ok-foot-wm">
              <img src={okiruLogo} alt="" style={{ width:22, height:22, opacity:0.85 }} />
              Okiru Consulting
            </span>
            <span className="ok-foot-c">Compliance. Strategy. Growth. · Braamfontein, Johannesburg, South Africa</span>
            <div className="ok-foot-links">
              <button className="ok-foot-link" onClick={onNavigateAuth}>Sign in</button>
              <a href="/devmode" className="ok-foot-link" data-testid="link-devmode">{`{DevMode}`}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
