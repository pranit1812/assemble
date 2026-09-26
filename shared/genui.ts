// THE gen-UI contract. The model never writes UI: it emits JSON that must parse
// against these schemas, and React renders each block type with a fixed component.
// Owner: lead. Do not edit without telling everyone.
import { z } from 'zod';

export const RouteTag = z.enum(['Own', 'DIY', 'Secondhand', 'Local', 'Parts', 'New']);
export type RouteTag = z.infer<typeof RouteTag>;
// Mindful priority order, best first.
export const ROUTE_ORDER: RouteTag[] = ['Own', 'DIY', 'Secondhand', 'Local', 'Parts', 'New'];

export const Option = z.object({
  id: z.string(), // "own:cape" | "guide:g_cape" | "listing:s3" | "product:p12" | "parts:cape"
  tag: RouteTag,
  title: z.string(),
  pricePence: z.number().int().nonnegative(),
  effortMins: z.number().int().nonnegative(), // hands-on time
  etaDays: z.number().nonnegative(), // time until you have it (0 = today)
  source: z.object({
    name: z.string(),
    kind: z.enum(['you', 'community', 'merchant', 'seller']),
    merchantId: z.string().optional(),
    area: z.string().optional(),
    distanceKm: z.number().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  why: z.string(),
  mindful: z.number().int().min(0).max(100),
  feasible: z.boolean().default(true), // false = misses deadline or needs skill they lack
  isNew: z.boolean().optional(), // added to the catalogue in the last hour
  guideId: z.string().optional(),
  productIds: z.array(z.string()).optional(), // for Parts bundles
  makeIt: z.boolean().optional(), // a material you still have to make something from
});
export type Option = z.infer<typeof Option>;

export const ClarifyCard = z.object({
  type: z.literal('ClarifyCard'),
  key: z.string(), // 'budget' | 'deadline' | 'skill' | 'owned' | custom
  question: z.string(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(2).max(6),
  multi: z.boolean().default(false),
});

export const AgentNote = z.object({
  type: z.literal('AgentNote'),
  agent: z.string(), // 'Orchestrator' | 'Judge' | ...
  text: z.string(),
});

export const Breakdown = z.object({
  type: z.literal('Breakdown'),
  goal: z.string(),
  components: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      note: z.string().optional(),
      options: z.array(Option), // sorted best first
      pickId: z.string().nullable(),
      briefOpen: z.boolean().optional(), // no local/secondhand stock -> brief sent to merchants
    }),
  ),
});

// Standalone single option (used by kits / merchant previews).
export const OptionCard = z.object({ type: z.literal('OptionCard'), componentId: z.string(), option: Option });

export const LocalShopCard = z.object({
  type: z.literal('LocalShopCard'),
  shop: z.object({
    id: z.string(),
    name: z.string(),
    address: z.string(),
    area: z.string(),
    distanceKm: z.number(),
    hours: z.string(),
    walkIn: z.boolean(),
    email: z.string(),
  }),
  items: z.array(z.object({ componentId: z.string(), title: z.string(), pricePence: z.number().int() })),
  message: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
});

export const CostCompare = z.object({
  type: z.literal('CostCompare'),
  budgetPence: z.number().int().nullable(),
  rows: z.array(
    z.object({
      label: z.string(), // 'All DIY' | 'Mindful mix' | 'All new'
      totalPence: z.number().int(),
      effortMins: z.number().int(),
      etaDays: z.number(),
      newItems: z.number().int(), // brand-new items bought
      highlight: z.boolean().optional(),
    }),
  ),
});

export const PlanSummary = z.object({
  type: z.literal('PlanSummary'),
  goalId: z.string(),
  title: z.string(),
  budgetPence: z.number().int().nullable(),
  deadline: z.string().nullable(),
  items: z.array(
    z.object({
      componentId: z.string(),
      name: z.string(),
      tag: RouteTag,
      title: z.string(),
      pricePence: z.number().int(),
      acquired: z.boolean(),
    }),
  ),
});

// size meaning by shape: box [w,h,d] · cylinder [radiusTop,height,radiusBottom] ·
// sphere [r,_,_] · cone [r,height,_] · torus [r,tube,_] · plane [w,h,_]
export const AssemblyPart = z.object({
  id: z.string(),
  label: z.string(),
  componentId: z.string().optional(),
  shape: z.enum(['box', 'cylinder', 'sphere', 'cone', 'torus', 'plane']),
  size: z.tuple([z.number(), z.number(), z.number()]),
  pos: z.tuple([z.number(), z.number(), z.number()]), // assembled position
  rot: z.tuple([z.number(), z.number(), z.number()]).optional(), // radians
  explode: z.tuple([z.number(), z.number(), z.number()]).optional(), // offset when exploded
  color: z.string(), // hex
  step: z.number().int(), // which step this part joins (1-based)
});
export type AssemblyPart = z.infer<typeof AssemblyPart>;

export const AssemblyView = z.object({
  type: z.literal('AssemblyView'),
  title: z.string(),
  parts: z.array(AssemblyPart),
  steps: z.array(z.object({ n: z.number().int(), title: z.string(), text: z.string() })),
});

export const GuideCard = z.object({
  type: z.literal('GuideCard'),
  guideId: z.string(),
  title: z.string(),
  author: z.string(), // merchant name or 'Community'
  minutes: z.number().int(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  materials: z.array(z.string()),
  steps: z.array(z.string()),
  componentId: z.string().optional(),
});

// Mocked London map of what's near the shopper. Pins come from real seed coordinates.
export const NearbyMap = z.object({
  type: z.literal('NearbyMap'),
  center: z.tuple([z.number(), z.number()]), // shopper [lat, lng]
  areaLabel: z.string(),
  pins: z.array(
    z.object({
      id: z.string(),
      lat: z.number(),
      lng: z.number(),
      label: z.string(), // shop or seller name
      sub: z.string(), // what they have for you, e.g. "Red cape · £4"
      tag: RouteTag, // Secondhand | Local (colour)
      distanceKm: z.number(),
      componentId: z.string().optional(),
      picked: z.boolean().optional(),
    }),
  ),
});

export const Block = z.discriminatedUnion('type', [
  NearbyMap,
  ClarifyCard,
  AgentNote,
  Breakdown,
  OptionCard,
  LocalShopCard,
  CostCompare,
  PlanSummary,
  AssemblyView,
  GuideCard,
]);
export type Block = z.infer<typeof Block>;
export type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;

// NDJSON events streamed by POST /api/goals/:id/plan
export type PlanEvent =
  | { t: 'status'; agent: string; text: string }
  | { t: 'components'; components: { id: string; name: string; tag: string }[] }
  | { t: 'scout'; componentId: string; route: RouteTag; state: 'run' | 'done'; found: number }
  | { t: 'blocks'; blocks: Block[] }
  | { t: 'error'; message: string };

export const pounds = (p: number) => (p % 100 === 0 ? `£${p / 100}` : `£${(p / 100).toFixed(2)}`);
