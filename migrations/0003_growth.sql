-- Growth: a "Rate my team" preview image per squad, where new people come from, and who invited them.

ALTER TABLE teams ADD COLUMN rate_og_key TEXT;

ALTER TABLE users ADD COLUMN source TEXT;        -- channel of the first visit: wa, vb, ms, x, copy, ...
ALTER TABLE users ADD COLUMN referred_by INTEGER; -- user whose link brought this user in

-- Link opens per day, channel and kind of link (r = rate link, t = squad link, l = league link).
-- Only counts, no personal data.
CREATE TABLE visits (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source, kind)
);
