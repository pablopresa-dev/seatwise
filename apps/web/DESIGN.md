---
name: Seatwise
description: A short personal page for a student-made USC course planner.
colors:
  bg: "#f6f4f0"
  paper: "#ffffff"
  fg: "#22142e"
  fg-secondary: "#5a5060"
  rule: "#e2ded7"
  accent-raspberry: "#a3175a"
  ok: "#1d6b4f"
  night-bg: "#17121b"
  night-paper: "#211a26"
  night-fg: "#f1ebf3"
  night-accent: "#c2387a"
  night-accent-text: "#f08bb9"
typography:
  prose: "Charter, Iowan Old Style, Sitka Text, Cambria, Georgia, serif (system fonts)"
  ui: "Barlow 400/600 (self-hosted, OFL)"
  mono: "ui-monospace, SF Mono, Cascadia Mono, Consolas"
---

# Seatwise design

## Direction

Since 2026-11-21 the landing is a short personal page, not a product landing page. Two earlier versions (hot
signage colors, then the same structure in calm colors) still read as AI-generated, because the structure was
the template: big hero, feature list with icons, staged fake chat, privacy card grid. The fix was content and
structure, not color.

What makes it read as made by a person:

- **First person.** The page opens with who built it and why (an exchange student who found registration hard).
- **Real output, not a mock.** The example is a verbatim reply from the live server, dated. Replace it with a real
  screenshot of a Claude conversation once one exists.
- **One column of prose.** About 42rem wide, serif body text, sans only for headings and interface labels.
- **Plain lists instead of cards.** What it does, and what it doesn't, as two bulleted lists.
- **Modest type.** The heading is a sentence at about 2.75rem, not a poster.

## Rules

- **One accent.** Raspberry marks the copy button, the active tab and links. Nothing else is colored, except the
  pass/fail tags in the real output.
- **No decoration.** No icons for features, no gradients, no shadows, no color bands, no scroll animations.
- **No invented examples.** Every example on the page is real output, or labeled as a prompt to try.
- **Exact UI labels.** Setup steps name buttons exactly as Claude and ChatGPT show them, in bold sans. Re-check
  them after each app redesign.

## Components

- **URL box** (`UrlSign`): label, read-only mono field, raspberry Copy button that cross-fades to Copied.
- **Tabs**: Claude / ChatGPT / On your computer, underline style, WAI-ARIA tabs with arrow keys.
- **Steps**: numbered list with small ink circles; a step can carry one line of detail in secondary text.
- **Real output** (`.out`): paper panel, mono text, bold course headings, caption with the fetch date.
