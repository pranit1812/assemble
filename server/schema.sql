-- Single SQLite file: data/assemble.db. JSON columns are TEXT holding JSON.
-- Money is always integer pence. Times are ISO strings.

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,               -- 'online' | 'local'
  category TEXT NOT NULL,           -- costume | craft | maker | party | fabric | garden | hardware
  area TEXT, address TEXT, email TEXT, hours TEXT, blurb TEXT,
  lat REAL, lng REAL,               -- London coordinates (mocked)
  walk_in INTEGER NOT NULL DEFAULT 0,
  api_key TEXT UNIQUE,
  webhook_url TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  title TEXT NOT NULL,
  description TEXT,
  price_pence INTEGER NOT NULL,
  tags TEXT NOT NULL,               -- JSON string[] from shared/tags.ts
  kind TEXT NOT NULL,               -- 'complete' | 'part' | 'material' | 'tool'
  stock INTEGER NOT NULL DEFAULT 10,
  eta_days REAL NOT NULL DEFAULT 2, -- online delivery; local = 0
  guide_id TEXT,                    -- merchant-attached guide
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (          -- secondhand, people nearby
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price_pence INTEGER NOT NULL,
  tags TEXT NOT NULL,
  condition TEXT,                   -- 'like new' | 'good' | 'worn'
  seller TEXT, area TEXT,
  lat REAL NOT NULL, lng REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,                 -- null = community guide
  title TEXT NOT NULL,
  tags TEXT NOT NULL,
  difficulty TEXT NOT NULL,         -- easy | medium | hard
  minutes INTEGER NOT NULL,
  cost_pence INTEGER NOT NULL DEFAULT 0, -- materials if you have nothing
  materials TEXT NOT NULL,          -- JSON string[]
  steps TEXT NOT NULL               -- JSON string[]
);

CREATE TABLE IF NOT EXISTS recipes (           -- house decompositions, retrieved as LLM context
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  match TEXT NOT NULL,              -- JSON string[] keywords
  whole_tag TEXT,                   -- tag for "buy the complete thing" products
  components TEXT NOT NULL          -- JSON [{id,name,tag,tags,note}]
);

CREATE TABLE IF NOT EXISTS goals (             -- one shopper request
  id TEXT PRIMARY KEY,
  user_name TEXT,
  text TEXT NOT NULL,
  title TEXT,
  recipe_id TEXT,
  area TEXT DEFAULT 'Hackney',
  lat REAL, lng REAL,
  answers TEXT,                     -- JSON
  budget_pence INTEGER,
  deadline TEXT,
  blocks TEXT,                      -- JSON Block[] (latest plan)
  status TEXT NOT NULL DEFAULT 'clarifying', -- clarifying | planned | assembled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS components (
  id TEXT NOT NULL,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  tags TEXT NOT NULL,
  pick TEXT,                        -- JSON Option
  acquired INTEGER NOT NULL DEFAULT 0,
  unmet INTEGER NOT NULL DEFAULT 0, -- no local/secondhand stock
  PRIMARY KEY (goal_id, id)
);

CREATE TABLE IF NOT EXISTS briefs (            -- unmet parts, open to merchants
  id TEXT PRIMARY KEY,
  goal_id TEXT, component TEXT NOT NULL, tag TEXT NOT NULL,
  area TEXT, budget_pence INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES briefs(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  price_pence INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kits (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  accent TEXT DEFAULT '#c2410c',
  emoji TEXT,
  items TEXT NOT NULL,              -- JSON [{ref:"product:p1"|"listing:s1"|"guide:g1", note}]
  status TEXT NOT NULL DEFAULT 'pending', -- pending | live
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (             -- the one agent queue / board
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,              -- 'Demand analyst' | 'Kit builder' | 'Orchestrator' ...
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | needs_approval | done | failed
  detail TEXT,
  result TEXT,                      -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (            -- demand signal + webhook log
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,               -- goal.created | component.unmet | lead.won | product.created
  area TEXT,
  label TEXT,                       -- goal title or part name
  merchant_id TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llm_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
