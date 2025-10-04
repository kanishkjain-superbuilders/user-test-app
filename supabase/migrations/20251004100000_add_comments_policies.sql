-- Comments RLS Policies

-- Allow viewing comments for recordings the user has access to
CREATE POLICY "Users can view comments on accessible recordings"
    ON comments FOR SELECT
    USING (
        -- For recording comments
        (recording_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM recordings
            JOIN memberships ON memberships.org_id = recordings.org_id
            WHERE recordings.id = comments.recording_id
            AND memberships.user_id = auth.uid()
        ))
        OR
        -- For live session comments
        (live_session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM live_sessions
            JOIN test_links ON test_links.id = live_sessions.test_link_id
            JOIN memberships ON memberships.org_id = test_links.org_id
            WHERE live_sessions.id = comments.live_session_id
            AND memberships.user_id = auth.uid()
        ))
    );

-- Allow anyone to create comments on live sessions (for live viewing experience)
CREATE POLICY "Anyone can create comments on live sessions"
    ON comments FOR INSERT
    WITH CHECK (
        live_session_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM live_sessions
            JOIN test_links ON test_links.id = live_sessions.test_link_id
            WHERE live_sessions.id = comments.live_session_id
            AND test_links.active = true
        )
    );

-- Allow org members to create comments on recordings
CREATE POLICY "Org members can create comments on recordings"
    ON comments FOR INSERT
    WITH CHECK (
        recording_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM recordings
            JOIN memberships ON memberships.org_id = recordings.org_id
            WHERE recordings.id = comments.recording_id
            AND memberships.user_id = auth.uid()
        )
    );

-- Allow users to update their own comments
CREATE POLICY "Users can update their own comments"
    ON comments FOR UPDATE
    USING (user_id = auth.uid());

-- Allow users to delete their own comments
CREATE POLICY "Users can delete their own comments"
    ON comments FOR DELETE
    USING (user_id = auth.uid());
