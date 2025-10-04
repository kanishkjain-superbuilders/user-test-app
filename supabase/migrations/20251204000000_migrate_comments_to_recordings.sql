-- Function to migrate comments from live session to recording
CREATE OR REPLACE FUNCTION migrate_comments_to_recording(
    p_session_id UUID
) RETURNS void AS $$
DECLARE
    v_recording_id UUID;
    v_session_start TIMESTAMPTZ;
BEGIN
    -- Get the recording_id and session start time
    SELECT recording_id, started_at
    INTO v_recording_id, v_session_start
    FROM live_sessions
    WHERE id = p_session_id;

    -- Only proceed if we have a recording_id
    IF v_recording_id IS NOT NULL THEN
        -- Update comments to associate them with the recording
        -- Calculate timestamp_ms based on when the comment was created relative to session start
        UPDATE comments
        SET
            recording_id = v_recording_id,
            timestamp_ms = EXTRACT(EPOCH FROM (created_at - v_session_start)) * 1000
        WHERE
            live_session_id = p_session_id
            AND recording_id IS NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated and anon users (for test recordings)
GRANT EXECUTE ON FUNCTION migrate_comments_to_recording TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_comments_to_recording TO anon;

-- Update the existing end_test_live_session function to migrate comments
CREATE OR REPLACE FUNCTION end_test_live_session(
    p_session_id UUID,
    p_tester_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Update the session
    UPDATE live_sessions
    SET
        status = 'ended',
        ended_at = now()
    WHERE
        id = p_session_id
        AND tester_id = p_tester_id
        AND status = 'active';

    -- Mark all viewers as disconnected
    UPDATE live_viewers
    SET
        status = 'disconnected',
        left_at = now()
    WHERE
        live_session_id = p_session_id
        AND status = 'active';

    -- Migrate comments to the recording
    PERFORM migrate_comments_to_recording(p_session_id);

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also update the regular session end function if it exists
-- This ensures comments are migrated regardless of how the session ends
CREATE OR REPLACE FUNCTION end_live_session(p_session_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update the session
    UPDATE live_sessions
    SET
        status = 'ended',
        ended_at = now()
    WHERE
        id = p_session_id
        AND status = 'active';

    -- Mark all viewers as disconnected
    UPDATE live_viewers
    SET
        status = 'disconnected',
        left_at = now()
    WHERE
        live_session_id = p_session_id
        AND status = 'active';

    -- Migrate comments to the recording
    PERFORM migrate_comments_to_recording(p_session_id);

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION end_live_session TO authenticated;

-- Migrate any existing comments from ended sessions that have recordings
-- This is a one-time migration for existing data
DO $$
DECLARE
    v_session RECORD;
BEGIN
    FOR v_session IN
        SELECT id
        FROM live_sessions
        WHERE recording_id IS NOT NULL
        AND status = 'ended'
    LOOP
        PERFORM migrate_comments_to_recording(v_session.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;