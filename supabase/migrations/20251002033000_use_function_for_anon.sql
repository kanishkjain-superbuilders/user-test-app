-- Use a SECURITY DEFINER function to bypass RLS for the test_links check
-- This allows the anon role to validate test links without needing SELECT permission

-- Create a function that checks if a test link allows anonymous recordings
CREATE OR REPLACE FUNCTION public.test_link_allows_anon_recording(link_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM test_links
        WHERE id = link_id
        AND visibility = 'unlisted'
        AND active = true
    );
END;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.test_link_allows_anon_recording(UUID) TO anon, authenticated;

-- Drop existing recording insert policies
DROP POLICY IF EXISTS "recordings_insert_authenticated" ON recordings;
DROP POLICY IF EXISTS "recordings_insert_anon" ON recordings;

-- Recreate with the function
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
        uploader_user_id IS NULL
        AND public.test_link_allows_anon_recording(test_link_id)
    );
