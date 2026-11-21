# Product

<!-- impeccable:product-schema 1 -->

> Written by an agent from the owner's written brief (no live interview was possible in that session).
> Every fact below comes from that brief or the repository; nothing is invented. Items marked
> **(open)** are undecided.

## Platform

web

## Stack

Astro (static output), plain CSS and vanilla JS, no extra dependencies. Lives in `apps/web` of an
npm-workspaces monorepo; `packages/core` and `apps/mcp` hold the actual product.

## Users

- USC undergraduates, graduate students, and exchange / visiting students.
- Situation: before and during registration (for Spring 2027, add/drop runs mid-January 2027), trying to
  work out which classes they can actually take and how to fit them into a week. Exchange and visiting
  students in particular lack the insider knowledge of restrictions, D-clearance and GE rules.
- Job on the landing page: understand in seconds what Seatwise is, trust it, and connect it to the AI
  they already use (Claude or ChatGPT).

## Product Purpose

Seatwise is an open-source AI course planner delivered as an MCP server, not a web app. Students connect
it to their own AI chat. The AI does the reasoning; Seatwise supplies accurate data from USC's public
Schedule of Classes. Success for the landing page: a student copies the connector URL and adds it to
their assistant.

## Positioning

Not another tab, site, or browser extension. It works inside the chat the student already uses, and
answers with real section data (restrictions, prerequisites, D-clearance, times, seats) instead of a
general model's guesses.

## Operating Context

- Claude: Settings → Connectors → Add custom connector → paste the server URL.
- ChatGPT: apps / connectors via developer mode (custom MCP).
- Developers: run locally over stdio in Claude Code or Claude Desktop (GitHub repo).
- Registration itself still happens in USC's WebReg. Students may paste or upload a STARS
  degree-progress report or transcript into the chat.

## Capabilities and Constraints

Available:
- Understands what the student wants to study.
- Finds classes they can actually take: major / school restrictions, prerequisites, D-clearance needed.
- Builds conflict-free schedules that respect constraints (no 8am, Fridays off, max units).
- Reads a STARS report or transcript pasted/uploaded in the chat to know what is completed.
- Checks live seat availability.

Coming soon:
- Email seat alerts when a full section opens. Not on the page until the backend exists.

Constraints:
- Server URL is a placeholder: `https://mcp.seatwise.app/mcp` **(open: final URL)**.
- GitHub repository URL is a placeholder **(open)**.
- Data may lag WebReg slightly.

## Brand Commitments

- Name: Seatwise. Copy in English.
- Must not look official or affiliated: no USC logos, no Trojan imagery, no cardinal-and-gold palette.
  Footer disclaimer, verbatim: "Not affiliated with or endorsed by the University of Southern California."
- Owner requirement: must look genuinely designed, not like a generic AI-generated site.
- Open source, MIT license.

## Evidence on Hand

- No testimonials, user counts, press, or benchmarks exist. Do not fabricate any.
- Real public data source: classes.usc.edu (see `docs/usc-api.md`); real course codes such as CSCI 270,
  CSCI 353, WRIT 150 may be used in illustrative examples, labeled as examples.

## Product Principles

1. Meet students where they already are; never ask them to adopt a new app.
2. Accuracy over cleverness: the AI reasons, the data must be right, and limits (lag vs WebReg) are said out loud.
3. Privacy by construction: never asks for NetID or password, uses only public data, stores no academic records.
4. Honest about what exists: shipped features are stated plainly, coming-soon features are labeled as such.

## Accessibility & Inclusion

WCAG AA contrast, full keyboard use, visible focus, reduced-motion support; many readers are
international students reading in a second language, so copy stays plain and concrete.
