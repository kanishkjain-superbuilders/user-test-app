-- Allow anonymous users to read recordings they created (uploader_user_id IS NULL)
-- This is needed for the Edge Function to validate the recording

CREATE POLICY "anon_can_read_own_recordings"
    ON recordings FOR SELECT
    TO anon
    USING (uploader_user_id IS NULL);
