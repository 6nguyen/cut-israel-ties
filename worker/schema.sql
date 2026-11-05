-- D1 schema (docs/prd/action-router.md "Data & contracts"). Re-runnable.
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS actions;
DROP TABLE IF EXISTS goals;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS states;

CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('federal_vote','leadership','state','electoral')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  what_we_want TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('upcoming','active','completed','expired')),
  outcome_note TEXT,
  window_start TEXT,
  window_end TEXT,
  decision_date TEXT,
  priority INTEGER NOT NULL,
  eligibility TEXT NOT NULL,
  our_picks TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  decider TEXT,
  successor_slug TEXT,
  this_week TEXT,
  this_week_date TEXT,
  detail_md TEXT,
  prep_md TEXT,
  partner_url TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE actions (
  id INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('call','letter','public_comment')),
  target_scope TEXT NOT NULL CHECK (target_scope IN ('house','senate','both','state')),
  "order" INTEGER NOT NULL,
  ask_text TEXT NOT NULL,
  form_schema TEXT NOT NULL,
  prompt_template TEXT,
  doc_format TEXT NOT NULL
);

CREATE TABLE members (
  bioguide_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  party TEXT NOT NULL,
  chamber TEXT NOT NULL CHECK (chamber IN ('house','senate')),
  state TEXT NOT NULL,
  district INTEGER,
  dc_phone TEXT,
  district_phone TEXT,
  contact_form_url TEXT,
  hasc INTEGER NOT NULL DEFAULT 0,
  conferee INTEGER NOT NULL DEFAULT 0,
  rc243 TEXT,
  jrd_april_2026 TEXT,
  btb_cosponsor INTEGER NOT NULL DEFAULT 0,
  target_2028 INTEGER NOT NULL DEFAULT 0,
  money_url TEXT
);
CREATE INDEX members_state_district ON members(state, chamber, district);

CREATE TABLE positions (
  id INTEGER PRIMARY KEY,
  bioguide_id TEXT NOT NULL REFERENCES members(bioguide_id),
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  position TEXT NOT NULL CHECK (position IN ('for','uncommitted','against','unknown')),
  source_url TEXT NOT NULL,
  source_date TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT NOT NULL
);

CREATE TABLE states (
  state TEXT PRIMARY KEY,
  treasurer_name TEXT,
  treasurer_phone TEXT,
  decider TEXT,
  israel_bonds_usd INTEGER,
  holdings_date TEXT,
  holdings_source TEXT,
  campaign_name TEXT,
  campaign_url TEXT,
  next_comment_date TEXT
);
-- receipts, reports, generations, screenings, blocks: added by §4.
