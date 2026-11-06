-- D1 schema (docs/prd/action-router.md "Data & contracts"). Re-runnable.
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS generations;
DROP TABLE IF EXISTS screenings;
DROP TABLE IF EXISTS blocks;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS actions;
DROP TABLE IF EXISTS goals;
DROP TABLE IF EXISTS district_offices;
DROP TABLE IF EXISTS members_elect;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS states;
DROP TABLE IF EXISTS visit_requests;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS digest_runs;
DROP TABLE IF EXISTS meta;

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
  reasons TEXT NOT NULL DEFAULT '[]',
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
  doc_format TEXT NOT NULL,
  standard_template TEXT,
  script_blocks TEXT
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
  money_url TEXT,
  district_office_address TEXT,
  district_office_city TEXT,
  contact_kind TEXT CHECK (contact_kind IN ('form','zip_gate','homepage')),
  not_returning INTEGER NOT NULL DEFAULT 0,
  left_office TEXT,
  caucus TEXT NOT NULL CHECK (caucus IN ('D','R'))
);
CREATE INDEX members_state_district ON members(state, chamber, district);

-- roster-freshness §1: district offices as rows (data/district_offices.csv); seeded with members.
CREATE TABLE district_offices (
  bioguide_id TEXT NOT NULL REFERENCES members(bioguide_id),
  office_id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT,
  address TEXT,
  suite TEXT,
  building TEXT,
  phone TEXT,
  fax TEXT,
  hours TEXT,
  lat REAL,
  lng REAL
);
CREATE INDEX district_offices_member ON district_offices(bioguide_id);

-- leadership-routing §1.3: members-elect of called races (data/members_elect.csv); seeded with members, empty after 2027-01-10.
CREATE TABLE members_elect (
  elect_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  party TEXT NOT NULL,
  caucus TEXT NOT NULL CHECK (caucus IN ('D','R')),
  chamber TEXT NOT NULL CHECK (chamber IN ('house','senate')),
  state TEXT NOT NULL,
  district INTEGER,
  replaces TEXT NOT NULL UNIQUE REFERENCES members(bioguide_id),
  contact_url TEXT NOT NULL,
  phone TEXT,
  source_url TEXT NOT NULL,
  source_date TEXT NOT NULL
);
CREATE INDEX members_elect_state ON members_elect(state);

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
  next_comment_date TEXT,
  holdings_status TEXT NOT NULL DEFAULT 'unknown'
);

-- §4 write tables. No document text, no address, no user field is ever stored:
-- generations keeps hashed 8-gram shingles only; screenings keeps the class only.
CREATE TABLE receipts (
  id INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id),
  action_id INTEGER REFERENCES actions(id),
  target_id TEXT,
  state TEXT,
  district INTEGER,
  created_at TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  -- commitment-funnel §2.1: a completed captain list is a receipt of kind 'captain-list' with no
  -- action and no target (names never reach the server); 'action' rows keep both and the FK.
  kind TEXT NOT NULL DEFAULT 'action' CHECK (kind IN ('action','captain-list')),
  -- district-counters §3.2: SHA-256(ip | daily salt | UTC date); rotates daily so days cannot be joined. NULL on old rows.
  ip_hash TEXT,
  CHECK (CASE kind WHEN 'action' THEN action_id IS NOT NULL AND target_id IS NOT NULL ELSE action_id IS NULL AND target_id IS NULL END)
);
CREATE INDEX receipts_created ON receipts(created_at);
CREATE INDEX receipts_kind_goal ON receipts(kind, goal_id, state, district);
-- district-counters: §1 count window and §3 limits.
CREATE INDEX receipts_goal_place ON receipts(goal_id, state, district, created_at);
CREATE INDEX receipts_device ON receipts(device_hash, created_at);
CREATE INDEX receipts_ip ON receipts(ip_hash, created_at);

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
  model TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  check_fail TEXT
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

-- §7.2: one row per weekly digest run; the next run reads reports newer than MAX(ran_at).
CREATE TABLE digest_runs (
  ran_at TEXT PRIMARY KEY,
  report_count INTEGER NOT NULL DEFAULT 0
);

-- office-visits: organiser-listed district-office visits, visible only once the maintainer approves.
-- contact_url is the organiser's own channel (personal data, docs/specs/office-visits.md §3): it is
-- returned only to a device whose request is stored, and goes with the row when the creator deletes it.
CREATE TABLE visits (
  id INTEGER PRIMARY KEY,
  bioguide_id TEXT NOT NULL,
  office_city TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  contact_url TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','hidden')),
  device_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX visits_member ON visits(bioguide_id, status, ends_at);
CREATE INDEX visits_device ON visits(device_hash, status);

CREATE TABLE visit_requests (
  id INTEGER PRIMARY KEY,
  visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (visit_id, device_hash)
);
CREATE INDEX visit_requests_device ON visit_requests(device_hash, created_at);

-- Key/value bookkeeping; `seed_sha256` is the hash of the data/ rows last applied, so `seed:remote`
-- can skip an unchanged reseed (deployment spec §3). seed.sql creates it IF NOT EXISTS as well.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
