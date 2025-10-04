-- Add new recording statuses for recovery
ALTER TABLE recordings
  DROP CONSTRAINT IF EXISTS recordings_status_check;

ALTER TABLE recordings
  ADD CONSTRAINT recordings_status_check
  CHECK (status IN ('recording', 'uploading', 'processing', 'completed', 'ready', 'failed', 'needs_recovery', 'recovered'));

-- Add heartbeat column to live_sessions table for automatic timeout
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ DEFAULT now();

-- Create index for heartbeat queries
CREATE INDEX IF NOT EXISTS idx_live_sessions_heartbeat ON live_sessions(last_heartbeat)
  WHERE status = 'active';

-- Function to update heartbeat for a live session
CREATE OR REPLACE FUNCTION update_session_heartbeat(
    p_session_id UUID,
    p_tester_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE live_sessions
    SET
        last_heartbeat = now()
    WHERE
        id = p_session_id
        AND tester_id = p_tester_id
        AND status = 'active';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon role for testers
GRANT EXECUTE ON FUNCTION update_session_heartbeat TO anon;

-- Function to cleanup stale sessions (simplified - just ends the sessions)
-- Recovery manifest creation should be handled by Edge Function or application
CREATE OR REPLACE FUNCTION cleanup_stale_live_sessions() RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_session RECORD;
BEGIN
    -- Process each stale session
    FOR v_session IN
        SELECT
            ls.id as session_id,
            ls.recording_id,
            ls.tester_id,
            ls.started_at
        FROM live_sessions ls
        WHERE ls.status = 'active'
        AND ls.last_heartbeat < now() - INTERVAL '30 seconds'
    LOOP
        -- End the session
        UPDATE live_sessions
        SET
            status = 'ended',
            ended_at = now()
        WHERE id = v_session.session_id;

        -- Mark viewers as disconnected
        UPDATE live_viewers
        SET
            status = 'disconnected',
            left_at = now()
        WHERE
            live_session_id = v_session.session_id
            AND status = 'active';

        -- Mark recording for recovery (actual recovery handled by Edge Function)
        UPDATE recordings
        SET
            status = 'needs_recovery',
            updated_at = now()
        WHERE id = v_session.recording_id
        AND status = 'processing';

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (for admin cleanup)
GRANT EXECUTE ON FUNCTION cleanup_stale_live_sessions TO authenticated;

-- Create a cron job to run cleanup every 10 seconds (requires pg_cron extension)
-- Note: This needs to be run by a superuser or configured in Supabase dashboard
-- SELECT cron.schedule('cleanup-stale-sessions', '*/10 * * * * *', 'SELECT cleanup_stale_live_sessions();');

-- Alternative: Create a function that can be called periodically from the application
CREATE OR REPLACE FUNCTION auto_cleanup_stale_sessions() RETURNS TRIGGER AS $$
BEGIN
    -- Run cleanup when any heartbeat is updated
    -- This is a simple approach that piggybacks on heartbeat updates
    IF random() < 0.1 THEN -- Only run 10% of the time to avoid too frequent cleanups
        PERFORM cleanup_stale_live_sessions();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to auto-cleanup on heartbeat updates
DROP TRIGGER IF EXISTS trigger_cleanup_stale_sessions ON live_sessions;
CREATE TRIGGER trigger_cleanup_stale_sessions
    AFTER UPDATE OF last_heartbeat ON live_sessions
    FOR EACH STATEMENT
    EXECUTE FUNCTION auto_cleanup_stale_sessions();

-- Update existing active sessions to have current heartbeat
UPDATE live_sessions
SET last_heartbeat = now()
WHERE status = 'active';