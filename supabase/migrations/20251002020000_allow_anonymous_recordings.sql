-- Allow anonymous users to create recordings for unlisted test links
-- This enables external testers to record sessions without authentication

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Org members can create recordings" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test links" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test link" ON recordings;

-- Create a new policy that allows:
-- 1. Org members to create recordings (authenticated)
-- 2. Anonymous users to create recordings for unlisted, active test links
CREATE POLICY "recordings_insert_policy"
    ON recordings FOR INSERT
    WITH CHECK (
        -- Allow authenticated org members
        (
            auth.uid() IS NOT NULL AND
            EXISTS (
                SELECT 1 FROM memberships
                WHERE memberships.org_id = recordings.org_id
                AND memberships.user_id = auth.uid()
            )
        )
        OR
        -- Allow anonymous/unauthenticated users for unlisted, active test links
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
