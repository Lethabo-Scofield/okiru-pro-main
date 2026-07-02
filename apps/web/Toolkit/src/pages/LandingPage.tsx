import { useState, useEffect } from "react";
import heroBg from "@assets/image_1783014770940.png";
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
    --mono:  'IBM Plex Mono', ui-monospace, monospace;
    --serif: 'Inter', system-ui, -apple-system, sans-serif;
    --sans:  'Inter', system-ui, -apple-system, sans-serif;
    background: var(--ink); color: var(--body);
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
    padding: 104px 0 64px; position: relative;
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
    line-height: 1.12; letter-spacing: -0.035em; color: #ffffff; font-weight: 700;
    max-width: min(60rem, 100%); margin-bottom: 32px;
  }
  .okiru-root .ok-h1-gradient {
    display: block; margin-top: 6px;
    background: var(--grad-text);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  .okiru-root .ok-hero-sub {
    max-width: min(44rem, 100%); font-size: 16px; color: rgba(255,255,255,0.75);
    line-height: 1.8; font-weight: 400; margin-bottom: 44px;
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

  /* ── SHARED SECTION STYLES ── */
  .okiru-root .ok-section { padding: 96px 0; border-bottom: 1px solid var(--rule); }
  .okiru-root .ok-section.ok-page-top { padding-top: 140px; }
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
    background: rgba(255,255,255,0.015); position: relative; overflow: hidden; transition: background .3s;
  }
  .okiru-root .ok-challenge-card:hover { background: rgba(99,102,241,0.04); }
  .okiru-root .ok-challenge-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--grad-h); opacity: 0.7;
  }
  .okiru-root .ok-challenge-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #06b6d4; margin-bottom: 14px; display: block; }
  .okiru-root .ok-challenge-title { font-family: var(--serif); font-size: 1.3rem; color: var(--hi); font-weight: 400; letter-spacing: -0.02em; margin-bottom: 10px; }
  .okiru-root .ok-challenge-stat { font-family: var(--serif); font-weight: 700; font-size: 2.4rem; color: var(--hi); letter-spacing: -0.04em; margin-bottom: 4px; line-height: 1; }
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
  .okiru-root .ok-about-badge-val { font-family: var(--serif); font-weight: 700; font-size: 1.8rem; color: var(--hi); letter-spacing: -0.03em; line-height: 1; }
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
  .okiru-root .ok-toolkit-items li::before { content: '—'; color: rgba(6,182,212,.4); flex-shrink: 0; }
  .okiru-root .ok-toolkit-bullet { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: rgba(255,255,255,.75); margin-bottom: 10px; }
  .okiru-root .ok-toolkit-dot { width: 5px; height: 5px; border-radius: 50%; background: #06b6d4; box-shadow: 0 0 8px rgba(6,182,212,.6); flex-shrink: 0; margin-top: 8px; }

  /* ── SECTION 06: ARCHITECTURE ── */
  .okiru-root .ok-arch-layers { display: flex; flex-direction: column; gap: 2px; margin-top: 56px; }
  .okiru-root .ok-arch-layer { display: grid; grid-template-columns: 80px 1fr 1fr; gap: 0; border: 1px solid var(--rule); background: rgba(255,255,255,0.015); transition: background .3s; }
  .okiru-root .ok-arch-layer:hover { background: rgba(99,102,241,0.03); }
  .okiru-root .ok-arch-num-col { display: flex; align-items: center; justify-content: center; border-right: 1px solid var(--rule); padding: 32px 16px; font-family: var(--serif); font-weight: 700; font-size: 2.2rem; color: rgba(255,255,255,.15); letter-spacing: -0.04em; }
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
  .okiru-root .ok-outcome-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--rule); font-family: var(--serif); font-size: 13.5px; color: rgba(255,255,255,.4); }

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
  .okiru-root .ok-foot-wm { font-family: var(--serif); font-size: 15px; color: var(--muted); display: inline-flex; align-items: center; gap: 10px; }
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
    .okiru-root .ok-foot-grid { grid-template-columns: 1fr; }
    .okiru-root .ok-vs-edge-body { padding: 22px 24px; }
    .okiru-root .ok-vs-edge-num { padding: 22px 12px; }
    .okiru-root .ok-modal { max-width: calc(100vw - 32px); }
    .okiru-root .ok-modal-head { padding: 24px 24px 0; }
    .okiru-root .ok-modal-body { padding: 20px 24px 24px; }
  }
  @media (max-width: 480px) {
    .okiru-root .ok-h1 { font-size: 2.2rem; }
    .okiru-root .ok-section { padding: 52px 0; }
    .okiru-root .ok-section.ok-page-top { padding-top: 96px; }
    .okiru-root .ok-hero-btns { flex-direction: column; align-items: stretch; }
    .okiru-root .ok-btn-cta, .okiru-root .ok-btn-sec { width: 100%; justify-content: center; }
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

  const openDemo = () => setDemoOpen(true);
  // Wire the marketing "Get started" CTA to the register flow (falls back to the
  // shared auth screen, where "Create account" is still reachable, if the host
  // didn't pass a register handler).
  const goRegister = () => (onNavigateRegister ?? onNavigateAuth)();

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
          <div className="ok-w" style={{ position:"relative", zIndex:1, width:"100%" }}>
            <h1 className="ok-h1 ok-anim-2">
              Stop ticking boxes.<br />
              <span className="ok-h1-gradient">Start compounding growth.</span>
            </h1>
            <p className="ok-hero-sub ok-anim-3">
              South African transformation, made measurable. We turn
              <strong> ESG, B-BBEE &amp; Skills Development</strong> from once-a-year
              box-ticking into audit-grade progress that compounds &mdash; one toolkit,
              every framework, Net-Zero ready.
            </p>
            <div className="ok-hero-btns ok-anim-4">
              <button className="ok-btn-cta" onClick={goRegister}>
                Get started <span className="arr"><ArrowRight size={14} /></span>
              </button>
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

        {/* ── 03: OUR PRODUCTS ── */}
        <section className="ok-section" id="sec-products">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">03</span>
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

        {/* ── 04: FRAMEWORKS ── */}
        <section className="ok-section" id="sec-frameworks">
          <div className="ok-w">
            <Reveal>
              <span className="ok-sec-num">04</span>
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

      </main>

      <SiteFooter onNavigateAuth={onNavigateAuth} />
    </div>
  );
}
