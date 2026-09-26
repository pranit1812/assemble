# Assemble API contract

All JSON. Money = integer pence. Base URL = the VM's public URL (local dev: http://localhost:5173 via Vite proxy → :3001).
Types referenced here live in `shared/genui.ts` (Block, Option, PlanEvent). Tables in `server/schema.sql`.

## Shopper (no auth; name cookie optional)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | /api/goals | `{text, image?: dataURL, userName?}` | `{goal:{id,title}, blocks: Block[]}` (AgentNote + ClarifyCards) |
| POST | /api/goals/:id/plan | `{answers: Record<string, string \| string[]>}` | **NDJSON stream** of `PlanEvent`, last is `{t:'blocks'}` |
| GET | /api/goals/:id | – | `{goal, blocks}` |
| POST | /api/goals/:id/pick | `{componentId, optionId}` | `{blocks}` (recomposed) |
| POST | /api/goals/:id/acquire | `{componentId, acquired}` | `{blocks, allAcquired}` |
| GET | /api/goals/:id/assembly | – | `{blocks: [AssemblyView, GuideCard...]}` |
| GET | /api/kits | – | live kits `[{slug,title,tagline,accent,emoji}]` |
| GET | /api/kits/:slug | – | `{kit, items:[{ref,title,pricePence,tag,source,note}]}` (live only; `?preview=1` shows pending) |

## Merchant portal (/admin, passcode cookie)
| GET | /api/admin/merchants | – | merchants (no api keys except own) |
| GET | /api/admin/demand?merchantId= | – | `{trending:[{label,count,areas}], unmet:[{label,count,area}], spark:[{hour,count}], total}` |
| GET | /api/admin/products?merchantId= | – | products |
| POST | /api/admin/products | `{merchantId,title,description,pricePence,tags[],kind,stock}` | product |
| PATCH | /api/admin/merchants/:id | `{walkIn?: boolean, webhookUrl?}` | merchant |
| GET | /api/admin/briefs | – | open briefs |
| POST | /api/admin/briefs/:id/offers | `{merchantId, pricePence, note}` | offer |
| GET | /api/admin/events?type= | – | last 50 events (webhook log) |

## Public merchant API (header `Authorization: Bearer <merchant api_key>`)
| POST | /v1/catalog | `{title, price (pounds) or pricePence, tags[], kind?, stock?, description?}` | product (appears in the next search) |
| GET | /v1/demand | – | same shape as /api/admin/demand for that merchant |
Webhook `lead.won` fires when a shopper marks one of your items acquired: logged to `events`, and POSTed to `webhook_url` if set.

## Ops (Grok bots + /ops; header `Authorization: Bearer $OPS_KEY`, reads are open)
| GET | /api/ops/insights | – | `{topGoals:[{label,count}], unmet:[{label,count,area}], recentGoals:[...]}` |
| GET | /api/ops/search?tag=cape | – | catalogue items for a tag across products/listings/guides `[{ref,title,pricePence,route,source}]` |
| GET | /api/ops/tasks | – | tasks, newest first |
| POST | /api/ops/tasks | `{agent,title,detail?,status?}` | task |
| PATCH | /api/ops/tasks/:id | `{status?,detail?,result?}` | task |
| GET | /api/ops/kits | – | all kits |
| POST | /api/ops/kits | `{slug,title,tagline,description,accent?,emoji?,items:[{ref,note?}]}` | kit (status `pending`) |
| POST | /api/ops/kits/:id/approve | – | kit (status `live`) |
