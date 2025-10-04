-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_cleanup_stale_sessions ON live_sessions;

-- Drop functions
DROP FUNCTION IF EXISTS auto_cleanup_stale_sessions();
DROP FUNCTION IF EXISTS cleanup_stale_live_sessions();
DROP FUNCTION IF EXISTS update_session_heartbeat(UUID, TEXT);

-- Drop index
DROP INDEX IF EXISTS idx_live_sessions_heartbeat;

-- Remove heartbeat column from live_sessions
ALTER TABLE live_sessions
  DROP COLUMN IF EXISTS last_heartbeat;

-- Remove new statuses from recordings constraint
-- First drop the existing constraint
ALTER TABLE recordings
  DROP CONSTRAINT IF EXISTS recordings_status_check;

-- Re-add constraint without 'needs_recovery' and 'recovered'
ALTER TABLE recordings
  ADD CONSTRAINT recordings_status_check
  CHECK (status IN ('recording', 'uploading', 'processing', 'completed', 'ready', 'failed'));