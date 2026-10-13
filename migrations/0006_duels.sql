-- Duels: two squads side by side, the juror picks the better one. Every squad gets a duel
-- rating (Elo, start 1500) and a win/loss record. Also the head to head fixtures of private
-- leagues and Plan B, a second version of a squad that others can compare with Plan A.

ALTER TABLE teams ADD COLUMN elo REAL NOT NULL DEFAULT 1500;
ALTER TABLE teams ADD COLUMN duel_w INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN duel_l INTEGER NOT NULL DEFAULT 0;

-- One row per duel vote. a_id < b_id, so a pair is stored one way only. counted = 0 when the
-- vote did not count for the rating (too fast, always the same side, or over the limit).
CREATE TABLE duels (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gw INTEGER NOT NULL,
  season TEXT,
  a_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  winner_id INTEGER NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('first', 'second')),
  counted INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, a_id, b_id)
);
CREATE INDEX duels_user_gw ON duels(user_id, gw);
CREATE INDEX duels_pair ON duels(a_id, b_id);
CREATE INDEX duels_b ON duels(b_id);

-- When a pair was shown to a juror: a pick faster than one second does not count.
CREATE TABLE duel_offers (
  user_id INTEGER NOT NULL,
  a_id INTEGER NOT NULL,
  b_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, a_id, b_id)
);

-- Head to head fixtures of a private league, one row per match. away_id NULL = "Average".
CREATE TABLE h2h (
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  gw INTEGER NOT NULL,
  season TEXT,
  home_id INTEGER NOT NULL,
  away_id INTEGER,
  PRIMARY KEY (league_id, gw, home_id)
);
CREATE INDEX h2h_gw ON h2h(gw);

-- Plan B of a squad. The main squad stays in teams (Plan A) until the owner picks one.
CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gw INTEGER NOT NULL,
  share_key TEXT NOT NULL UNIQUE,
  picks_json TEXT NOT NULL,
  captain_id INTEGER,
  vice_id INTEGER,
  image_key TEXT,
  votes_a INTEGER NOT NULL DEFAULT 0,
  votes_b INTEGER NOT NULL DEFAULT 0,
  chosen TEXT CHECK (chosen IN ('a', 'b')),
  created_at INTEGER NOT NULL
);
CREATE INDEX plans_gw ON plans(gw, chosen);

CREATE TABLE plan_votes (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pick TEXT NOT NULL CHECK (pick IN ('a', 'b')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (plan_id, user_id)
);
