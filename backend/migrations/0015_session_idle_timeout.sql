ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Expire sessions that have been idle for more than 10 minutes.
UPDATE sessions SET expires_at = now() WHERE last_seen_at < now() - INTERVAL '10 minutes';
