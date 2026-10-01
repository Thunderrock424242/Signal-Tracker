CREATE TABLE IF NOT EXISTS sessions (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (owner, id)
);
CREATE INDEX IF NOT EXISTS sessions_owner_started ON sessions(owner, started_at DESC);
