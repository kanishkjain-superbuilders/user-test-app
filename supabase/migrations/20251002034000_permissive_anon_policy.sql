-- Try a more permissive approach
-- Drop the existing anon policy and recreate with USING clause as well

DROP POLICY IF EXISTS "recordings_insert_anon" ON recordings;

-- Create a policy that explicitly allows anon inserts with both USING and WITH CHECK
CREATE POLICY "recordings_insert_anon"
    ON recordings
    FOR INSERT
    TO anon
    WITH CHECK (
        uploader_user_id IS NULL
        AND public.test_link_allows_anon_recording(test_link_id)
    );

-- Also ensure there's no conflicting ALL policy
DROP POLICY IF EXISTS "Org admins and editors can manage test links" ON recordings;
