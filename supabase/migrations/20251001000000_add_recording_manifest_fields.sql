-- Add missing fields to recordings table for manifest data
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS total_parts integer,
  ADD COLUMN IF NOT EXISTS total_bytes bigint,
  ADD COLUMN IF NOT EXISTS duration_sec numeric,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS codecs text,
  ADD COLUMN IF NOT EXISTS manifest_url text;

-- Update status enum to include 'recording' and 'completed'
ALTER TABLE recordings
  DROP CONSTRAINT IF EXISTS recordings_status_check;

ALTER TABLE recordings
  ADD CONSTRAINT recordings_status_check
  CHECK (status IN ('recording', 'uploading', 'processing', 'completed', 'ready', 'failed'));

-- Add storage_path to recording_segments for easier management
ALTER TABLE recording_segments
  RENAME COLUMN object_path TO storage_path;

-- Add mime_type to recording_segments
ALTER TABLE recording_segments
  ADD COLUMN IF NOT EXISTS mime_type text;

-- Update object_path to be nullable (we'll store manifest separately)
ALTER TABLE recordings
  ALTER COLUMN object_path DROP NOT NULL;

-- Create index on recording status for filtering
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);

-- Create index on recording project_id
CREATE INDEX IF NOT EXISTS idx_recordings_project_id ON recordings(project_id);
