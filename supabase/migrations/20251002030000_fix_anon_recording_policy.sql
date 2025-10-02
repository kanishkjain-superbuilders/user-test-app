-- Fix for anonymous recording creation
-- The issue is that the policy needs to allow the anon role to check test_links
-- We need to ensure anon users can read test_links to validate the policy

-- First, ensure anon users can read test_links (needed for the policy check)
DROP POLICY IF EXISTS "anon_can_read_test_links" ON test_links;
CREATE POLICY "anon_can_read_test_links"
    ON test_links FOR SELECT
    TO anon
    USING (visibility = 'unlisted' AND active = true);

-- Drop all existing recording insert policies and recreate
DROP POLICY IF EXISTS "authenticated_can_create_recordings" ON recordings;
DROP POLICY IF EXISTS "anon_can_create_for_unlisted_links" ON recordings;

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

-- Policy 2: Anonymous users can create recordings for unlisted test links
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
