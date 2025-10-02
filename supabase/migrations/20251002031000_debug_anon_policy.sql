-- Debug: Check what policies exist and create a more permissive one temporarily
-- First, let's ensure test_links has proper SELECT policies for anon

-- Check existing policies on test_links
DROP POLICY IF EXISTS "anon_can_read_test_links" ON test_links;
DROP POLICY IF EXISTS "Anyone can read active unlisted test links" ON test_links;

-- Create a policy that allows anon to read unlisted test links
CREATE POLICY "anon_can_read_test_links"
    ON test_links FOR SELECT
    TO anon, authenticated
    USING (
        (visibility = 'unlisted' AND active = true)
        OR
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = test_links.org_id
            AND memberships.user_id = auth.uid()
        )
    );

-- Now recreate the recordings policies
DROP POLICY IF EXISTS "authenticated_can_create_recordings" ON recordings;
DROP POLICY IF EXISTS "anon_can_create_for_unlisted_links" ON recordings;

-- Policy for authenticated users
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

-- Policy for anonymous users - simplified check
CREATE POLICY "anon_can_create_for_unlisted_links"
    ON recordings FOR INSERT
    TO anon
    WITH CHECK (
        -- Must have null uploader_user_id
        uploader_user_id IS NULL
        AND
        -- The test link must exist and be unlisted+active
        test_link_id IN (
            SELECT id FROM test_links
            WHERE visibility = 'unlisted' AND active = true
        )
    );
