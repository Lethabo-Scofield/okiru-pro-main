import { useState, useEffect } from "react";
import heroBg from "@assets/image_1783374759717.png";
import ctaBg from "@assets/image_1783017701495.png";
import ringLogo from "@assets/okiru_ring.png";
import showcaseImg from "@assets/image_1783375720739.png";
import showcaseImg2 from "@assets/image_1783375813984.png";
import heroShot from "@assets/image_1783375903114.png";
import { PRODUCTS } from "./productLandingConfig";
import { SiteNav, SiteFooter, Reveal, DemoModal, ArrowRight } from "./siteChrome";

/* ─────────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────────── */
export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Inter:wght@300;400;500;600;700;800&display=swap');

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
    /* Restrained UI accent — single cohesive hue for cards (avoids rainbow "AI" look) */
    --accent:      rgba(255,255,255,0.42);
    --accent-line: rgba(255,255,255,0.14);
    --card-hover:  rgba(255,255,255,0.035);
    --mono:  'IBM Plex Mono', ui-monospace, monospace;
    --serif: 'Inter', system-ui, -apple-system, sans-serif;
    --sans:  'Inter', system-ui, -apple-system, sans-serif;
    background:
      radial-gradient(ellipse 70% 45% at 12% 8%, rgba(147,51,234,0.055), transparent 60%),
      radial-gradient(ellipse 60% 45% at 92% 42%, rgba(6,182,212,0.04), transparent 58%),
      radial-gradient(ellipse 55% 40% at 50% 100%, rgba(232,68,26,0.035), transparent 62%),
      var(--ink);
    background-attachment: fixed;
    color: var(--body);
    font-family: var(--sans); font-weight: 400;
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
  .okiru-root .ok-nav-linkedin {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 8px;
    color: rgba(255,255,255,0.55); background: none; border: 1px solid rgba(255,255,255,0.12); cursor: pointer;
    transition: color .2s, border-color .2s, background .2s, transform .18s cubic-bezier(.16,1,.3,1);
  }
  .okiru-root .ok-nav-linkedin:hover { color: var(--hi); border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.04); transform: translateY(-1px); }
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
    min-height: 100vh; min-height: 100svh;
    display: flex; align-items: center;
    padding: 128px 0 64px; position: relative;
    border-bottom: 1px solid var(--rule); overflow: hidden;
  }
  .okiru-root .ok-hero-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; background: var(--ink); }
  .okiru-root .ok-hero-photo {
    position: absolute; inset: 0; z-index: 0;
    background-position: center right; background-size: cover; background-repeat: no-repeat;
    opacity: 0.92; animation: okiru-heroPhoto 1.8s cubic-bezier(.16,1,.3,1) both;
  }
  @keyframes okiru-heroPhoto {
    from { opacity: 0; transform: scale(1.07); }
    to   { opacity: 0.92; transform: scale(1); }
  }
  .okiru-root .ok-hero-photo-overlay {
    position: absolute; inset: 0; z-index: 1;
    background:
      linear-gradient(90deg, var(--ink) 0%, rgba(11,15,26,0.92) 26%, rgba(11,15,26,0.55) 54%, rgba(11,15,26,0.12) 78%, rgba(11,15,26,0.4) 100%),
      linear-gradient(180deg, rgba(11,15,26,0.55) 0%, transparent 20%, transparent 58%, var(--ink) 100%);
  }
  .okiru-root .ok-hero-beam {
    position: absolute; top: -10%; right: -5%; width: 55%; height: 120%;
    background: conic-gradient(from 195deg at 85% 20%, transparent 0deg, rgba(6,182,212,0.06) 10deg, rgba(147,51,234,0.10) 18deg, rgba(232,68,26,0.05) 26deg, transparent 38deg);
  }
  .okiru-root .ok-hero-glow {
    position: absolute; top: -20%; right: -8%; width: 700px; height: 700px; border-radius: 50%;
    background: radial-gradient(circle, rgba(6,182,212,0.08) 0%, rgba(147,51,234,0.05) 40%, transparent 70%);
    animation: okiru-glowDrift 16s ease-in-out infinite alternate;
  }
  @keyframes okiru-glowDrift {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(-48px, 36px) scale(1.08); }
  }
  @media (prefers-reduced-motion: reduce) { .okiru-root .ok-hero-glow { animation: none; } }

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
    font-family: var(--serif); font-size: clamp(2.4rem, 4.4vw, 4rem);
    line-height: 1.1; letter-spacing: -0.035em; color: #ffffff; font-weight: 700;
    max-width: min(60rem, 100%); margin-bottom: 32px;
  }
  .okiru-root .ok-h1-gradient {
    display: block; margin-top: 6px; white-space: nowrap;
    background: var(--grad-text);
    background-size: 220% 100%;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    animation: okiru-h1Shimmer 9s ease-in-out infinite;
  }
  @keyframes okiru-h1Shimmer {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  @media (prefers-reduced-motion: reduce) { .okiru-root .ok-h1-gradient { animation: none; } }
  .okiru-root .ok-h1-ring {
    display: inline-block; width: 0.82em; height: 0.82em; vertical-align: -0.1em;
    margin: 0 0.015em; object-fit: contain; -webkit-text-fill-color: initial;
    animation: okiru-ringSpin 8s linear infinite;
  }
  @keyframes okiru-ringSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .okiru-root .ok-h1-ring { animation: none; } }
  .okiru-root .ok-hero-sub {
    max-width: min(44rem, 100%); font-size: 16px; color: rgba(255,255,255,0.75);
    line-height: 1.8; font-weight: 400; margin-bottom: 44px;
  }
  .okiru-root .ok-hero-sub strong { color: rgba(255,255,255,0.92); font-weight: 500; }
  .okiru-root .ok-hero-btns { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

  /* ── HERO PROOF STATS ── */
  .okiru-root .ok-hero-stats {
    display: flex; align-items: center; gap: 22px; flex-wrap: wrap;
    margin-top: 52px; padding-top: 26px;
    border-top: 1px solid rgba(255,255,255,0.09);
    max-width: min(58rem, 100%);
  }
  .okiru-root .ok-hero-stat { display: flex; flex-direction: column; gap: 3px; }
  .okiru-root .ok-hero-stat-num {
    font-family: var(--serif); font-size: 1.45rem; font-weight: 600; letter-spacing: -0.01em;
    background: var(--grad-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  .okiru-root .ok-hero-stat-label {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(255,255,255,0.45);
  }
  .okiru-root .ok-hero-stat-div { width: 1px; height: 34px; background: rgba(255,255,255,0.1); }
  .okiru-root .ok-anim-5 { opacity: 0; animation: okiru-slideUp .6s ease forwards .6s; }

  /* ── HERO LAYOUT + FLOATING SCORECARD ── */
  .okiru-root .ok-hero-w {
    display: grid; grid-template-columns: minmax(0,1fr) 460px;
    gap: 56px; align-items: center;
  }
  .okiru-root .ok-hero-content { min-width: 0; }
  .okiru-root .ok-hero-visual { opacity: 0; animation: okiru-slideUp .7s ease forwards .5s; }
  .okiru-root .ok-hero-shot {
    display: block; width: 100%; height: auto; border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 40px 100px -34px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06);
    animation: okiru-cardFloat 6.5s ease-in-out infinite;
  }
  @keyframes okiru-cardFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  @media (prefers-reduced-motion: reduce) { .okiru-root .ok-hero-shot { animation: none; } }
  @media (max-width: 1040px) {
    .okiru-root .ok-hero-w { grid-template-columns: 1fr; gap: 40px; }
    .okiru-root .ok-hero-content { order: 1; text-align: center; }
    .okiru-root .ok-hero-visual { order: 2; max-width: 480px; margin: 0 auto; }
    .okiru-root .ok-h1, .okiru-root .ok-hero-sub { margin-left: auto; margin-right: auto; }
    .okiru-root .ok-h1-gradient { white-space: normal; }
    .okiru-root .ok-hero-tag, .okiru-root .ok-hero-btns, .okiru-root .ok-hero-stats { justify-content: center; }
  }

  /* ── PRODUCT SHOWCASE ── */
  .okiru-root .ok-showcase { position: relative; padding: 48px 0 96px; }
  .okiru-root .ok-showcase-head { text-align: center; margin-bottom: 44px; }
  .okiru-root .ok-showcase-tag { display: inline-flex; align-items: center; gap: 9px; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 16px; }
  .okiru-root .ok-showcase-h { font-family: var(--serif); font-weight: 700; font-size: clamp(1.7rem, 3.2vw, 2.6rem); letter-spacing: -0.02em; color: #fff; }
  .okiru-root .ok-showcase-tabs { display: inline-flex; gap: 5px; margin-top: 24px; padding: 5px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
  .okiru-root .ok-showcase-tab { font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.5); background: transparent; border: 0; cursor: pointer; padding: 8px 18px; border-radius: 999px; transition: color .2s ease, background .2s ease; }
  .okiru-root .ok-showcase-tab:hover { color: rgba(255,255,255,0.85); }
  .okiru-root .ok-showcase-tab.is-active { color: #fff; background: var(--grad); box-shadow: 0 6px 18px -8px rgba(147,51,234,0.6); }
  .okiru-root .ok-frame-img-in { animation: okiru-fadeIn .45s ease; }
  @keyframes okiru-fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .okiru-root .ok-frame-img-in { animation: none; } }
  .okiru-root .ok-showcase-stage { position: relative; }
  .okiru-root .ok-showcase-stage::before {
    content: ''; position: absolute; left: 50%; top: -8%; transform: translateX(-50%);
    width: 72%; height: 78%; z-index: 0; pointer-events: none; filter: blur(70px);
    background: radial-gradient(ellipse at center, rgba(147,51,234,0.24), rgba(6,182,212,0.10) 55%, transparent 72%);
  }
  .okiru-root .ok-frame {
    position: relative; z-index: 1; border-radius: 14px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.12); background: rgba(13,18,32,0.7);
    box-shadow: 0 50px 120px -40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06);
  }
  .okiru-root .ok-frame-bar { display: flex; align-items: center; gap: 14px; height: 40px; padding: 0 16px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
  .okiru-root .ok-frame-dots { display: flex; gap: 7px; }
  .okiru-root .ok-frame-dots span { width: 11px; height: 11px; border-radius: 50%; background: rgba(255,255,255,0.14); }
  .okiru-root .ok-frame-url { flex: 1; max-width: 320px; margin: 0 auto; height: 22px; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07); display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; color: rgba(255,255,255,0.45); }
  .okiru-root .ok-frame-img { display: block; width: 100%; height: auto; }

  .okiru-root .ok-btn-cta {
    display: inline-flex; align-items: center; gap: 9px; font-family: var(--sans);
    font-size: 15px; font-weight: 600; color: #fff; background: var(--grad);
    border: none; cursor: pointer; padding: 13px 28px; border-radius: 999px;
    letter-spacing: -0.01em; transition: opacity .2s, transform .15s, box-shadow .25s; position: relative;
    box-shadow: 0 12px 32px -14px rgba(147,51,234,0.55);
  }
  .okiru-root .ok-btn-cta:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 16px 40px -14px rgba(147,51,234,0.7); }
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
  .okiru-root .ok-service { flex: 1; padding: 22px 32px; border-right: 1px solid var(--rule); position: relative; overflow: hidden; transition: background .3s; }
  .okiru-root .ok-service:last-child { border-right: none; }
  .okiru-root .ok-service::after {
    content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
    background: var(--grad-h); transform: scaleX(0); transform-origin: left;
    transition: transform .4s cubic-bezier(.16,1,.3,1);
  }
  .okiru-root .ok-service:hover { background: rgba(255,255,255,0.025); }
  .okiru-root .ok-service:hover::after { transform: scaleX(1); }
  .okiru-root .ok-service-name { font-family: var(--serif); font-size: 1.15rem; font-weight: 400; color: var(--hi); margin-bottom: 3px; transition: color .3s; }
  .okiru-root .ok-service:hover .ok-service-name { color: #fff; }
  .okiru-root .ok-service-meta { font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }

  /* ── QUOTE ── */
  .okiru-root .ok-quote {
    padding: 56px 0 40px; border-bottom: 1px solid var(--rule);
    background: linear-gradient(to bottom, rgba(6,182,212,0.025) 0%, transparent 100%);
  }
  .okiru-root .ok-quote-inner { max-width: 820px; }
  .okiru-root .ok-quote-text {
    font-family: var(--serif);
    font-size: clamp(1.55rem, 3.2vw, 2.2rem); line-height: 1.38;
    letter-spacing: -0.02em; color: rgba(255,255,255,0.88);
  }
  .okiru-root .ok-quote-text em { color: var(--coral); }

  .okiru-root .ok-scroll-ind {
    display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 36px;
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(255,255,255,0.2);
    animation: okiru-scrollBob 2.5s ease-in-out infinite;
  }
  @keyframes okiru-scrollBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(5px); } }

  /* ── TRUSTED BY ── */
  .okiru-root .ok-sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }
  .okiru-root .ok-trusted { padding: 84px 0; border-bottom: 1px solid var(--rule); overflow: hidden; }
  .okiru-root .ok-trusted-head { margin-bottom: 48px; }
  .okiru-root .ok-trusted-title { font-family: var(--serif); font-size: clamp(1.7rem, 3vw, 2.6rem); color: var(--hi); letter-spacing: -0.025em; line-height: 1.15; margin-top: 12px; max-width: 22ch; }
  .okiru-root .ok-marquee { position: relative; display: flex; overflow: hidden; -webkit-mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent); mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent); }
  .okiru-root .ok-marquee + .ok-marquee { margin-top: 20px; }
  .okiru-root .ok-marquee-track { display: flex; flex-shrink: 0; align-items: center; animation: okiru-marquee 46s linear infinite; }
  .okiru-root .ok-marquee-rev .ok-marquee-track { animation-direction: reverse; animation-duration: 54s; }
  .okiru-root .ok-marquee:hover .ok-marquee-track { animation-play-state: paused; }
  .okiru-root .ok-brand-word {
    font-family: var(--serif); font-size: 1.35rem; font-weight: 500; letter-spacing: -0.01em;
    color: rgba(255,255,255,0.38); white-space: nowrap; margin-right: 60px; transition: color .25s;
  }
  .okiru-root .ok-brand-word:hover { color: var(--hi); }
  @keyframes okiru-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) { .okiru-root .ok-marquee-track { animation: none; } }

  .okiru-root .ok-section { padding: 96px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-section.ok-page-top { padding-top: 140px; }
  .okiru-root .ok-sec-num {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
    background: var(--grad-text); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; margin-bottom: 10px; display: inline-block;
  }
  .okiru-root .ok-eyebrow {
    font-family: var(--mono); font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.14em; color: var(--accent); margin-bottom: 16px; display: block;
  }
  .okiru-root .ok-h2 {
    font-family: var(--serif); font-size: clamp(1.9rem,3.2vw,2.8rem);
    color: var(--hi); font-weight: 700; letter-spacing: -0.03em; line-height: 1.08;
  }
  .okiru-root .ok-h3 {
    font-family: var(--serif); font-size: clamp(1.4rem,2.2vw,1.9rem);
    color: var(--hi); font-weight: 600; letter-spacing: -0.025em; line-height: 1.1;
  }
  .okiru-root .ok-lead { font-size: 15px; color: var(--body); line-height: 1.8; margin-top: 16px; }
  .okiru-root .ok-lead-l { font-size: 15px; color: var(--body); line-height: 1.8; margin-top: 16px; max-width: 42rem; }

  /* ── SECTION 02: CHALLENGE ── */
  .okiru-root .ok-challenge-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 2px; margin-top: 56px; }
  .okiru-root .ok-challenge-card {
    padding: 40px 36px; border: 1px solid var(--rule);
    background: rgba(255,255,255,0.015); position: relative; overflow: hidden;
    transition: background .35s, border-color .35s, transform .35s cubic-bezier(.16,1,.3,1), box-shadow .35s;
  }
  .okiru-root .ok-challenge-card:hover {
    background: var(--card-hover); border-color: rgba(255,255,255,0.14);
    transform: translateY(-3px); box-shadow: 0 22px 48px -26px rgba(0,0,0,0.8);
  }
  .okiru-root .ok-challenge-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: var(--accent-line); transition: background .35s, height .35s, box-shadow .35s;
  }
  .okiru-root .ok-challenge-card:hover::before {
    height: 2px; background: var(--grad-h); box-shadow: 0 0 18px rgba(147,51,234,0.4);
  }
  .okiru-root .ok-challenge-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; display: block; }
  .okiru-root .ok-challenge-title { font-family: var(--serif); font-size: 1.3rem; color: var(--hi); font-weight: 400; letter-spacing: -0.02em; margin-bottom: 10px; }
  .okiru-root .ok-challenge-stat { font-family: var(--serif); font-weight: 700; font-size: 2.4rem; color: var(--hi); letter-spacing: -0.04em; margin-bottom: 4px; line-height: 1; }
  .okiru-root .ok-challenge-stat-label { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px; }
  .okiru-root .ok-challenge-desc { font-size: 13.5px; color: var(--muted); line-height: 1.75; }

  /* ── SECTION 03: WHO WE ARE ── */
  .okiru-root .ok-about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; margin-top: 56px; }
  .okiru-root .ok-about-pillar { display: grid; grid-template-columns: 56px 1fr; padding: 28px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-about-pillar:last-child { border-bottom: none; }
  .okiru-root .ok-about-pillar-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); padding-top: 4px; }
  .okiru-root .ok-about-pillar-name { font-family: var(--serif); font-size: 1.1rem; color: var(--hi); font-weight: 400; margin-bottom: 5px; }
  .okiru-root .ok-about-pillar-sub { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px; }
  .okiru-root .ok-about-pillar-desc { font-size: 13.5px; color: var(--muted); line-height: 1.7; }
  .okiru-root .ok-about-badges { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 32px; }
  .okiru-root .ok-about-badge { padding: 20px; border: 1px solid var(--rule); border-radius: 8px; background: rgba(255,255,255,0.02); }
  .okiru-root .ok-about-badge-val { font-family: var(--serif); font-weight: 700; font-size: 1.8rem; color: var(--hi); letter-spacing: -0.03em; line-height: 1; }
  .okiru-root .ok-about-badge-label { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 5px; }

  /* ── SECTION 04: OKIRU DIFFERENCE ── */
  .okiru-root .ok-diff-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0; border-top: 1px solid var(--rule); border-left: 1px solid var(--rule); margin-top: 56px; }
  .okiru-root .ok-diff-card { padding: 36px 32px; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); transition: background .3s; }
  .okiru-root .ok-diff-card:hover { background: var(--card-hover); }
  .okiru-root .ok-diff-idx { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; }
  .okiru-root .ok-diff-title { font-family: var(--serif); font-size: 1.15rem; color: var(--hi); font-weight: 400; margin-bottom: 10px; }
  .okiru-root .ok-diff-desc { font-size: 13.5px; color: var(--muted); line-height: 1.75; }
  .okiru-root .ok-diff-stats { display: grid; grid-template-columns: repeat(6,1fr); border-top: 1px solid var(--rule); }
  .okiru-root .ok-diff-stat { padding: 28px 24px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-diff-stat:last-child { border-right: none; }
  .okiru-root .ok-diff-stat-n { font-family: var(--serif); font-weight: 700; font-size: 2rem; color: var(--hi); letter-spacing: -0.04em; line-height: 1; }
  .okiru-root .ok-diff-stat-l { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 5px; }

  /* ── SECTION 05: TOOLKIT ── */
  .okiru-root .ok-toolkit-hdr { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; margin-bottom: 56px; }
  .okiru-root .ok-toolkit-pillar-wrap { display: grid; grid-template-columns: repeat(3,1fr); gap: 2px; }
  .okiru-root .ok-toolkit-pillar { border: 1px solid var(--rule); padding: 32px 28px; background: rgba(255,255,255,0.015); }
  .okiru-root .ok-toolkit-pillar-letter { font-family: var(--serif); font-weight: 700; font-size: 3.5rem; line-height: 1; letter-spacing: -0.05em; margin-bottom: 6px; }
  .okiru-root .ok-toolkit-pillar-name { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .okiru-root .ok-toolkit-pillar-weight { font-family: var(--mono); font-size: 11px; color: rgba(255,255,255,.35); letter-spacing: 0.04em; margin-bottom: 20px; }
  .okiru-root .ok-toolkit-items { list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .okiru-root .ok-toolkit-items li { font-size: 12.5px; color: var(--muted); display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; }
  .okiru-root .ok-toolkit-items li::before { content: '·'; color: var(--accent); flex-shrink: 0; }
  .okiru-root .ok-toolkit-bullet { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: rgba(255,255,255,.75); margin-bottom: 10px; }
  .okiru-root .ok-toolkit-dot { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.4); flex-shrink: 0; margin-top: 8px; }

  /* ── SECTION 06: ARCHITECTURE ── */
  .okiru-root .ok-arch-layers { display: flex; flex-direction: column; gap: 2px; margin-top: 56px; }
  .okiru-root .ok-arch-layer { display: grid; grid-template-columns: 80px 1fr 1fr; gap: 0; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); transition: background .3s; }
  .okiru-root .ok-arch-layer:hover { background: var(--card-hover); }
  .okiru-root .ok-arch-num-col { display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--rule); padding: 32px 16px; font-family: var(--serif); font-weight: 700; font-size: 2.2rem; color: rgba(255,255,255,.15); letter-spacing: -0.04em; }
  .okiru-root .ok-arch-main { padding: 32px 36px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-arch-detail { padding: 32px 36px; }
  .okiru-root .ok-arch-tag { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .okiru-root .ok-arch-title { font-family: var(--serif); font-size: 1.25rem; color: var(--hi); font-weight: 400; margin-bottom: 8px; }
  .okiru-root .ok-arch-desc { font-size: 13.5px; color: var(--muted); line-height: 1.75; }
  .okiru-root .ok-arch-sheets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
  .okiru-root .ok-arch-sheet { font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em; color: rgba(255,255,255,.4); background: rgba(255,255,255,.04); border: 1px solid var(--rule); padding: 3px 8px; border-radius: 3px; }

  /* ── SECTION 07: FRAMEWORKS ── */
  .okiru-root .ok-fw-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 32px; margin-top: 56px; }
  .okiru-root .ok-fw-col-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 20px; display: block; padding-bottom: 12px; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-fw-items { list-style: none; }
  .okiru-root .ok-fw-item { padding: 12px 10px 12px 12px; margin: 0 -10px 0 -12px; border-bottom: 1px solid var(--rule); display: flex; flex-direction: column; gap: 3px; border-radius: 6px; transition: background .25s, padding-left .25s cubic-bezier(.16,1,.3,1); }
  .okiru-root .ok-fw-item:last-child { border-bottom: none; }
  .okiru-root .ok-fw-item:hover { background: rgba(255,255,255,0.03); padding-left: 18px; }
  .okiru-root .ok-fw-name { font-size: 13.5px; color: var(--hi); font-weight: 500; }
  .okiru-root .ok-fw-desc { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.04em; }
  .okiru-root .ok-fw-chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .okiru-root .ok-fw-chip {
    font-family: var(--sans); font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.72);
    background: rgba(255,255,255,0.03); border: 1px solid var(--rule); border-radius: 999px;
    padding: 8px 16px; white-space: nowrap; cursor: default;
    transition: color .25s, border-color .25s, background .25s, transform .25s cubic-bezier(.16,1,.3,1);
  }
  .okiru-root .ok-fw-chip:hover { color: #fff; background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.28); transform: translateY(-2px); }

  /* ── SECTION 08: OUTCOMES ── */
  .okiru-root .ok-outcomes-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 2px; margin-top: 56px; }
  .okiru-root .ok-outcome-card { padding: 44px 40px; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); transition: background .3s; }
  .okiru-root .ok-outcome-card:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.14); }
  .okiru-root .ok-outcome-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; display: block; }
  .okiru-root .ok-outcome-title { font-family: var(--serif); font-size: 1.5rem; color: var(--hi); font-weight: 400; letter-spacing: -0.02em; margin-bottom: 14px; }
  .okiru-root .ok-outcome-desc { font-size: 14px; color: var(--muted); line-height: 1.8; }
  .okiru-root .ok-outcome-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--rule); font-family: var(--serif); font-size: 13.5px; color: rgba(255,255,255,.4); }

  /* ── SECTION 09: ENGAGEMENT ── */
  .okiru-root .ok-eng-hdr { display: grid; grid-template-columns: 1fr 2fr; gap: 80px; margin-bottom: 56px; }
  .okiru-root .ok-eng-phases { display: grid; grid-template-columns: repeat(3,1fr); gap: 2px; }
  .okiru-root .ok-eng-phase { padding: 36px 32px; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); position: relative; transition: background .3s; }
  .okiru-root .ok-eng-phase:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.14); }
  .okiru-root .ok-eng-phase::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: var(--accent-line); }
  .okiru-root .ok-eng-phase-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .okiru-root .ok-eng-phase-name { font-family: var(--serif); font-size: 1.25rem; color: var(--hi); font-weight: 400; margin-bottom: 4px; }
  .okiru-root .ok-eng-phase-sub { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 0.06em; margin-bottom: 20px; }
  .okiru-root .ok-eng-phase-items { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .okiru-root .ok-eng-phase-items li { font-size: 13px; color: rgba(255,255,255,.7); display: flex; align-items: flex-start; gap: 10px; }
  .okiru-root .ok-eng-phase-items li::before { content: '→'; color: var(--accent); flex-shrink: 0; font-size: 12px; margin-top: 1px; }

  /* ── SECTION 10: DASHBOARD ── */
  .okiru-root .ok-dash-scores { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 40px; }
  .okiru-root .ok-dash-score-card { border: 1px solid var(--rule); border-radius: 8px; padding: 24px; background: rgba(255,255,255,0.02); }
  .okiru-root .ok-dash-score-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .okiru-root .ok-dash-score-val { font-family: var(--serif); font-weight: 700; font-size: 2rem; color: var(--hi); letter-spacing: -0.03em; line-height: 1; margin-bottom: 4px; }
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
  .okiru-root .ok-nz-target-val { font-family: var(--serif); font-weight: 700; font-size: 1.7rem; color: var(--hi); letter-spacing: -0.03em; line-height: 1; }
  .okiru-root .ok-nz-milestones { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 40px; }
  .okiru-root .ok-nz-milestone { border: 1px solid var(--rule); border-radius: 8px; padding: 24px 20px; background: rgba(255,255,255,0.02); }
  .okiru-root .ok-nz-milestone-year { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; color: var(--accent); margin-bottom: 6px; }
  .okiru-root .ok-nz-milestone-name { font-family: var(--serif); font-size: 1.1rem; color: var(--hi); font-weight: 400; margin-bottom: 8px; }
  .okiru-root .ok-nz-milestone-desc { font-size: 12.5px; color: var(--muted); line-height: 1.65; }
  .okiru-root .ok-nz-levers { display: flex; flex-wrap: wrap; gap: 10px; }
  .okiru-root .ok-nz-lever { font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; color: rgba(255,255,255,.5); background: rgba(255,255,255,.04); border: 1px solid var(--rule); padding: 6px 14px; border-radius: 4px; }

  /* ── SECTION 12: OKIRU PRO ── */
  .okiru-root .ok-pro-grid { display: grid; grid-template-columns: 5fr 7fr; gap: 0; border: 1px solid var(--rule); }
  .okiru-root .ok-pro-l { padding: 56px 52px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-pro-r { padding: 56px 52px; }
  .okiru-root .ok-pro-step { display: grid; grid-template-columns: 48px 1fr; padding: 22px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-pro-step:last-child { border-bottom: none; }
  .okiru-root .ok-pro-step-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); padding-top: 3px; }
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
  .okiru-root .ok-vs-edge:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.14); }
  .okiru-root .ok-vs-edge-num { display: flex; align-items: flex-start; justify-content: center; padding: 28px 16px; border-right: 1px solid var(--rule); font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
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
  .okiru-root .ok-sector-item:hover { background: var(--card-hover); border-color: rgba(255,255,255,0.14); }
  .okiru-root .ok-sector-num { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .okiru-root .ok-sector-name { font-family: var(--serif); font-size: 1.1rem; color: var(--hi); font-weight: 400; margin-bottom: 6px; }
  .okiru-root .ok-sector-badge-sm { font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; color: rgba(255,255,255,.5); background: rgba(255,255,255,.04); border: 1px solid var(--rule); padding: 2px 8px; border-radius: 3px; display: inline-block; }

  /* ── SECTION 15: BOOK A DEMO ── */
  .okiru-root .ok-demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 56px; border: 1px solid var(--rule); }
  .okiru-root .ok-demo-l { padding: 56px 52px; border-right: 1px solid var(--rule); }
  .okiru-root .ok-demo-r { padding: 56px 52px; background: rgba(255,255,255,0.015); }
  .okiru-root .ok-demo-contact { display: flex; flex-direction: column; gap: 20px; margin-top: 36px; }
  .okiru-root .ok-demo-contact-item { display: flex; flex-direction: column; gap: 4px; }
  .okiru-root .ok-demo-contact-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,.3); }
  .okiru-root .ok-demo-contact-val { font-size: 14px; color: rgba(255,255,255,.75); }
  .okiru-root .ok-demo-contact-val a { color: rgba(255,255,255,.7); text-decoration: none; }
  .okiru-root .ok-demo-contact-val a:hover { color: var(--hi); }
  .okiru-root .ok-demo-agenda-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
  .okiru-root .ok-demo-agenda-item { display: grid; grid-template-columns: 100px 1fr; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .okiru-root .ok-demo-agenda-item:last-child { border-bottom: none; }
  .okiru-root .ok-demo-agenda-time { font-family: var(--mono); font-size: 11px; color: rgba(255,255,255,.3); letter-spacing: 0.04em; padding-top: 1px; }
  .okiru-root .ok-demo-agenda-desc { font-size: 13.5px; color: rgba(255,255,255,.7); }

  /* ── SOCIALS ── */
  .okiru-root .ok-social-list { display: flex; flex-direction: column; gap: 12px; }
  .okiru-root .ok-social-link {
    display: flex; align-items: center; gap: 16px; padding: 16px 18px;
    border: 1px solid var(--rule); border-radius: 12px; background: rgba(255,255,255,0.015);
    text-decoration: none; transition: border-color .2s ease, background .2s ease, transform .2s ease;
  }
  .okiru-root .ok-social-link:hover { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.04); transform: translateY(-2px); }
  .okiru-root .ok-social-icon {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.05);
    color: var(--hi); font-family: var(--serif); font-size: 18px;
  }
  .okiru-root .ok-social-meta { display: flex; flex-direction: column; gap: 3px; }
  .okiru-root .ok-social-name { font-size: 14px; font-weight: 600; color: var(--hi); }
  .okiru-root .ok-social-handle { font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; color: rgba(255,255,255,.4); }

  /* ── FINAL CTA ── */
  .okiru-root .ok-cta { position: relative; overflow: hidden; padding: 128px 0; }
  .okiru-root .ok-cta-photo {
    position: absolute; inset: -40px; z-index: 0; pointer-events: none;
    background-position: center; background-size: cover; background-repeat: no-repeat;
    filter: blur(18px) saturate(1.05); opacity: 0.42; transform: scale(1.08);
  }
  .okiru-root .ok-cta-bg {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
      radial-gradient(ellipse 70% 70% at 50% 0%, rgba(147,51,234,0.12) 0%, rgba(6,182,212,0.05) 40%, transparent 72%),
      linear-gradient(180deg, var(--ink) 0%, rgba(11,15,26,0.55) 22%, rgba(11,15,26,0.55) 78%, var(--ink) 100%);
  }
  .okiru-root .ok-cta-inner { max-width: 760px; position: relative; z-index: 2; }
  .okiru-root .ok-cta-h { font-family: var(--serif); font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; color: var(--hi); margin-bottom: 20px; }
  .okiru-root .ok-cta-sub { font-size: 16px; color: var(--body); line-height: 1.7; margin-bottom: 36px; max-width: 580px; }
  .okiru-root .ok-cta-btns { display: flex; gap: 14px; flex-wrap: wrap; }

  /* ── CEO / FOUNDER MESSAGE ── */
  .okiru-root .ok-ceo { border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); background: linear-gradient(to bottom, rgba(147,51,234,0.03) 0%, transparent 60%); }
  .okiru-root .ok-ceo-grid { display: grid; grid-template-columns: 320px 1fr; gap: 56px; align-items: center; }
  .okiru-root .ok-ceo-photo-wrap { position: relative; }
  .okiru-root .ok-ceo-photo {
    position: relative; z-index: 1; width: 100%; display: block; border-radius: var(--radius-xl, 16px);
    filter: grayscale(1) contrast(1.02); border: 1px solid rgba(255,255,255,0.1);
  }
  .okiru-root .ok-ceo-photo-glow {
    position: absolute; inset: -12% -12% -18% -12%; z-index: 0; pointer-events: none;
    background: radial-gradient(ellipse at 50% 40%, rgba(147,51,234,0.22), transparent 70%); filter: blur(28px);
  }
  .okiru-root .ok-ceo-body { max-width: 640px; }
  .okiru-root .ok-ceo-quote {
    margin: 18px 0 0; font-family: var(--serif); font-weight: 400;
    font-size: clamp(1.15rem, 1.9vw, 1.5rem); line-height: 1.55; letter-spacing: -0.015em;
    color: rgba(255,255,255,0.9);
  }
  .okiru-root .ok-ceo-sign { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--rule); }
  .okiru-root .ok-ceo-name { font-size: 16px; font-weight: 600; color: var(--hi); letter-spacing: -0.01em; }
  .okiru-root .ok-ceo-role { margin-top: 3px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
  @media (max-width: 820px) {
    .okiru-root .ok-ceo-grid { grid-template-columns: 1fr; gap: 32px; }
    .okiru-root .ok-ceo-photo-wrap { max-width: 300px; }
  }

  /* ── SCORECARD WIDGET ── */
  .okiru-root .ok-sc-pillar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .okiru-root .ok-sc-pillar-name { font-family: var(--sans); font-size: 11px; color: rgba(255,255,255,.55); letter-spacing: -0.01em; }
  .okiru-root .ok-sc-pillar-val  { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.28); letter-spacing: .04em; }
  .okiru-root .ok-sc-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,.06); overflow: hidden; margin-bottom: 2px; }
  .okiru-root .ok-sc-fill  { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(.22,1,.36,1); position: relative; overflow: hidden; }

  /* ── FOOTER ── */
  .okiru-root footer { position: relative; padding: 64px 0 36px; border-top: 1px solid var(--rule); overflow: hidden; }
  .okiru-root footer::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 620px; height: 300px; background: radial-gradient(ellipse at top, rgba(147,51,234,0.12), transparent 70%); pointer-events: none; }
  .okiru-root .ok-foot-grid { position: relative; display: grid; grid-template-columns: 1.7fr 1fr 1fr 1fr 1.1fr; gap: 40px; margin-bottom: 40px; }
  .okiru-root .ok-foot-brand { max-width: 300px; }
  .okiru-root .ok-foot-brand-top { display: inline-flex; align-items: center; gap: 10px; font-family: var(--serif); font-size: 17px; color: #fff; }
  .okiru-root .ok-foot-brand-top img { width: 26px; height: 26px; }
  .okiru-root .ok-foot-brand-desc { margin-top: 14px; font-size: 13px; line-height: 1.7; color: rgba(255,255,255,.45); }
  .okiru-root .ok-foot-social { display: flex; gap: 10px; margin-top: 18px; }
  .okiru-root .ok-foot-social a { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.5); transition: color .2s, border-color .2s, background .2s; }
  .okiru-root .ok-foot-social a:hover { color: #fff; border-color: rgba(255,255,255,.28); background: rgba(255,255,255,.05); }
  .okiru-root .ok-foot-col-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,.3); margin-bottom: 14px; }
  .okiru-root .ok-foot-col-items { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .okiru-root .ok-foot-col-item { font-size: 13px; color: rgba(255,255,255,.5); line-height: 1.5; }
  .okiru-root .ok-foot-col-item a, .okiru-root .ok-foot-linkbtn { color: rgba(255,255,255,.5); text-decoration: none; transition: color .2s; background: none; border: none; padding: 0; font: inherit; cursor: pointer; text-align: left; }
  .okiru-root .ok-foot-col-item a:hover, .okiru-root .ok-foot-linkbtn:hover { color: var(--hi); }
  .okiru-root .ok-foot-frameworks { position: relative; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 14px; padding: 22px 0; margin-bottom: 8px; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-foot-frameworks .ok-foot-fw-list { font-size: 12px; line-height: 1.8; color: rgba(255,255,255,.4); }
  .okiru-root .ok-foot-bottom { position: relative; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 24px; }
  .okiru-root .ok-foot-wm { font-family: var(--serif); font-size: 15px; color: var(--muted); display: inline-flex; align-items: center; gap: 10px; }
  .okiru-root .ok-foot-c { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.28); letter-spacing: .06em; }
  .okiru-root .ok-foot-links { display: flex; align-items: center; gap: 14px; }
  .okiru-root .ok-foot-link { font-family: var(--mono); font-size: 10px; color: rgba(255,255,255,.35); letter-spacing: .08em; text-decoration: none; text-transform: uppercase; transition: color .2s ease; background: none; border: none; cursor: pointer; }
  .okiru-root .ok-foot-link:hover { color: #22d3ee; }

  /* ── LEGAL / DOC PAGES ── */
  .okiru-root .ok-legal { max-width: 780px; }
  .okiru-root .ok-legal-meta { font-family: var(--mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.35); margin-top: 14px; }
  .okiru-root .ok-legal-intro { font-size: 15px; line-height: 1.8; color: var(--muted); margin-top: 20px; }
  .okiru-root .ok-legal-block { margin-top: 40px; }
  .okiru-root .ok-legal-block h3 { font-family: var(--serif); font-size: 20px; color: #fff; letter-spacing: -0.01em; margin-bottom: 12px; display: flex; align-items: baseline; gap: 12px; }
  .okiru-root .ok-legal-block h3 .ok-legal-idx { font-family: var(--mono); font-size: 12px; color: var(--hi); letter-spacing: .06em; }
  .okiru-root .ok-legal-block p { font-size: 14.5px; line-height: 1.8; color: rgba(255,255,255,.6); margin-bottom: 12px; }
  .okiru-root .ok-legal-block ul { margin: 4px 0 12px; padding-left: 20px; }
  .okiru-root .ok-legal-block li { font-size: 14px; line-height: 1.75; color: rgba(255,255,255,.55); margin-bottom: 6px; }
  .okiru-root .ok-legal-block a { color: var(--hi); text-decoration: none; }
  .okiru-root .ok-legal-block a:hover { text-decoration: underline; }

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
    .okiru-root .ok-hero-photo { animation: none; opacity: 0.92; transform: none; }
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
    .okiru-root .ok-foot-grid { grid-template-columns: 1fr 1fr 1fr; }
    .okiru-root .ok-foot-brand { grid-column: 1 / -1; max-width: 420px; }
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
    .okiru-root .ok-nav-demo-btn { display: none; }
    .okiru-root .ok-hamburger { display: block; }
    .okiru-root .ok-w { padding: 0 20px; }
    .okiru-root .ok-hero { padding: 96px 0 56px; }
    .okiru-root .ok-h1 { font-size: clamp(2.4rem, 9vw, 3.2rem); }
    .okiru-root .ok-section { padding: 64px 0; }
    .okiru-root .ok-section.ok-page-top { padding-top: 108px; }
    .okiru-root .ok-services { flex-direction: column; }
    .okiru-root .ok-service { border-right: none; border-bottom: 1px solid var(--rule); }
    .okiru-root .ok-service:last-child { border-bottom: none; }
    .okiru-root .ok-diff-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-diff-stats { grid-template-columns: repeat(2,1fr); }
    .okiru-root .ok-fw-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-sectors-list { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-foot-grid { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-foot-brand { grid-column: 1 / -1; }
    .okiru-root .ok-vs-edge-body { padding: 22px 24px; }
    .okiru-root .ok-vs-edge-num { padding: 22px 12px; }
    .okiru-root .ok-modal { max-width: calc(100vw - 32px); }
    .okiru-root .ok-modal-head { padding: 24px 24px 0; }
    .okiru-root .ok-modal-body { padding: 20px 24px 24px; }
  }
  @media (max-width: 480px) {
    .okiru-root .ok-foot-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-foot-brand { grid-column: auto; }
    .okiru-root .ok-h1 { font-size: 2.2rem; }
    .okiru-root .ok-section { padding: 52px 0; }
    .okiru-root .ok-section.ok-page-top { padding-top: 96px; }
    .okiru-root .ok-hero-btns { justify-content: center; }
    .okiru-root .ok-hero-stats { gap: 16px 22px; margin-top: 40px; }
    .okiru-root .ok-hero-stat-div { display: none; }
    .okiru-root .ok-btn-cta, .okiru-root .ok-btn-sec { justify-content: center; }
    .okiru-root .ok-nz-targets { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-nz-milestones { grid-template-columns: 1fr; }
    .okiru-root .ok-sectors-list { grid-template-columns: 1fr; }
    .okiru-root .ok-diff-stats { grid-template-columns: 1fr 1fr; }
    .okiru-root .ok-about-badges { grid-template-columns: 1fr; }
    .okiru-root .ok-vs-edge { grid-template-columns: 1fr; }
    .okiru-root .ok-vs-edge-num { border-right: none; border-bottom: 1px solid var(--rule); justify-content: flex-start; padding: 14px 24px; }
    .okiru-root .ok-vs-edge-body { padding: 20px 24px; }
    .okiru-root .ok-demo-agenda-item { grid-template-columns: 88px 1fr; }
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
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function OkiruLanding({ onNavigateAuth, onNavigateRegister, onNavigateProduct, onNavigateAbout, onNavigateContact }: { onNavigateAuth: () => void; onNavigateRegister?: () => void; onNavigateProduct?: (slug: string) => void; onNavigateAbout?: () => void; onNavigateContact?: () => void }) {
  const [demoOpen, setDemoOpen] = useState(false);
  const [showcaseTab, setShowcaseTab] = useState(0);
  const SHOWCASES = [
    { label: "Workspace", url: "app.okiru.pro", img: showcaseImg, alt: "Okiru Pro workspace — create and view scorecards, ESG toolkit, and B-BBEE Certificate Hub" },
    { label: "ESG Workbook", url: "app.okiru.pro/esg", img: showcaseImg2, alt: "Okiru Pro ESG Workbook — environmental data entry with monthly emissions by depot and scope" },
  ];

  const openDemo = () => setDemoOpen(true);
  // Wire the marketing "Get started" CTA to the register flow (falls back to the
  // shared auth screen, where "Create account" is still reachable, if the host
  // didn't pass a register handler).
  const goRegister = () => (onNavigateRegister ?? onNavigateAuth)();
  const goContact = () => (onNavigateContact ?? onNavigateAuth)();

  const scrollTo = (id: string) => {
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
    document.body.style.overflow = demoOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [demoOpen]);

  return (
    <div className="okiru-root">
      <div className="okiru-grain" aria-hidden />

      {/* ── DEMO MODAL ── */}
      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}

      <SiteNav
        active="home"
        onNavigateHome={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onNavigateAbout={onNavigateAbout}
        onNavigateContact={onNavigateContact}
        onNavigateProduct={onNavigateProduct}
        onNavigateAuth={onNavigateAuth}
      />

      <main>
        {/* ── 01: HERO ── */}
        <section className="ok-hero">
          <div className="ok-hero-bg" aria-hidden>
            <div className="ok-hero-photo" style={{ backgroundImage: `url(${heroBg})` }} />
            <div className="ok-hero-photo-overlay" />
            <div className="ok-hero-beam" />
            <div className="ok-hero-glow" />
          </div>
          <div className="ok-w ok-hero-w" style={{ position:"relative", zIndex:1, width:"100%" }}>
            <div className="ok-hero-content">
              <div className="ok-hero-tag ok-anim-1">
                <span className="ok-hero-tag-dot" aria-hidden />
                ESG · B-BBEE · AI · Skills · WSP
                <span className="ok-hero-tag-div" aria-hidden />
                <span className="ok-hero-tag-brand">Okiru Consulting · Est. 2023</span>
              </div>
              <h1 className="ok-h1 ok-anim-2">
                Stop reporting.<br />
                Start <span className="ok-h1-gradient" aria-label="compounding growth.">
                  compounding gr<img src={ringLogo} alt="" aria-hidden="true" className="ok-h1-ring" />wth.
                </span>
              </h1>
              <p className="ok-hero-sub ok-anim-3">
                <strong>ESG, B-BBEE &amp; Skills Development</strong> — one toolkit,
                audit-grade, Net-Zero ready.
              </p>
              <div className="ok-hero-btns ok-anim-4">
                <button className="ok-btn-cta" onClick={goRegister}>
                  Get started <span className="arr"><ArrowRight size={14} /></span>
                </button>
                <button className="ok-btn-sec" onClick={() => scrollTo("sec-products")}>Explore the toolkits</button>
              </div>
              <div className="ok-hero-stats ok-anim-5">
                <div className="ok-hero-stat">
                  <span className="ok-hero-stat-num">2,750+</span>
                  <span className="ok-hero-stat-label">certificates indexed</span>
                </div>
                <div className="ok-hero-stat-div" aria-hidden />
                <div className="ok-hero-stat">
                  <span className="ok-hero-stat-num">9+</span>
                  <span className="ok-hero-stat-label">sector codes automated</span>
                </div>
                <div className="ok-hero-stat-div" aria-hidden />
                <div className="ok-hero-stat">
                  <span className="ok-hero-stat-num">1 · 2 · 3</span>
                  <span className="ok-hero-stat-label">emission scopes measured</span>
                </div>
                <div className="ok-hero-stat-div" aria-hidden />
                <div className="ok-hero-stat">
                  <span className="ok-hero-stat-num">IFRS S1/S2</span>
                  <span className="ok-hero-stat-label">disclosure aligned</span>
                </div>
              </div>
            </div>
            <div className="ok-hero-visual" aria-hidden="true">
              <img
                className="ok-hero-shot"
                src={heroShot}
                alt=""
                loading="eager"
              />
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

        {/* ── PRODUCT SHOWCASE ── */}
        <section className="ok-showcase">
          <div className="ok-w">
            <Reveal className="ok-showcase-head">
              <span className="ok-showcase-tag">
                <span className="ok-hero-tag-dot" aria-hidden />
                Inside the platform
              </span>
              <h2 className="ok-showcase-h">One workspace. Every scorecard.</h2>
              <div className="ok-showcase-tabs" aria-label="Product views">
                {SHOWCASES.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    aria-pressed={showcaseTab === i}
                    aria-label={`Show ${s.label} preview`}
                    className={`ok-showcase-tab${showcaseTab === i ? " is-active" : ""}`}
                    onClick={() => setShowcaseTab(i)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Reveal>
            <Reveal className="ok-showcase-stage">
              <div className="ok-frame">
                <div className="ok-frame-bar" aria-hidden="true">
                  <div className="ok-frame-dots"><span /><span /><span /></div>
                  <div className="ok-frame-url">{SHOWCASES[showcaseTab].url}</div>
                </div>
                <img
                  key={showcaseTab}
                  className="ok-frame-img ok-frame-img-in"
                  src={SHOWCASES[showcaseTab].img}
                  alt={SHOWCASES[showcaseTab].alt}
                  loading="lazy"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 02: THE CHALLENGE ── */}
        <section className="ok-section" id="sec-challenge">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">02</span>
              <h2 className="ok-h2" style={{ marginBottom:8 }}>Three gaps to Net Zero</h2>
              <p className="ok-lead-l">Okiru closes all three.</p>
            </Reveal>
            <div className="ok-challenge-grid">
              {[
                { label:"Measurement", stat:"70–90%", statLabel:"of emissions hide in the supply chain" },
                { label:"Reporting", stat:"IFRS S2", statLabel:"CDP & SBTi raise the bar every cycle" },
                { label:"Execution", stat:"5 silos", statLabel:"one annual report, rebuilt from scratch" },
              ].map((c, i) => (
                <Reveal key={c.label} delay={i > 0 ? `ok-d${i}` : ""}>
                  <div className="ok-challenge-card">
                    <span className="ok-challenge-label">{c.label}</span>
                    <div className="ok-challenge-stat">{c.stat}</div>
                    <div className="ok-challenge-stat-label" style={{ marginBottom:0 }}>{c.statLabel}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 03: OUR PRODUCTS ── */}
        <section className="ok-section" id="sec-products">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">03</span>
              <h2 className="ok-h2">Our Products</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Three toolkits, one methodology. Pick a starting point.</p>
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

        {/* ── 04: FRAMEWORKS ── */}
        <section className="ok-section" id="sec-frameworks">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">04</span>
              <h2 className="ok-h2">Frameworks &amp; Benchmarks</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>Every standard, built in.</p>
            </Reveal>
            <div className="ok-fw-grid">
              {[
                { title:"Global Disclosure", items:["GHG Protocol","IFRS S1 + S2","TCFD","CDP","SBTi CNZS 2.0","ISO 14083","GRI"] },
                { title:"South African Compliance", items:["King V","B-BBEE Codes","ISO 14001","EE / Skills Dev","NEMWA","POPIA"] },
                { title:"Emission Factors", items:["DEFRA 2024","Eskom NERSA 2024","GLEC Framework","SBTi CNZS 2.0","IFRS S2","King V"] },
              ].map((col, ci) => (
                <div key={col.title}>
                  <Reveal delay={ci > 0 ? `ok-d${ci}` : ""}>
                    <span className="ok-fw-col-title">{col.title}</span>
                    <div className="ok-fw-chips">
                      {col.items.map((n) => (
                        <span key={n} className="ok-fw-chip">{n}</span>
                      ))}
                    </div>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TRUSTED BY ── */}
        <section className="ok-trusted" id="sec-trusted">
          <div className="ok-w">
            <Reveal className="ok-trusted-head">
              <span className="ok-sec-num">05</span>
              <h2 className="ok-trusted-title">Trusted By Leading South African Organisations</h2>
              <p className="ok-lead-l" style={{ marginTop:8 }}>From transport and water to pharmacy, food and financial services, organisations across the country rely on Okiru for compliance they can defend.</p>
            </Reveal>
          </div>
          <ul className="ok-sr-only">
            {["CoverBridge","Thandanani Transport","Exness","ST2 Group","Baby City","ALX Africa","Di-Verse IT","Azelis South Africa","AutoMX","Dis-Chem Pharmacies","Super Group","Xlink","FICO South Africa","Magalies Water","JoJo Tanks","Silver Lake Trading","DineXp","Woman of Taste","iMPELA"].map(n => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {[
            ["CoverBridge","Thandanani Transport","Exness","ST2 Group","Baby City","ALX Africa","Di-Verse IT","Azelis South Africa","AutoMX","Dis-Chem Pharmacies"],
            ["Super Group","Xlink","FICO South Africa","Magalies Water","JoJo Tanks","Silver Lake Trading","DineXp","Woman of Taste","iMPELA"],
          ].map((row, ri) => (
            <div key={ri} className={`ok-marquee${ri === 1 ? " ok-marquee-rev" : ""}`} aria-hidden>
              <div className="ok-marquee-track">
                {[...row, ...row].map((name, i) => (
                  <span key={`${ri}-${i}`} className="ok-brand-word">{name}</span>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ── 06: FINAL CTA ── */}
        <section className="ok-section ok-cta" id="sec-cta">
          <div className="ok-cta-photo" aria-hidden style={{ backgroundImage: `url(${ctaBg})` }} />
          <div className="ok-cta-bg" aria-hidden />
          <div className="ok-w">
            <Reveal className="ok-cta-inner">
              <span className="ok-eyebrow">Ready when you are</span>
              <h2 className="ok-cta-h">Make your next disclosure the one that compounds.</h2>
              <p className="ok-cta-sub">
                ESG, B-BBEE and Skills Development in one toolkit — progress you can
                prove every quarter.
              </p>
              <div className="ok-cta-btns">
                <button className="ok-btn-cta" onClick={goRegister}>
                  Get started <span className="arr"><ArrowRight size={14} /></span>
                </button>
                <button className="ok-btn-sec" onClick={goContact}>Talk to our team</button>
              </div>
            </Reveal>
          </div>
        </section>

      </main>

      <SiteFooter onNavigateAuth={onNavigateAuth} />
    </div>
  );
}
