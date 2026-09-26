# Working on Assemble (hackathon rules)

**`main` is the live site.** Anything merged to `main` goes live in about 40 seconds.
So nobody pushes to `main` directly. Branch, open a PR, and Pranit merges.

## Get it running (2 minutes)

```bash
npm ci
npm run seed      # fresh demo data
npm run dev       # site on http://localhost:5173, API on :3001
```

No keys are needed. Without an LLM key the AI falls back to rules and the three homepage prompts still work.

## Before you open a PR

```bash
npm run check     # types + production build
npm run smoke     # runs the 3 demo flows against your local dev server
```

Both must pass. GitHub runs the same checks on your PR. Never point `smoke` at the live URL: it creates real requests that shops would see.

## Where you can work

| Safe to change | Ask first | Don't touch |
|---|---|---|
| `web/src/pages/*` (layout, copy, styling) | `web/src/components/genui/Blocks.tsx` (the plan cards) | `shared/genui.ts` (the contract between AI and UI) |
| `web/src/index.css` (only by reusing tokens) | `web/src/pages/Home.tsx` flow logic | `server/`, `seed/`, `deploy/`, `.env` |
| New components under `web/src/components/` | Anything in `web/src/lib/api.ts` | |

## The look (keep it minimal)

The storefront (`/`) is the reference. Every other page should feel like it.

- **One font:** General Sans. Headings use `.font-display`; numbers use `.font-mono`.
- **Colours:** only the tokens in `index.css`: paper, card, ink, muted, faint, line, and accent. No new colours.
- **Less stuff:** one job per screen, lots of white space, no card inside a card, no badges for decoration. If in doubt, delete it.
- **Motion:** use the existing `rise` animation for things appearing. Nothing loops or bounces.
- **Phones:** check at 390 px wide. No sideways scrolling.

## Pages

| URL | Who it's for |
|---|---|
| `/` | Shoppers: the whole product lives here |
| `/admin` | Local shops: answer requests from nearby shoppers and manage stock (passcode `fleek`) |
| `/owner` | Pranit: shops, shoppers, what people want, what the bots did |
| `/ops` | The Grok bots' task board (linked from `/owner`) |
| `/sell` | Neighbours listing things to sell or lend (secondary) |

How it all connects: [docs/agent-map.md](docs/agent-map.md).

## Timeline (Sat 26 Sep)

| Time | What happens |
|---|---|
| 15:30 | Feature freeze: last merges. The live site is then locked. |
| 15:45 | Record the backup demo video |
| 16:15 | Live URL submitted |
| 16:30 | Code freeze |
