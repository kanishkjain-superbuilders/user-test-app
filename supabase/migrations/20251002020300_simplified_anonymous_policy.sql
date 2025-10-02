-- Simplified approach: Grant insert permission to anon role with proper checks
-- Drop all existing recording insert policies
DROP POLICY IF EXISTS "Org members can create recordings" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test links" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test link" ON recordings;
DROP POLICY IF EXISTS "recordings_insert_policy" ON recordings;

-- Policy 1: Authenticated org members can create recordings
CREATE POLICY "authenticated_can_create_recordings"
    ON recordings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = recordings.org_id
            AND memberships.user_id = auth.uid()
        )
    );

-- Policy 2: Anonymous users (anon role) can create recordings for unlisted test links
CREATE POLICY "anon_can_create_for_unlisted_links"
    ON recordings FOR INSERT
    TO anon
    WITH CHECK (
        uploader_user_id IS NULL
        AND EXISTS (
            SELECT 1 FROM test_links
            WHERE test_links.id = recordings.test_link_id
            AND test_links.visibility = 'unlisted'
            AND test_links.active = true
        )
    );
