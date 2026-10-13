-- Scout points: after a gameweek every juror with 10+ verdicts gets a score for how well the
-- verdicts matched the real points. One row per juror and gameweek.

CREATE TABLE scouts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gw INTEGER NOT NULL,
  season TEXT,
  score REAL NOT NULL,
  verdicts INTEGER NOT NULL,
  duels INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (user_id, gw)
);
CREATE INDEX scouts_gw ON scouts(gw, rank);

ALTER TABLE gameweeks ADD COLUMN scouts_at INTEGER;     -- when the scout scores were worked out
ALTER TABLE gameweeks ADD COLUMN scouts_teams INTEGER;  -- squads with points (scouts need 10)
