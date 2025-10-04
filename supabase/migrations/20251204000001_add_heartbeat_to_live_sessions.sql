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

-- Function to cleanup stale sessions and create recovery manifests
CREATE OR REPLACE FUNCTION cleanup_stale_live_sessions() RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_session RECORD;
    v_chunk_count INTEGER;
    v_duration_estimate INTEGER;
    v_manifest JSONB;
BEGIN
    -- Process each stale session
    FOR v_session IN
        SELECT
            ls.id as session_id,
            ls.recording_id,
            ls.tester_id,
            ls.started_at,
            r.object_path
        FROM live_sessions ls
        JOIN recordings r ON r.id = ls.recording_id
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

        -- Try to count uploaded chunks in storage (estimate)
        -- Assuming chunks are named with pattern: recordingId/part-000.webm
        v_chunk_count := 0;

        -- Estimate duration (5 seconds per chunk is the default)
        v_duration_estimate := v_chunk_count * 5000; -- milliseconds

        -- If we have a started_at, use actual elapsed time
        IF v_session.started_at IS NOT NULL THEN
            v_duration_estimate := EXTRACT(EPOCH FROM (now() - v_session.started_at)) * 1000;
        END IF;

        -- Create recovery manifest
        v_manifest := jsonb_build_object(
            'version', '1.0',
            'recordingId', v_session.recording_id,
            'mimeType', 'video/webm',
            'totalParts', v_chunk_count,
            'duration', v_duration_estimate,
            'width', 1920,
            'height', 1080,
            'recovered', true,
            'recoveryReason', 'session_timeout',
            'recoveredAt', now()
        );

        -- Update recording with recovery manifest
        UPDATE recordings
        SET
            status = 'recovered',
            manifest = v_manifest,
            duration_ms = v_duration_estimate,
            updated_at = now()
        WHERE id = v_session.recording_id
        AND manifest IS NULL; -- Only if no manifest exists yet

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

-- Create trigger to auto-cleanup on heartbeat updates
CREATE TRIGGER trigger_cleanup_stale_sessions
    AFTER UPDATE OF last_heartbeat ON live_sessions
    FOR EACH STATEMENT
    EXECUTE FUNCTION auto_cleanup_stale_sessions();

-- Update existing active sessions to have current heartbeat
UPDATE live_sessions
SET last_heartbeat = now()
WHERE status = 'active';