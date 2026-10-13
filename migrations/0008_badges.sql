-- Badges a juror has unlocked. seen = 0 until the juror opens the badges sheet (the "new" dot).

CREATE TABLE badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  season TEXT,
  gw INTEGER,
  unlocked_at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, badge)
);
CREATE INDEX badges_badge ON badges(badge);
