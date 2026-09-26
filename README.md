# Assemble — mindful, goal-based buying

Tell it a goal, not a product. Agents break it into parts and find the most mindful route for each:
own / DIY → secondhand nearby → local shop walk-in → buy parts → buy new. Merchants pay for demand, never for ranking.

- Shopper: `/` · Merchant portal: `/admin` · Ops board (Grok bots): `/ops`
- Contracts: `shared/genui.ts` (gen-UI zod), `server/schema.sql`, `API.md`
- Dev: `npm run dev` (web :5173, api :3001) · Seed: `npm run seed`
- VM: `bash deploy/deploy.sh --force` then `bash deploy/install-autodeploy.sh`
