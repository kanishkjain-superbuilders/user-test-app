-- Fix anonymous recording creation by removing auth.uid() check
-- The issue is that anon users have auth.uid() = NULL but still need access

-- Drop all existing recording insert policies
DROP POLICY IF EXISTS "Org members can create recordings" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test links" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test link" ON recordings;
DROP POLICY IF EXISTS "recordings_insert_policy" ON recordings;

-- Create a new policy that properly handles anonymous users
CREATE POLICY "recordings_insert_policy"
    ON recordings FOR INSERT
    WITH CHECK (
        -- Allow authenticated org members to create recordings
        (
            auth.uid() IS NOT NULL AND
            EXISTS (
                SELECT 1 FROM memberships
                WHERE memberships.org_id = recordings.org_id
                AND memberships.user_id = auth.uid()
            )
        )
        OR
        -- Allow anonymous users (anon role) for unlisted, active test links
        -- When uploader_user_id is NULL and the test link allows it
        (
            uploader_user_id IS NULL AND
            EXISTS (
                SELECT 1 FROM test_links
                WHERE test_links.id = recordings.test_link_id
                AND test_links.visibility = 'unlisted'
                AND test_links.active = true
            )
        )
    );
