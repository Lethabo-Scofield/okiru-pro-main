---
name: Sim Design Language
version: 1.0.0
package: "@adilm-param-solutions/ui"
colors:
  primary: "hsl(149, 21.6%, 51.2%)"
  primary-foreground: "hsl(0, 0%, 100%)"
  secondary: "hsl(152, 20.2%, 31%)"
  secondary-foreground: "hsl(0, 0%, 100%)"
  destructive: "hsl(0, 84.2%, 60.2%)"
  destructive-foreground: "hsl(0, 0%, 98%)"
  accent: "hsl(90, 10%, 92%)"
  accent-foreground: "hsl(152, 20.2%, 31%)"
  muted: "hsl(90, 10%, 92%)"
  muted-foreground: "hsl(152, 15%, 45%)"
  surface: "#ffffff"
  on-surface: "#737373"
  on-surface-strong: "#171717"
  background: "#fafafa"
  status-success: "#6a9b82"
  status-success-bg: "#e2e8e0"
  status-warning: "#ff6600"
  status-warning-bg: "#fff3e8"
  status-error: "#ef4444"
  status-error-bg: "#fef2f2"
  status-info: "#336699"
  status-info-bg: "#eff6ff"
  neutral-50: "#fafafa"
  neutral-500: "#737373"
  neutral-900: "#171717"
  neutral-950: "#0a0a0a"
typography:
  display:
    fontFamily: "Season, system-ui, -apple-system, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 68px
    letterSpacing: -2px
  h1:
    fontFamily: "Season, system-ui, -apple-system, sans-serif"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 52px
    letterSpacing: -1.5px
  h3:
    fontFamily: "Season, system-ui, -apple-system, sans-serif"
    fontSize: 27px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1px
  body-md:
    fontFamily: "Season, system-ui, -apple-system, sans-serif"
    fontSize: 15px
    fontWeight: 450
    lineHeight: 24px
    letterSpacing: 0
  body-sm:
    fontFamily: "Season, system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 450
    lineHeight: 18px
    letterSpacing: 0
  caption:
    fontFamily: "Season, system-ui, -apple-system, sans-serif"
    fontSize: 11px
    fontWeight: 450
    lineHeight: 16px
    letterSpacing: 0.5px
  mono:
    fontFamily: "JetBrains Mono, Roboto Mono, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 32px
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
elevation:
  1: "0 1px 2px 0 rgba(0,0,0,0.05)"
  2: "0 1px 3px 0 rgba(0,0,0,0.1)"
  4: "0 10px 15px -3px rgba(0,0,0,0.1)"
  6: "0 25px 50px -12px rgba(0,0,0,0.25)"
motion:
  duration-xs: 100ms
  duration-sm: 150ms
  duration-base: 200ms
  duration-md: 300ms
  easing-standard: "cubic-bezier(0.4, 0, 0.2, 1)"
  easing-spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  easing-out: "ease-out"
breakpoints:
  sm: 640px
  md: 768px
  lg: 1024px
  xl: 1280px
---

# Sim Design Language

## Overview

A professional, data-dense, yet minimalist platform for building AI workflows. The visual identity is semi-monochromatic with semantic color highlights: green for agents, blue for triggers, orange for actions. Every surface is optimized for complex dashboards and canvas-based editing.

The component library is published as `@adilm-param-solutions/ui` on NPM. All UI generation should import components from this package and adhere to the tokens defined above.

## Colors

- **Primary** (`hsl(149, 21.6%, 51.2%)`): Brand green. Used for CTAs, active navigation states, connector points, and agent indicators.
- **Secondary** (`hsl(152, 20.2%, 31%)`): Darker green. Supporting actions, sidebar highlights, selected states.
- **Destructive** (`hsl(0, 84.2%, 60.2%)`): Red. Delete actions, error states, destructive confirmations.
- **Accent** (`hsl(90, 10%, 92%)`): Warm off-white. Hover backgrounds, chip fills, subtle highlights.
- **Muted** (`hsl(90, 10%, 92%)`): Identical to accent for backgrounds; its foreground (`hsl(152, 15%, 45%)`) is a muted green for secondary text.

### Status Colors

Status colors have strict semantic meaning and must never be used decoratively:

- **Success** (`#6a9b82` on `#e2e8e0`): Completed executions, connected states, passing validations.
- **Warning** (`#ff6600` on `#fff3e8`): Pending actions, rate limits, degraded states.
- **Error** (`#ef4444` on `#fef2f2`): Failed executions, validation errors, disconnected states.
- **Info** (`#336699` on `#eff6ff`): Informational badges, documentation links, neutral system messages.

### Neutral Scale

The neutral scale anchors all text and surface contrast:

- `neutral-50` (`#fafafa`): Page backgrounds, empty canvas areas.
- `neutral-500` (`#737373`): Default body text for all data-dense content.
- `neutral-900` (`#171717`): Headlines, titles, strong emphasis.
- `neutral-950` (`#0a0a0a`): Maximum contrast, used sparingly for critical labels.

## Typography

- **Headlines**: Season, semi-bold (600). Tight negative letter-spacing for density. Used for page titles and section headers only.
- **Body**: Season, normal (450), 15px. The workhorse style for all dashboard content, form labels, and descriptions.
- **Small/Caption**: Season, 11–13px. Used for metadata, timestamps, status labels, and breadcrumbs.
- **Monospace**: JetBrains Mono for code blocks, API keys, JSON displays, and technical identifiers.

The modular scale ratio is `1.125`. Do not introduce intermediate sizes outside the defined scale.

## Spacing

All spacing is based on a `4px` base unit. Components use multiples of this unit exclusively:

- Inner padding: `16px` (4 units)
- Component gap: `8px` (2 units)
- Section margin: `12px` (3 units)

Do not use arbitrary pixel values. Every dimension should resolve to a multiple of 4px.

## Components

### Buttons

- Border radius: `8px` (rounded-md)
- Primary variant: Brand green fill with white text
- Link variant: Inherits `primary` color with underline-offset, no background
- Sizing: `default` (h-10), `sm` (h-8), `lg` (h-12), `icon` (h-10 w-10)

### Cards

- No elevation by default. Rely on `1px solid var(--border)` and background contrast.
- Hover state adds `elevation-2` shadow.
- Internal padding: `16px`.

### Workflow Blocks (Canvas)

- Border radius: `8px`
- Border: `1px solid var(--border)`
- Interactive hover: adds `elevation-2` and `border-brand`
- Connector points: `8px` circles filled with `primary`

### Action Panels (Sidebars)

- Fixed width: `384px`
- Background: `surface` (`#ffffff`)
- Internal padding: `16px`
- Section dividers: `1px solid var(--border-muted)`

### Inputs

- Height: `40px` (h-10)
- Border: `1px solid var(--input)`
- Background: subtle surface-variant
- Focus ring: `2px` ring using `--ring` token

### Boolean Controls (Checkbox, Switch)

- Use Radix UI primitives
- Event handler: `onCheckedChange` (not `onChange`)
- Sizing: `16px` (checkbox), `44px × 24px` (switch track)

## Animations

- Hover feedback: `150ms` with standard easing
- Modal open/close: `300ms` with standard easing
- Micro-interactions (checkboxes, toggles): `100ms`
- Bouncy interactions (drag-drop snap): `200ms` with spring easing

Do not add animations longer than `300ms`. The interface should feel instant.

## Do's and Don'ts

- **Do** use status colors strictly for their semantic meaning (success, warning, error, info)
- **Do** maintain the 4px spacing grid for all layout decisions
- **Do** use `@adilm-param-solutions/ui` components — never build raw HTML equivalents
- **Do** keep information density high; this is a power-user tool, not a landing page
- **Don't** hard-code colors like `text-blue-500`. Always use semantic tokens (`text-status-info`, `bg-status-success-background`)
- **Don't** mix rounded and sharp corners in the same view
- **Don't** use elevation above level 2 for persistent UI elements (cards, panels)
- **Don't** introduce fonts outside the Season / JetBrains Mono stack
