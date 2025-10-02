# Supabase Edge Functions

This directory contains Supabase Edge Functions for the User Testing Platform.

## Functions

### `issue-upload-url`
Generates signed upload URLs for recording chunks.

**Request:**
```json
{
  "recordingId": "uuid",
  "partIndex": 0,
  "mimeType": "video/webm;codecs=vp8,opus"
}
```

**Response:**
```json
{
  "signedUrl": "https://...",
  "path": "recordings/uuid/part-00000.webm",
  "token": "...",
  "expiresIn": 3600
}
```

### `finalize-recording`
Finalizes a recording by uploading the manifest and updating the database.

**Request:**
```json
{
  "recordingId": "uuid",
  "manifest": {
    "recordingId": "uuid",
    "mimeType": "video/webm;codecs=vp8,opus",
    "codecs": "vp8,opus",
    "totalParts": 10,
    "totalBytes": 1048576,
    "duration": 60.5,
    "width": 1920,
    "height": 1080,
    "createdAt": "2025-10-01T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "recordingId": "uuid",
  "manifestUrl": "recordings/uuid/manifest.json",
  "totalParts": 10,
  "duration": 60.5
}
```

## Deployment

To deploy these functions to Supabase:

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Deploy all functions:
   ```bash
   supabase functions deploy
   ```

5. Or deploy a specific function:
   ```bash
   supabase functions deploy issue-upload-url
   supabase functions deploy finalize-recording
   ```

## Testing Locally

1. Start Supabase locally:
   ```bash
   supabase start
   ```

2. Serve functions locally:
   ```bash
   supabase functions serve
   ```

3. Test with curl:
   ```bash
   curl -i --location --request POST 'http://localhost:54321/functions/v1/issue-upload-url' \
     --header 'Authorization: Bearer YOUR_ANON_KEY' \
     --header 'Content-Type: application/json' \
     --data '{"recordingId":"test-id","partIndex":0,"mimeType":"video/webm"}'
   ```

## Storage Bucket

Make sure you have created a `recordings` storage bucket in Supabase with the following settings:

- **Name:** `recordings`
- **Public:** No (private)
- **File size limit:** 100 MB per file
- **Allowed MIME types:** `video/webm`, `audio/webm`, `application/json`

### RLS Policies for Storage

```sql
-- Allow authenticated users to upload to their org's recordings
CREATE POLICY "Users can upload recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recordings' AND
  EXISTS (
    SELECT 1 FROM recordings r
    JOIN memberships m ON m.org_id = r.org_id
    WHERE r.id::text = (string_to_array(name, '/'))[2]
    AND m.user_id = auth.uid()
  )
);

-- Allow authenticated users to read recordings from their org
CREATE POLICY "Users can read recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'recordings' AND
  EXISTS (
    SELECT 1 FROM recordings r
    JOIN memberships m ON m.org_id = r.org_id
    WHERE r.id::text = (string_to_array(name, '/'))[2]
    AND m.user_id = auth.uid()
  )
);
```
