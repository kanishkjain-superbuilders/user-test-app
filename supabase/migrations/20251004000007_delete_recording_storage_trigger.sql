-- Create a function to delete recording files from storage when a recording is deleted
CREATE OR REPLACE FUNCTION delete_recording_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all files in the recording's folder from storage
  -- The object_path is typically in format: recordings/{recordingId}/...
  -- We need to delete the entire folder

  -- Extract the recording ID from the object_path or use the recording id directly
  -- Storage path format: {recordingId}/ or recordings/{recordingId}/
  DECLARE
    folder_path TEXT;
  BEGIN
    -- Determine the folder path based on object_path format
    IF OLD.object_path LIKE 'recordings/%' THEN
      -- Old format: recordings/{id}/...
      folder_path := split_part(OLD.object_path, '/', 2);
    ELSE
      -- New format: {id}/...
      folder_path := split_part(OLD.object_path, '/', 1);
    END IF;

    -- If we couldn't extract from path, use the recording ID
    IF folder_path IS NULL OR folder_path = '' THEN
      folder_path := OLD.id::text;
    END IF;

    -- Delete all objects in the recordings bucket with this prefix
    -- This uses the storage.objects table to find and delete files
    DELETE FROM storage.objects
    WHERE bucket_id = 'recordings'
    AND (
      name LIKE folder_path || '/%' OR
      name LIKE 'recordings/' || folder_path || '/%'
    );

    RETURN OLD;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call the function before recording deletion
DROP TRIGGER IF EXISTS delete_recording_storage_trigger ON recordings;

CREATE TRIGGER delete_recording_storage_trigger
  BEFORE DELETE ON recordings
  FOR EACH ROW
  EXECUTE FUNCTION delete_recording_storage();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO postgres;
GRANT ALL ON storage.objects TO postgres;
