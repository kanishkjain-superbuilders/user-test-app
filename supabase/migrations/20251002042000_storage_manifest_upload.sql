-- Allow service role to upload manifest files (used by Edge Functions)
-- The Edge Function uses service role to upload manifest.json

-- Note: Service role bypasses RLS, but we need to ensure the policies
-- don't conflict with service role operations

-- Drop existing policies if they're too restrictive
DROP POLICY IF EXISTS "anon_can_upload_recordings" ON storage.objects;
DROP POLICY IF EXISTS "anon_can_update_recordings" ON storage.objects;

-- Recreate with better patterns
-- Allow anon and authenticated users to upload to recordings bucket
CREATE POLICY "allow_upload_recordings"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
    bucket_id = 'recordings'
);

-- Allow anon and authenticated users to update their uploads
CREATE POLICY "allow_update_recordings"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
    bucket_id = 'recordings'
)
WITH CHECK (
    bucket_id = 'recordings'
);
