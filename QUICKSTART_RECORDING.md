# Quick Start: Testing Recording Feature

This guide helps you quickly test the newly implemented recording infrastructure.

## Prerequisites

- Node.js 18+ installed
- Supabase project created and configured
- `.env` file with Supabase credentials

## 1. Setup Database

Apply the latest migrations:

```bash
supabase db push
```

Or manually run the migration:
```sql
-- See: supabase/migrations/20251001000000_add_recording_manifest_fields.sql
```

## 2. Create Storage Bucket

In Supabase Dashboard:

1. Go to **Storage** → **Create bucket**
2. Name: `recordings`
3. Set to **Private** (not public)
4. Click "Create bucket"

## 3. Deploy Edge Functions

```bash
# Deploy both functions
supabase functions deploy issue-upload-url
supabase functions deploy finalize-recording
```

Verify deployment:
```bash
supabase functions list
```

## 4. Start Development Server

```bash
npm install
npm run dev
```

## 5. Test Recording Flow

### Create Test Link

1. Navigate to `http://localhost:5173`
2. Sign up with a test account
3. Create a project
4. Create a test link:
   - **Title**: "Test Recording"
   - **Slug**: "test-recording"
   - **Instructions**: "This is a test recording session"
   - **Recording Options**:
     - ✅ Screen
     - ✅ Microphone
     - ⬜ Camera (optional)
   - **Max Duration**: 5 minutes
   - **Active**: Yes
5. Copy the test link URL

### Test as Tester

1. Open the test link in a new tab: `/t/test-recording`
2. Read the instructions
3. Click "Start Recording"
4. Grant permissions:
   - Screen share
   - Microphone
   - Camera (if enabled)
5. Recording should start automatically
6. You should see:
   - Floating control bar
   - Recording timer
   - Upload progress

### Control Bar Features

- **Pause/Resume**: Pause and resume recording
- **Mic/Cam Mute**: Toggle microphone and camera
- **Stop**: Stop recording and start upload
- **Minimize/Expand**: Collapse control bar
- **Drag**: Move control bar around screen

### Complete Recording

1. Record for 10-15 seconds
2. Click "Stop" button
3. Wait for upload to complete
4. You should see "Recording Complete!" message

## 6. Verify Upload

### Check Supabase Storage

1. Go to Supabase Dashboard → **Storage** → `recordings`
2. You should see a folder: `recordings/{recording-id}/`
3. Inside, you'll find:
   - `part-00000.webm` (first chunk)
   - `part-00001.webm` (second chunk, if recording was long enough)
   - `manifest.json` (recording metadata)

### Check Database

1. Go to **Table Editor** → `recordings`
2. Find your recording entry
3. Verify:
   - `status` = "completed"
   - `total_parts` = number of chunks
   - `duration_sec` = recording duration
   - `manifest_url` = path to manifest

## 7. Troubleshooting

### Recording Won't Start

- Check browser console for errors
- Verify you granted all required permissions
- Make sure browser supports MediaRecorder API
- Try Chrome/Edge (best support)

### Upload Fails

Check Edge Function logs:
```bash
supabase functions logs issue-upload-url
supabase functions logs finalize-recording
```

Common issues:
- Edge Functions not deployed
- Storage bucket doesn't exist or is misconfigured
- Environment variables not set

### No Chunks in Storage

- Check browser Network tab for failed uploads
- Verify storage bucket is named exactly `recordings`
- Check that Edge Function `issue-upload-url` is working
- Look for errors in browser console

### IndexedDB Issues

Open DevTools → Application → IndexedDB:
- Database: `user-test-recordings`
- Store: `upload-queue`
- Check for pending items

Clear IndexedDB if needed:
```javascript
// In browser console
indexedDB.deleteDatabase('user-test-recordings')
```

## 8. Advanced Testing

### Test Pause/Resume

1. Start recording
2. Click "Pause" after 3 seconds
3. Wait 2 seconds
4. Click "Resume"
5. Record for 3 more seconds
6. Stop recording
7. Verify total duration is ~6 seconds (excluding pause)

### Test Mic/Cam Mute

1. Start recording with mic and cam
2. Toggle mic mute during recording
3. Toggle cam mute during recording
4. Verify icons change in control bar
5. Stop recording

### Test Max Duration

1. Create test link with 30 second max duration
2. Start recording
3. Let it run for full 30 seconds
4. Recording should auto-stop
5. Upload should begin automatically

### Test Network Interruption

1. Start recording
2. Open DevTools → Network tab
3. Throttle to "Offline" for 5 seconds
4. Set back to "Online"
5. Verify chunks retry and upload successfully

### Test Concurrent Uploads

1. Start recording
2. Let it run for 20+ seconds to generate multiple chunks
3. Stop recording
4. Watch Network tab - should see up to 3 concurrent uploads

## 9. What to Check

✅ **Browser Console**: No errors during recording
✅ **Network Tab**: Successful uploads to Edge Functions
✅ **IndexedDB**: Queue items created and marked as uploaded
✅ **Supabase Storage**: Chunks and manifest files present
✅ **Database**: Recording entry with correct metadata
✅ **Control Bar**: All buttons work as expected

## 10. Next Steps

After verifying recording works:

1. Deploy to production (see `DEPLOYMENT.md`)
2. Test on different browsers
3. Implement MSE player (Phase 4)
4. Add WebRTC live streaming (Phase 5)

## Common Edge Cases

### Browser Compatibility

- ✅ Chrome 90+: Full support
- ✅ Edge 90+: Full support
- ⚠️ Firefox 90+: Limited codec support
- ❌ Safari: No screen capture on desktop
- ❌ Mobile browsers: Not supported

### Large Recordings

- Each chunk is ~5 seconds = ~1-3 MB
- 5 minute recording = ~60 chunks = ~60-180 MB
- Supabase Storage free tier: 1 GB

### Permission Revocation

If user stops screen share during recording:
- Recording automatically stops
- Chunks already recorded are uploaded
- Partial recording is saved

## Support

If you encounter issues:

1. Check browser console
2. Check Supabase Edge Function logs
3. Review `IMPLEMENTATION_STATUS.md` for known issues
4. Check `supabase/functions/README.md` for Edge Function setup
