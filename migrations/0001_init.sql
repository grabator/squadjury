-- SquadJury schema

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT UNIQUE,
  email TEXT,
  nickname TEXT UNIQUE COLLATE NOCASE,
  x_handle TEXT,
  vote_weight REAL NOT NULL DEFAULT 1,
  banned INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Only a SHA-256 hash of the session token is stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE gameweeks (
  id INTEGER PRIMARY KEY,
  deadline INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
  locked_at INTEGER
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gw INTEGER NOT NULL,
  share_key TEXT NOT NULL UNIQUE,
  image_key TEXT,
  og_key TEXT,
  picks_json TEXT NOT NULL,
  captain_id INTEGER,
  vice_id INTEGER,
  vote_sum INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, gw)
);
CREATE INDEX teams_gw ON teams(gw, hidden, vote_count);

CREATE TABLE votes (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gw INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX votes_user_gw ON votes(user_id, gw);
CREATE INDEX votes_gw ON votes(gw);

-- Final standings, written once when a gameweek locks.
CREATE TABLE results (
  gw INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  avg REAL NOT NULL,
  votes INTEGER NOT NULL,
  rank_score REAL NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (gw, team_id)
);
CREATE INDEX results_user ON results(user_id);
CREATE INDEX results_rank ON results(gw, rank);

CREATE TABLE reports (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

-- Fixed window counters for rate limits.
CREATE TABLE rate (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Small cache for FPL data.
CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
