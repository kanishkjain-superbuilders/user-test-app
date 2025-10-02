-- Allow anonymous users to upload recordings
-- Storage policies work differently - they're on storage.objects table

-- First, check if the recordings bucket exists and create storage policies
-- Note: The bucket should already exist, we're just adding policies

-- Allow anonymous users to insert (upload) objects to recordings bucket
-- Path pattern: recordings/{recordingId}/part-{index}.webm
CREATE POLICY "anon_can_upload_recordings"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = 'recordings'
);

-- Allow anonymous users to update their uploaded objects (for multipart uploads)
CREATE POLICY "anon_can_update_recordings"
ON storage.objects
FOR UPDATE
TO anon
USING (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = 'recordings'
)
WITH CHECK (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = 'recordings'
);
