<img src="assets/icon.svg" width="64" height="64" alt="">

# Seatwise

An AI course planner for USC students, delivered as an MCP server you connect to Claude or ChatGPT.

Tell your assistant what you want to study. Seatwise finds classes you can actually take (major and
school restrictions, prerequisites, D-clearance), builds schedules without time conflicts, and checks
seat availability, all from the public USC Schedule of Classes.

> Not affiliated with or endorsed by the University of Southern California.

## Layout

| Path | What |
| --- | --- |
| `packages/core` | USC Schedule of Classes client, eligibility checks, schedule builder |
| `apps/mcp` | MCP server (stdio and Streamable HTTP) |
| `apps/web` | Landing page (Astro) |
| `docs/usc-api.md` | Notes on the undocumented classes.usc.edu API |

## Development

```sh
npm install
npm run build
npm test
npm run dev:mcp   # MCP server over HTTP
npm run dev:web   # landing page
```
