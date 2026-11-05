-- D1 schema (docs/prd/action-router.md "Data & contracts"). Re-runnable.
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS generations;
DROP TABLE IF EXISTS screenings;
DROP TABLE IF EXISTS blocks;
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

-- §4 write tables. No document text, no address, no user field is ever stored:
-- generations keeps hashed 8-gram shingles only; screenings keeps the class only.
CREATE TABLE receipts (
  id INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  action_id INTEGER NOT NULL REFERENCES actions(id),
  target_id TEXT NOT NULL,
  state TEXT,
  district INTEGER,
  created_at TEXT NOT NULL,
  device_hash TEXT NOT NULL
);
CREATE INDEX receipts_created ON receipts(created_at);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  bioguide_id TEXT NOT NULL,
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('will_support','undecided','opposed','no_answer','other')),
  note TEXT,
  created_at TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE generations (
  id INTEGER PRIMARY KEY,
  action_id INTEGER NOT NULL REFERENCES actions(id),
  target_id TEXT NOT NULL,
  shingles BLOB NOT NULL,
  created_at TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL
);
CREATE INDEX generations_device ON generations(device_hash, created_at);
CREATE INDEX generations_ip ON generations(ip_hash, created_at);
CREATE INDEX generations_action ON generations(action_id, created_at);

CREATE TABLE screenings (
  id INTEGER PRIMARY KEY,
  device_hash TEXT NOT NULL,
  action_id INTEGER NOT NULL REFERENCES actions(id),
  class TEXT NOT NULL CHECK (class IN ('off_topic','injection','harmful')),
  created_at TEXT NOT NULL
);
CREATE INDEX screenings_device ON screenings(device_hash, created_at);

CREATE TABLE blocks (
  device_hash TEXT PRIMARY KEY,
  until TEXT NOT NULL
);

-- §7.2: one row per nightly digest run; the next run reads reports newer than MAX(ran_at).
CREATE TABLE digest_runs (
  ran_at TEXT PRIMARY KEY,
  report_count INTEGER NOT NULL DEFAULT 0
);
