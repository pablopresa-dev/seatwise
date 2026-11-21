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

### Use it locally with Claude Code

```sh
npm run build
claude mcp add seatwise -- node apps/mcp/dist/stdio.js
```

## Deployment (Vercel)

One Vercel project serves both the landing page and the MCP endpoint, configured by `vercel.json`:

- `apps/web/dist` is the static site.
- `api/mcp.ts` is a Vercel Function, rewritten to `/mcp` (stateless Streamable HTTP, POST only).
- `api/healthz.ts` is rewritten to `/healthz`.

Import the repository in Vercel with the repository root as the root directory. No environment
variables or secrets are needed. After adding a domain, update `MCP_URL` in `apps/web/src/config.ts`
and `site` in `apps/web/astro.config.mjs`.
