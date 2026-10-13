-- Real points after a gameweek, and the optional FPL team id for verified points.

ALTER TABLE teams ADD COLUMN points INTEGER;                            -- real FPL points after the gameweek
ALTER TABLE teams ADD COLUMN points_verified INTEGER NOT NULL DEFAULT 0; -- 1 when taken from the owner's own FPL team

ALTER TABLE users ADD COLUMN fpl_id INTEGER;

ALTER TABLE gameweeks ADD COLUMN points_status TEXT;                    -- NULL (waiting), 'done' or 'failed'
ALTER TABLE gameweeks ADD COLUMN points_tries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gameweeks ADD COLUMN points_at INTEGER;
