---
name: Agitation Newsprint & Action Press
colors:
  surface: '#faf8ff'
  surface-dim: '#dad9e1'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fa'
  surface-container: '#efedf5'
  surface-container-high: '#e9e7ef'
  surface-container-highest: '#e3e1e9'
  on-surface: '#1a1b21'
  on-surface-variant: '#3b4a3d'
  inverse-surface: '#2f3036'
  inverse-on-surface: '#f1f0f7'
  outline: '#6b7b6c'
  outline-variant: '#bacbb9'
  surface-tint: '#006d34'
  primary: '#006d34'
  on-primary: '#ffffff'
  primary-container: '#00e876'
  on-primary-container: '#00622e'
  inverse-primary: '#00e474'
  secondary: '#b90038'
  on-secondary: '#ffffff'
  secondary-container: '#e4164a'
  on-secondary-container: '#fffbff'
  tertiary: '#735c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#f3c504'
  on-tertiary-container: '#675300'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#62ff95'
  primary-fixed-dim: '#00e474'
  on-primary-fixed: '#00210b'
  on-primary-fixed-variant: '#005226'
  secondary-fixed: '#ffdadb'
  secondary-fixed-dim: '#ffb2b7'
  on-secondary-fixed: '#40000d'
  on-secondary-fixed-variant: '#92002a'
  tertiary-fixed: '#ffe083'
  tertiary-fixed-dim: '#eec200'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#574500'
  background: '#faf8ff'
  on-background: '#1a1b21'
  surface-variant: '#e3e1e9'
typography:
  display-xl:
    fontFamily: Bebas Neue
    fontSize: 96px
    fontWeight: '400'
    lineHeight: 88px
    letterSpacing: 0.02em
  display-xl-mobile:
    fontFamily: Bebas Neue
    fontSize: 56px
    fontWeight: '400'
    lineHeight: 52px
    letterSpacing: 0.02em
  display-lg:
    fontFamily: Bebas Neue
    fontSize: 64px
    fontWeight: '400'
    lineHeight: 60px
    letterSpacing: 0.02em
  display-lg-mobile:
    fontFamily: Bebas Neue
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 38px
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: Syne
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Syne
    fontSize: 26px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Syne
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-code:
    fontFamily: Space Mono
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-ticker:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.08em
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
This design system pairs the urgency of tactical agitprop printmaking with precise civic organizing utility. It evokes illicit street wheat-pasting, underground broadsheet newspapers, high-visibility hazard markings, and physical dispatch terminals. The target audience includes grassroots organizers, whistleblowers, digital agitators, and civic participants who need direct access to assembly alerts, target briefings, and mutual aid dispatches without corporate SaaS friction.

The aesthetic leans strictly into **Tactile Brutalism & High-Contrast Agitprop Press**:
- Heavy graphic containment using unyielding ink lines.
- Pure mechanical hard-offset drop shadows (zero-blur tactile extrusion).
- High visual tension created between high-voltage warning tones (Electric Acid Green, Protest Crimson, Hazard Yellow) and the quiet texture of raw unbleached newsprint.
- Monospaced field-intelligence stamps directly colliding with massive condensed protest display titles.

## Colors
The color architecture relies on high-contrast operational roles derived from newsprint ink and emergency street graphics.

- **Primary Accent (`#00E876` - Electric Acid Green):** Reserved for direct tactical triggers, confirmation states, mobilization calls, and energetic focus indicators.
- **Secondary Urgent (`#E11148` - Protest Crimson):** Deployed for direct action targets, cut-off milestones, countdown terminations, high-priority strike alerts, and disruptive actions.
- **Tertiary Attention (`#FACC15` - Hazard Yellow):** Signifies advisory checkpoints, security advisories, cautionary legal alerts, and highlight placards.
- **Neutral Deep Ink (`#090A0F`):** The master anchor for all typography, 2px/3px structural borders, and rigid drop shadows. Pure digital black is avoided in favor of dense newsprint ink.
- **Neutral Light (`#FAF7F0` - Unbleached Newsprint):** The global default canvas tone. Provides an analog paper feel that eliminates sterile clinical white space.
- **Pure Canvas (`#FFFFFF`):** High-contrast surface fill for input fields, data placards, and critical readability cards against the newsprint canvas.
- **Muted Structural Borders (`#D8D2C4`):** Secondary interior rules, column breaks, and inactive table dividers.
- **Inverse Ground (`#1E2028` - Slate Dark):** Deployed selectively for night-dispatch modes, blackout manifests, and terminal footer blocks.

## Typography
Typographic scale mirrors the hierarchy of agitational broadsheets and protest flyers:

- **Agitation Display (`Bebas Neue`):** Always transformed to `text-transform: uppercase`. Used for main slogans, primary counts, and high-impact calls to mobilize. Tightly tracked and stacked with negative line leading to produce solid ink walls.
- **Editorial Subheadings (`Syne` Heavy):** Delivers sculptural, aggressive gravitas for chapter headings, investigative targets, and manifesto section headers.
- **Operational Utility (`Inter`):** Clear, objective, highly legible sans-serif for explanatory statements, petition copy, instructions, and interactive form controls.
- **Tactical Metadata (`Space Mono`):** Fixed-width type system for incident timestamps, target ticker counters, lat/long field locations, run numbers, and form field helper badges.

## Layout & Spacing
The layout relies on a rigid **Tactical Broadsheet Grid**:

- **Grid Architecture:** 
  - Mobile (< 768px): 4 columns, 16px gutter, 16px outer margin.
  - Tablet (768px–1024px): 8 columns, 24px gutter, 24px outer margin.
  - Desktop (> 1024px): 12 columns, 24px gutter, 40px outer margin, capped at a maximum width of 1360px.
- **Structural Rules:** Grid channels, cards, and column dividers utilize visible `border-r: 2px solid #090A0F` or `border-r: 1px solid #D8D2C4` dividers to preserve the architectural layout of newspaper columns.
- **Density:** High-density arrangement. Avoid exaggerated empty space; utilize margins strictly to frame content clusters like physical print sections.

## Elevation & Depth
Elevation in this system completely rejects blurred, diffused ambient drop shadows and semi-transparent glass layers. Depth is strictly physical, architectural, and mechanical:

- **Level 0 (Flat Ground):** Base newsprint canvas (`#FAF7F0`) or container plates with zero offset. Outlined via `2px solid #090A0F`.
- **Level 1 (Default Placards & Action Cards):** `box-shadow: 4px 4px 0px #090A0F; border: 2px solid #090A0F`.
- **Level 2 (Active Targets, Alert Banners, Floating Modals):** `box-shadow: 8px 8px 0px #090A0F; border: 3px solid #090A0F`.
- **Level 3 (Pressed / Interactive Activation):** Active and focused controls collapse the shadow offset to `box-shadow: 0px 0px 0px #090A0F; transform: translate(4px, 4px)`.

## Shapes
Geometry is strictly **Sharp (0px radius)** across all elements.

- Zero border radius everywhere: buttons, chips, panels, toast notifications, inputs, and modal dialogues.
- Chamfered cut corners (45-degree clip-paths) can be deployed strictly on tactical status stamps and live action tags to mimic perforated physical punch-cards and stencil badges.
- All boundary dividers must be crisp, hard-edged rectilinear forms.

## Components

### Buttons
- **Primary Action (Mobilize):** Background `#00E876`, color `#090A0F`, border `2px solid #090A0F`, `box-shadow: 4px 4px 0px #090A0F`, font `Space Mono` bold uppercase. On hover: background `#FFFFFF`, text `#090A0F`. On active: `translate(4px, 4px)` with shadow flattened to zero.
- **Urgent Strike Button:** Background `#E11148`, color `#FFFFFF`, border `2px solid #090A0F`, `box-shadow: 4px 4px 0px #090A0F`.
- **Ghost/Tactical Outline:** Background `transparent`, color `#090A0F`, border `2px solid #090A0F`, shadow `2px 2px 0px #090A0F`.

### Status Chips & Badges
- Sharp rectangular containers (`border: 1px solid #090A0F`).
- Padded with `space-xs` vertical and `space-sm` horizontal.
- Typography: `label-ticker` (`Space Mono` uppercase).
- Color treatments:
  - Critical/Disrupted: Background `#E11148`, text `#FFFFFF`.
  - Mobilizing/Active: Background `#00E876`, text `#090A0F`.
  - Warning/Watch: Background `#FACC15`, text `#090A0F`.

### Input Fields & Controls
- **Text Inputs:** Background `#FFFFFF`, border `2px solid #090A0F`, padding `0.75rem 1rem`, font `Inter`. Focus state introduces an inner or outer halo using a solid `box-shadow: 4px 4px 0px #00E876` with a crisp `2px solid #090A0F` perimeter.
- **Checkboxes & Radios:** Rigid 18px × 18px boxes with `2px solid #090A0F`. Selected state renders a solid fill of `#00E876` with an inner hard black cross (`X`) or solid square for radio elements. No circular radios.

### Cards & Action Manifests
- Background `#FFFFFF` or `#FAF7F0`.
- Outer perimeter: `border: 2px solid #090A0F`, `box-shadow: 4px 4px 0px #090A0F`.
- Card Header: Separated by a `2px solid #090A0F` horizontal rule, containing an uppercase `label-code` category tracker and status dot.

### Specialized Agitation Components
- **Breaking Action Banner (Ticker):** Continuous horizontal marquee with high-contrast inverted styling (`background: #090A0F`, `color: #FACC15`), framed by top and bottom `2px solid #090A0F` dividers.
- **Target Dossier Card:** Split dual-column card with a left-hand red strike indicator bar (`border-left: 8px solid #E11148`) detailing financial ties, targeted institutions, and direct grassroots boycott actions.
- **Milestone Counter:** Massive condensed Bebas Neue numbers paired with monospaced label footers, anchored inside a grid frame with hairline interior rules (`#D8D2C4`).