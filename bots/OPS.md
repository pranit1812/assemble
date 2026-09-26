# Ops manual for Grok bots

```bash
BASE="${BASE:-http://localhost:5173}"   # VM public URL in production. Vite proxies /api to :3001.
OPS_KEY="${OPS_KEY:?set OPS_KEY}"       # server process.env.OPS_KEY
```

Writes (`POST`, `PATCH`) need this header. Reads (`GET`) are open.

```bash
-H "Authorization: Bearer $OPS_KEY"
```

**Rule:** create a task first, PATCH it to running, finish with done + a one-line result.

```bash
# 1. Create
curl -sS -X POST "$BASE/api/ops/tasks" \
  -H "Authorization: Bearer $OPS_KEY" -H "Content-Type: application/json" \
  -d '{"agent":"Demand analyst","title":"Read unmet demand","detail":"Checking insights"}'

# 2. Mark running (use the id from the response)
curl -sS -X PATCH "$BASE/api/ops/tasks/TASK_ID" \
  -H "Authorization: Bearer $OPS_KEY" -H "Content-Type: application/json" \
  -d '{"status":"running"}'

# 3. Finish
curl -sS -X PATCH "$BASE/api/ops/tasks/TASK_ID" \
  -H "Authorization: Bearer $OPS_KEY" -H "Content-Type: application/json" \
  -d '{"status":"done","result":"Top unmet demand near Dalston: red capes (9). Suggest: invite 2 party shops."}'
```

`status` is `queued` | `running` | `needs_approval` | `done` | `failed`. `result` is the one line the /ops board shows.

## Reads

```bash
curl -sS "$BASE/api/ops/tasks"
curl -sS "$BASE/api/ops/insights"
curl -sS "$BASE/api/ops/search?tag=cape"
curl -sS "$BASE/api/ops/events"          # last 20, for the board
curl -sS "$BASE/api/ops/merchants"       # shops bots onboarded (no api keys)
curl -sS "$BASE/api/ops/kits"
```

`insights` is `{topGoals:[{label,count}], unmet:[{label,count,area}], recentGoals:[...]}`. `unmet` is highest count first. Search `tag` must be from `shared/tags.ts`.

## Writes

```bash
curl -sS -X POST "$BASE/api/ops/tasks" \
  -H "Authorization: Bearer $OPS_KEY" -H "Content-Type: application/json" \
  -d '{"agent":"Shop onboarder","title":"Onboard a shop","detail":"optional","status":"queued"}'

curl -sS -X PATCH "$BASE/api/ops/tasks/TASK_ID" \
  -H "Authorization: Bearer $OPS_KEY" -H "Content-Type: application/json" \
  -d '{"status":"running","detail":"optional","result":"optional one line"}'

curl -sS -X POST "$BASE/api/ops/merchants" \
  -H "Authorization: Bearer $OPS_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Rosa'"'"'s Fabrics","category":"fabric","area":"Dalston","address":"12 Kingsland Rd","hours":"9:00-18:00","walkIn":true,"products":[{"title":"Red satin, per metre","pricePence":600,"tags":["red","satin","fabric"],"kind":"material"}]}'

curl -sS -X POST "$BASE/api/ops/kits" \
  -H "Authorization: Bearer $OPS_KEY" -H "Content-Type: application/json" \
  -d '{"slug":"red-cape","title":"Red cape kit","tagline":"Sew it today","description":"Satin, felt, ribbon.","items":[{"ref":"product:PRODUCT_ID","note":"cape cloth"}]}'

curl -sS -X POST "$BASE/api/ops/kits/KIT_ID/approve" \
  -H "Authorization: Bearer $OPS_KEY"
```

Merchant `category`: costume, craft, maker, party, fabric, garden, hardware. Product `kind`: complete, part, material, tool. `pricePence` is integer pence (£6 → 600). `area` is a name or postcode from `shared/areas.ts` (use the name; E8 matches Hackney). Unknown product tags are dropped. `walkIn` defaults to true. The response includes `api_key` — do not read it aloud.
