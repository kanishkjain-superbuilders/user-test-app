-- Final fix for anonymous recording creation
-- The problem: Initial schema has conflicting policies that check auth.uid()
-- Solution: Drop the old policy and create role-specific policies

-- Drop the old "Org members can create recordings" policy from initial schema
DROP POLICY IF EXISTS "Org members can create recordings" ON recordings;

-- Also drop any other recording insert policies we created
DROP POLICY IF EXISTS "authenticated_can_create_recordings" ON recordings;
DROP POLICY IF EXISTS "anon_can_create_for_unlisted_links" ON recordings;
DROP POLICY IF EXISTS "recordings_insert_policy" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test links" ON recordings;
DROP POLICY IF EXISTS "Allow recording creation for org members and unlisted test link" ON recordings;

-- Update test_links SELECT policy to explicitly allow anon role
DROP POLICY IF EXISTS "Org members can view test links" ON test_links;
DROP POLICY IF EXISTS "anon_can_read_test_links" ON test_links;

-- Recreate test_links SELECT policy that works for both authenticated and anon
CREATE POLICY "test_links_select_policy"
    ON test_links FOR SELECT
    USING (
        -- Org members can see all test links in their org
        (
            auth.uid() IS NOT NULL AND
            EXISTS (
                SELECT 1 FROM memberships
                WHERE memberships.org_id = test_links.org_id
                AND memberships.user_id = auth.uid()
            )
        )
        OR
        -- Anyone (including anon) can see active unlisted test links
        (visibility = 'unlisted' AND active = true)
    );

-- Create separate INSERT policies for authenticated and anon roles
CREATE POLICY "recordings_insert_authenticated"
    ON recordings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = recordings.org_id
            AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "recordings_insert_anon"
    ON recordings FOR INSERT
    TO anon
    WITH CHECK (
        -- Anonymous users must set uploader_user_id to NULL
        uploader_user_id IS NULL
        AND
        -- Test link must be unlisted and active
        EXISTS (
            SELECT 1 FROM test_links
            WHERE test_links.id = recordings.test_link_id
            AND test_links.visibility = 'unlisted'
            AND test_links.active = true
        )
    );
