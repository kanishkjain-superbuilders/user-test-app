-- Fix the storage deletion trigger to match actual storage path format
-- Storage paths are in format: {recording-id}/part-XXXXX.webm

DROP TRIGGER IF EXISTS delete_recording_storage_trigger ON recordings;
DROP FUNCTION IF EXISTS delete_recording_storage();

CREATE OR REPLACE FUNCTION delete_recording_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all files from storage that belong to this recording
  -- Storage path format: {recording-id}/part-xxxxx.webm or {recording-id}/manifest.json

  DELETE FROM storage.objects
  WHERE bucket_id = 'recordings'
  AND name LIKE OLD.id::text || '/%';

  -- Log for debugging
  RAISE NOTICE 'Deleted storage files for recording: %', OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call the function before recording deletion
CREATE TRIGGER delete_recording_storage_trigger
  BEFORE DELETE ON recordings
  FOR EACH ROW
  EXECUTE FUNCTION delete_recording_storage();

-- Ensure function has access to storage schema
GRANT USAGE ON SCHEMA storage TO postgres;
GRANT DELETE ON storage.objects TO postgres;
