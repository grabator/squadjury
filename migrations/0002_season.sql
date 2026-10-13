-- Seasons. Gameweeks are stored as season keys (2026/27 GW7 = 202607), so the existing UNIQUE
-- (user_id, gw) and the gameweek ids become unique per season without rebuilding any table.
-- Every table with a gameweek also gets a readable season label.

ALTER TABLE gameweeks ADD COLUMN season TEXT;
ALTER TABLE teams ADD COLUMN season TEXT;
ALTER TABLE votes ADD COLUMN season TEXT;
ALTER TABLE results ADD COLUMN season TEXT;

-- All data so far is from the 2026/27 season.
UPDATE gameweeks SET id = 202600 + id WHERE id < 100;
UPDATE teams SET gw = 202600 + gw WHERE gw < 100;
UPDATE votes SET gw = 202600 + gw WHERE gw < 100;
UPDATE results SET gw = 202600 + gw WHERE gw < 100;

UPDATE gameweeks SET season = '2026-27' WHERE season IS NULL;
UPDATE teams SET season = '2026-27' WHERE season IS NULL;
UPDATE votes SET season = '2026-27' WHERE season IS NULL;
UPDATE results SET season = '2026-27' WHERE season IS NULL;

CREATE INDEX teams_season ON teams(season);
CREATE INDEX results_season ON results(season, rank);
