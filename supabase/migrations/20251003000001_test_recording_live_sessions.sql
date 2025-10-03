-- Update live_sessions table for test recording integration
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tester_id TEXT; -- Anonymous tester identifier

-- Allow null broadcaster_id for anonymous testers
ALTER TABLE live_sessions ALTER COLUMN broadcaster_id DROP NOT NULL;

-- Create index for recording lookup
CREATE INDEX IF NOT EXISTS idx_live_sessions_recording_id ON live_sessions(recording_id);

-- Update RLS policies for test recording live sessions

-- Drop old policies that require authenticated broadcaster
DROP POLICY IF EXISTS "Broadcasters can insert live sessions" ON live_sessions;
DROP POLICY IF EXISTS "Broadcasters can update live sessions" ON live_sessions;

-- Allow anonymous testers to create live sessions for their recordings
CREATE POLICY "Testers can create live sessions for recordings"
    ON live_sessions FOR INSERT
    WITH CHECK (
        -- Must have a recording_id and tester_id for anonymous sessions
        recording_id IS NOT NULL
        AND tester_id IS NOT NULL
    );

-- Allow anonymous testers to update their own sessions
CREATE POLICY "Testers can update their live sessions"
    ON live_sessions FOR UPDATE
    USING (
        tester_id IS NOT NULL
        AND tester_id = current_setting('app.tester_id', true)
    )
    WITH CHECK (
        tester_id IS NOT NULL
        AND tester_id = current_setting('app.tester_id', true)
    );

-- Keep viewer policies but update for test sessions
DROP POLICY IF EXISTS "Project members can view live sessions" ON live_sessions;

CREATE POLICY "Organization members can view test live sessions"
    ON live_sessions FOR SELECT
    USING (
        -- For test recordings, check project membership via recording
        EXISTS (
            SELECT 1
            FROM recordings r
            JOIN projects p ON p.id = r.project_id
            JOIN memberships m ON m.org_id = p.org_id
            WHERE r.id = live_sessions.recording_id
            AND m.user_id = auth.uid()
        )
        OR
        -- For sessions with project_id (legacy/future use)
        EXISTS (
            SELECT 1
            FROM projects p
            JOIN memberships m ON m.org_id = p.org_id
            WHERE p.id = live_sessions.project_id
            AND m.user_id = auth.uid()
        )
    );

-- Update live_viewers policies for test sessions
DROP POLICY IF EXISTS "Project members can join as viewers" ON live_viewers;

CREATE POLICY "Organization members can join as test session viewers"
    ON live_viewers FOR INSERT
    WITH CHECK (
        viewer_id = auth.uid()::text
        AND EXISTS (
            SELECT 1
            FROM live_sessions ls
            LEFT JOIN recordings r ON r.id = ls.recording_id
            LEFT JOIN projects p ON p.id = COALESCE(r.project_id, ls.project_id)
            JOIN memberships m ON m.org_id = p.org_id
            WHERE ls.id = live_viewers.live_session_id
            AND m.user_id = auth.uid()
        )
    );

-- Function to create a live session for a test recording
CREATE OR REPLACE FUNCTION create_test_live_session(
    p_recording_id UUID,
    p_test_link_id UUID,
    p_tester_id TEXT,
    p_channel_name TEXT
) RETURNS UUID AS $$
DECLARE
    v_session_id UUID;
    v_project_id UUID;
BEGIN
    -- Get project_id from test_link
    SELECT project_id INTO v_project_id
    FROM test_links
    WHERE id = p_test_link_id;

    IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'Test link not found';
    END IF;

    -- Create the live session
    INSERT INTO live_sessions (
        recording_id,
        test_link_id,
        project_id,
        tester_id,
        channel_name,
        status,
        started_at
    ) VALUES (
        p_recording_id,
        p_test_link_id,
        v_project_id,
        p_tester_id,
        p_channel_name,
        'active',
        now()
    ) RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon role for testers
GRANT EXECUTE ON FUNCTION create_test_live_session TO anon;

-- Function to end a test live session
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

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon role for testers
GRANT EXECUTE ON FUNCTION end_test_live_session TO anon;

-- Function to get active test sessions for a project
CREATE OR REPLACE FUNCTION get_project_test_sessions(p_project_id UUID)
RETURNS TABLE (
    session_id UUID,
    recording_id UUID,
    test_link_id UUID,
    test_link_title TEXT,
    tester_id TEXT,
    channel_name TEXT,
    started_at TIMESTAMPTZ,
    viewer_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ls.id as session_id,
        ls.recording_id,
        ls.test_link_id,
        tl.title as test_link_title,
        ls.tester_id,
        ls.channel_name,
        ls.started_at,
        COUNT(DISTINCT lv.viewer_id) as viewer_count
    FROM live_sessions ls
    JOIN test_links tl ON tl.id = ls.test_link_id
    LEFT JOIN live_viewers lv ON lv.live_session_id = ls.id AND lv.status = 'active'
    WHERE
        ls.project_id = p_project_id
        AND ls.status = 'active'
        AND ls.recording_id IS NOT NULL -- Only test sessions
    GROUP BY
        ls.id, ls.recording_id, ls.test_link_id,
        tl.title, ls.tester_id, ls.channel_name, ls.started_at
    ORDER BY ls.started_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_project_test_sessions TO authenticated;