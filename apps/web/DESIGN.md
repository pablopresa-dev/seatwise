---
name: Seatwise
description: Wayfinding for your semester, hung on the AI chat you already use.
colors:
  field-magenta: "#d6006f"
  field-vermilion: "#f0502a"
  field-yellow: "#ffc21a"
  field-aqua: "#19b8b0"
  pastel-pink: "#f9b4cf"
  pastel-sky: "#a9dcf2"
  plum-ink: "#22142e"
  on-magenta: "#ffe8f2"
  stucco: "#f1f3f4"
  paper: "#ffffff"
  fg-secondary: "#54485e"
  rule: "#d6d9de"
  bubble: "#eceef1"
  accent-text: "#b0005b"
  night-stucco: "#170f1d"
  night-paper: "#211729"
  night-fg: "#f4edf6"
  night-magenta: "#c00064"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.75rem, 1.5rem + 4.2vw, 5rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.375rem, 1.6rem + 3.2vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.95
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.05
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Cascadia Mono, Consolas, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  gutter: "clamp(1rem, 4vw, 3rem)"
  stripe: "2.75rem"
  section: "clamp(4.5rem, 10vw, 8.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.plum-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "48px"
  button-nav:
    backgroundColor: "{colors.field-yellow}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  sign:
    backgroundColor: "{colors.field-yellow}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "48px"
  tab-selected:
    backgroundColor: "{colors.field-magenta}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "52px"
  tab-plate:
    backgroundColor: "{colors.bubble}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "52px"
  tag:
    backgroundColor: "{colors.field-aqua}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
---

# Design System: Seatwise

## Overview

**Creative North Star: "The Kit of Parts"**

Seatwise does not build a new venue; it dresses one that already exists. The system borrows the logic of 1980s Los Angeles environmental graphics: flat, hot color fields, striped columns and wayfinding signs layered over existing architecture. Here the existing architecture is the student's AI chat, rendered in quiet greyscale, and Seatwise is the colored signage pinned onto it.

Pages are paced as a sequence of whole color fields (magenta, stucco, night, aqua, yellow), each owning a full-width band. Inside a field, content is set like signage: big condensed letters, short plain sentences, one action per sign. There are no gradients, no glass, no soft card shadows; depth comes from color fields abutting each other and from layering signage over neutral surfaces.

**Key Characteristics:**
- Whole-band color fields, never accents sprinkled on a neutral template.
- Condensed heavy display type in sentence case; plain humanist sans for reading.
- Geometric confetti (circle, triangle, square, half-disc, diamond, ring) as a wayfinding key.
- Neutral "existing architecture" (chat, panels) versus colored Seatwise signage pinned to it.
- One authored motion moment per page; everything else answers the user.

## Colors

A full palette of flat, saturated signage colors on a cool stucco ground; field colors are identical in light and dark themes.

### Primary
- **Field Magenta** (field-magenta): the hero field and the brand mark's ground. Carries white or on-magenta text only, never plum ink.

### Secondary
- **Chrome Yellow** (field-yellow): the action sign (connector URL), the nav call to action, and quoted example prompts on night.
- **Signal Aqua** (field-aqua): the privacy band and "data" tags; schedule blocks.
- **Vermilion** (field-vermilion): schedule blocks and "your rules" tags; the half-disc marker. Plum ink text only (white fails contrast).

### Tertiary
- **Pastel Pink** (pastel-pink) and **Pastel Sky** (pastel-sky): secondary schedule blocks, tags and the stripe column; also the "coming soon" link on night.

### Neutral
- **Plum Ink** (plum-ink): all text on colored fields, primary buttons, the night band in light theme.
- **Stucco** (stucco) and **Paper** (paper): page ground and the neutral chat/panel surfaces in light theme; Night Stucco and Night Paper in dark theme.
- **Secondary Text** (fg-secondary), **Rule** (rule), **Bubble** (bubble): supporting text, hairlines, the user's chat bubble.
- **Accent Text** (accent-text): magenta strong enough for text on stucco or paper (step numbers).

### Named Rules
**The Field Rule.** Color arrives as whole bands or whole signs. A field color never appears as a thin accent line, a glow, or a gradient.

**The Neutral Architecture Rule.** Anything that represents the user's AI (chat window, bubbles, tool lines) stays greyscale. Color is reserved for what Seatwise adds.

**The Ink-on-Hot Rule.** Text on yellow, aqua, vermilion, pink and sky is plum ink. Text on magenta is white or on-magenta. Never the reverse.

## Typography

**Display Font:** Barlow Condensed 800 (fallback Arial Narrow)
**Body Font:** Barlow 400/500/600 (fallback system-ui)
**Label/Mono Font:** system monospace, only for the connector URL

**Character:** Barlow descends from California public signage (plates, highway signs, transit), so the condensed cut reads as wayfinding rather than tech. The regular cut keeps body copy warm and plain for students reading in a second language.

### Hierarchy
- **Display** (800, clamp up to 5rem, 0.92): the hero sentence only.
- **Headline** (800, clamp up to 4.5rem, 0.95): one per band; sentence case, balanced, max about 14ch.
- **Title** (800, 1.5–2.125rem, 1–1.05): directory names, rule names, tab labels, sign labels.
- **Body** (400, 1.0625rem, 1.55): prose capped near 36–40rem; ledes at 1.1875rem.
- **Label** (600, 0.9375rem): tags, form labels, button text; never all caps.

### Named Rules
**The Sentence Case Rule.** No all-caps labels, no tracked eyebrows above headings. A heading speaks for itself.

**The Numbers Line Up Rule.** Times, seats and section numbers use tabular figures.

## Layout

Content sits in a 82rem container with a fluid gutter (spacing.gutter). From 900px up, every container is inset on the left by the stripe width (spacing.stripe) so all bands align with the hero's edge column. Bands use generous vertical padding (spacing.section). Two-column splits appear from 900–1024px up and stack below. The page is verified from 360px to wide desktop with no horizontal scroll; wide tables scroll inside their own focusable region.

The hero timetable is a CSS grid of 10-minute rows (8am–5pm) by five day columns, with blocks placed by start and end time. From 1024px up it runs off the right edge of the viewport, like a supergraphic painted past the frame.

## Elevation & Depth

Flat by construction. No box shadows for depth; separation comes from abutting color fields, 1px rules on neutral surfaces, and layering colored signage over greyscale architecture.

### Named Rules
**The Flat Sign Rule.** Signs are flat painted panels. No drop shadows, bevels or glows; if something needs to stand out, give it a field color.

## Shapes

Gently rounded rectangles in three steps: 6px for controls, tags and schedule blocks; 10px for signs and table frames; 16px for chat windows and panels. Wayfinding markers are pure geometry (circle, triangle, square, half-disc, rotated square, ring). Leader lines (2px with a 10px dot) pin tags to the thing they explain. Dashed outlines mean "considered and rejected".

### Named Rules
**The One Key Rule.** Each confetti shape means one thing site-wide (circle: understands, triangle: eligibility, square: schedule rules, half-disc: completed work, diamond: seats, ring: coming soon). Never reuse a shape with a new meaning.

## Components

### Buttons
- **Shape:** gently rounded (6px), min height 44–52px, `touch-action: manipulation`.
- **Primary:** plum ink with white label (button-primary); hover lifts to a lighter plum; press scales to 0.97 over 160ms with a strong ease-out.
- **Nav call to action:** chrome yellow with plum ink (button-nav).
- **Copy button:** two stacked faces (Copy / Copied) cross-fade with a 2px blur and a teal confirm background; a polite live region announces the result.

### Signs
- **The URL sign** (sign): a yellow panel holding a condensed label, a read-only mono field and the copy button. It always stands alone, with nothing competing beside it.

### Inputs / Fields
- **Style:** white field, 2px plum-ink border, 6px radius, magenta caret.
- **Error:** magenta border plus ring, `aria-invalid`, and an inline message that names the fix.

### Tags (signature)
- Flat colored chips with a geometric marker, pinned by a leader line to the chat line they explain; below 1024px the leader shortens and the tag sits inside the chat column. The ring marker on pink means "coming soon".

### Navigation
- White links on magenta, 44px targets, underline on hover; secondary links hide below 640px leaving GitHub and the yellow Connect sign.

### Tabs
- Flat sign plates in condensed 800 (1.5rem), squared at the bottom so they hang from the panel rule. Unselected plates are neutral (bubble); the selected plate is a magenta field with white text. Panels are not cards: a 4px magenta rule, then content on the page ground, with step numerals in condensed 800 at 3rem. WAI-ARIA tabs with arrow, Home and End keys; without JS all panels show.

### Seat strip (signature)
- Twenty identical 3px ticks per section, read by sweeping the row: aqua ticks are open seats, translucent ink ticks are taken. The numeric text always follows ("6 of 19 open", "Full (25 seats)"); the ticks are decorative for assistive tech.

### Stripe band
- The five field colors as equal flat stripes: a vertical column at the hero edge (2.75rem) from 900px up, a horizontal band (0.625–0.875rem) on narrow screens and as a divider at the top of a field band.

### Posted rules
- Trust and policy items hang under a 4px ink rule with a condensed title and plain text; two columns from 900px. No shapes: the geometric key is reserved for capabilities.

### Timetable (signature)
- Day letters as large condensed signage, hours in tabular figures, chosen sections as solid field blocks, rejected sections as dashed outlines, unavailable time as diagonal hatching.

## Do's and Don'ts

### Do:
- **Do** give each band one field color and let it fill the full width.
- **Do** keep the AI's interface greyscale and put color only on Seatwise's additions.
- **Do** label demonstration data as illustrative, and keep the connector URL in one constant.
- **Do** honor `prefers-reduced-motion`: the chat arrival and smooth scrolling switch off; content is visible by default.

### Don't:
- **Don't** use gradients, glass, glows, or soft-shadowed cards.
- **Don't** use cardinal and gold, USC marks, or Trojan imagery; the page must never look official.
- **Don't** put white text on vermilion, yellow, aqua, pink or sky.
- **Don't** add eyebrows, all-caps labels, or numbered section markers; numbers are for real sequences (setup steps) only.
