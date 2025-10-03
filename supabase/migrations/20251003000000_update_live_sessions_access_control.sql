-- Add missing fields to live_sessions table for proper access control
ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS broadcaster_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_name TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS max_viewers INTEGER DEFAULT 5;

-- Update status column
ALTER TABLE live_sessions ALTER COLUMN status SET DEFAULT 'active';

-- Drop old constraint if exists and add new one
DO $$
BEGIN
    ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_status_check;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE live_sessions
  ADD CONSTRAINT live_sessions_status_check CHECK (status IN ('active', 'ended'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_live_sessions_project_id ON live_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_broadcaster_id ON live_sessions(broadcaster_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_channel_name ON live_sessions(channel_name);
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON live_sessions(status);

-- Drop existing RLS policies for live_sessions
DROP POLICY IF EXISTS "Org members can view live sessions" ON live_sessions;
DROP POLICY IF EXISTS "Anon users can view live sessions" ON live_sessions;

-- Create new RLS policies for live_sessions with proper access control

-- Policy: Project members can view live sessions for their projects
CREATE POLICY "Project members can view live sessions"
    ON live_sessions FOR SELECT
    USING (
        -- User must be a member of the organization that owns the project
        EXISTS (
            SELECT 1
            FROM projects p
            JOIN memberships m ON m.org_id = p.org_id
            WHERE p.id = live_sessions.project_id
            AND m.user_id = auth.uid()
        )
    );

-- Policy: Broadcasters can insert their own live sessions
CREATE POLICY "Broadcasters can insert live sessions"
    ON live_sessions FOR INSERT
    WITH CHECK (
        broadcaster_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM projects p
            JOIN memberships m ON m.org_id = p.org_id
            WHERE p.id = project_id
            AND m.user_id = auth.uid()
        )
    );

-- Policy: Broadcasters can update their own live sessions
CREATE POLICY "Broadcasters can update live sessions"
    ON live_sessions FOR UPDATE
    USING (
        broadcaster_id = auth.uid()
    )
    WITH CHECK (
        broadcaster_id = auth.uid()
    );

-- Policy: System can delete ended sessions (for cleanup)
CREATE POLICY "System can delete ended sessions"
    ON live_sessions FOR DELETE
    USING (
        status = 'ended'
        AND (
            broadcaster_id = auth.uid()
            OR ended_at < now() - INTERVAL '7 days'
        )
    );

-- Add missing columns to live_viewers table if they don't exist
ALTER TABLE live_viewers
  ADD COLUMN IF NOT EXISTS viewer_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Update live_viewers table policies
ALTER TABLE live_viewers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view live_viewers" ON live_viewers;
DROP POLICY IF EXISTS "Anon users can insert live_viewers" ON live_viewers;

-- Policy: Only authenticated users who are project members can view live_viewers
CREATE POLICY "Project members can view live_viewers"
    ON live_viewers FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM live_sessions ls
            JOIN projects p ON p.id = ls.project_id
            JOIN memberships m ON m.org_id = p.org_id
            WHERE ls.id = live_viewers.live_session_id
            AND m.user_id = auth.uid()
        )
    );

-- Policy: Only authenticated project members can insert as viewers
CREATE POLICY "Project members can join as viewers"
    ON live_viewers FOR INSERT
    WITH CHECK (
        viewer_id = auth.uid()::text
        AND EXISTS (
            SELECT 1
            FROM live_sessions ls
            JOIN projects p ON p.id = ls.project_id
            JOIN memberships m ON m.org_id = p.org_id
            WHERE ls.id = live_viewers.live_session_id
            AND m.user_id = auth.uid()
        )
    );

-- Policy: Viewers can update their own records
CREATE POLICY "Viewers can update own records"
    ON live_viewers FOR UPDATE
    USING (viewer_id = auth.uid()::text)
    WITH CHECK (viewer_id = auth.uid()::text);

-- Function to check if a user can view a live session
CREATE OR REPLACE FUNCTION can_view_live_session(p_session_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_project_id UUID;
    v_org_id UUID;
BEGIN
    -- Get the project and organization for this session
    SELECT ls.project_id, p.org_id
    INTO v_project_id, v_org_id
    FROM live_sessions ls
    JOIN projects p ON p.id = ls.project_id
    WHERE ls.id = p_session_id
    AND ls.status = 'active';

    IF v_project_id IS NULL THEN
        RETURN FALSE; -- Session doesn't exist or is not active
    END IF;

    -- Check if user is a member of the organization
    RETURN EXISTS (
        SELECT 1
        FROM memberships
        WHERE org_id = v_org_id
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION can_view_live_session TO authenticated;