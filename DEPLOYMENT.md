# Deployment Guide

This guide covers deploying the User Testing Platform to production.

## Prerequisites

- Node.js 18+ installed
- Supabase account
- Supabase CLI installed: `npm install -g supabase`

## 1. Supabase Project Setup

### Create Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in project details:
   - **Name**: User Testing Platform
   - **Database Password**: (generate strong password)
   - **Region**: Choose closest to your users
4. Wait for project to be created (~2 minutes)

### Get Project Credentials

1. Go to **Project Settings** → **API**
2. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Project API keys** → **anon public** key

### Link Local Project

```bash
# Login to Supabase CLI
supabase login

# Link your project
supabase link --project-ref your-project-ref
```

## 2. Database Setup

### Apply Migrations

```bash
# Push migrations to Supabase
supabase db push
```

This will apply all migrations in `supabase/migrations/`:
- `20250101000000_initial_schema.sql` - Initial database schema
- `20251002013424_fix_membership_policies.sql` - Membership RLS fixes
- `20251002013500_fix_organizations_policies.sql` - Organization RLS fixes
- `20251001000000_add_recording_manifest_fields.sql` - Recording manifest fields

### Verify Tables

Go to **Database** → **Tables** in Supabase dashboard and verify:
- organizations
- memberships
- projects
- test_links
- recordings
- recording_segments
- live_sessions
- live_viewers
- comments
- events
- invites

## 3. Storage Setup

### Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Click "Create a new bucket"
3. Configure:
   - **Name**: `recordings`
   - **Public**: No (keep private)
   - **File size limit**: 100 MB
   - **Allowed MIME types**: `video/webm`, `audio/webm`, `application/json`

### Configure Storage RLS

Go to **Storage** → **Policies** and add:

```sql
-- Allow authenticated users to upload recordings
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

-- Allow authenticated users to read recordings
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

## 4. Edge Functions Deployment

### Deploy Functions

```bash
# Deploy all functions
supabase functions deploy issue-upload-url
supabase functions deploy finalize-recording
```

### Verify Deployment

```bash
# List deployed functions
supabase functions list
```

You should see:
- `issue-upload-url`
- `finalize-recording`

## 5. Frontend Deployment

### Environment Variables

Create `.env.local` (or configure in your hosting platform):

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_APP_URL=https://your-domain.com
```

### Build

```bash
npm install
npm run build
```

### Deploy Options

#### Option 1: Vercel

1. Install Vercel CLI: `npm install -g vercel`
2. Deploy: `vercel`
3. Add environment variables in Vercel dashboard
4. Redeploy: `vercel --prod`

#### Option 2: Netlify

1. Install Netlify CLI: `npm install -g netlify-cli`
2. Build: `npm run build`
3. Deploy: `netlify deploy --prod --dir=dist`
4. Configure environment variables in Netlify dashboard

#### Option 3: Custom Server

1. Build: `npm run build`
2. Serve `dist` folder with any static file server
3. Configure environment variables on the server

## 6. Post-Deployment Verification

### Test Authentication

1. Go to your deployed app
2. Sign up with a test account
3. Verify you can:
   - Create an organization
   - Create a project
   - Create a test link

### Test Recording Flow

1. Create a test link with screen recording enabled
2. Visit the test link URL (`/t/your-slug`)
3. Click "Start Recording"
4. Grant permissions
5. Record for 10-15 seconds
6. Stop recording
7. Verify upload completes
8. Check Supabase Storage for uploaded chunks

### Verify Database

Go to Supabase dashboard → **Table Editor**:
- Check `recordings` table has your test recording
- Check `recording_segments` table has the chunks
- Verify manifest is uploaded to storage

## 7. Production Configuration

### Email Settings

Configure email in Supabase:
1. Go to **Authentication** → **Email Templates**
2. Customize confirmation and password reset emails
3. Configure SMTP settings (optional, for custom email provider)

### URL Configuration

1. Go to **Authentication** → **URL Configuration**
2. Add your production URL to:
   - Site URL
   - Redirect URLs

### Rate Limiting

Consider adding rate limiting for:
- Sign up (prevent spam)
- Recording creation (prevent abuse)
- Edge function calls

### Monitoring

1. Enable Supabase logs in dashboard
2. Monitor Edge Function invocations
3. Set up alerts for errors
4. Track storage usage

## 8. Backup & Recovery

### Database Backups

Supabase automatically backs up your database daily. To manually backup:

```bash
# Download database dump
supabase db dump -f backup.sql
```

### Storage Backups

Consider setting up periodic backups of the `recordings` bucket:
1. Use Supabase Storage API to list files
2. Download and archive to external storage (S3, etc.)

## 9. Troubleshooting

### Edge Functions Not Working

```bash
# Check function logs
supabase functions logs issue-upload-url
supabase functions logs finalize-recording
```

### Storage Upload Fails

- Verify storage bucket exists and is named `recordings`
- Check RLS policies are configured correctly
- Ensure user is authenticated
- Check CORS settings in Supabase

### Recording Not Saving

- Check browser console for errors
- Verify IndexedDB is working (check Application tab in DevTools)
- Check network tab for failed upload requests
- Verify Edge Functions are deployed

## 10. Security Checklist

- [ ] Environment variables are not committed to git
- [ ] Supabase anon key is public (this is expected)
- [ ] RLS policies are enabled on all tables
- [ ] Storage bucket is private with RLS policies
- [ ] Edge Functions validate user permissions
- [ ] HTTPS is enabled on frontend
- [ ] Email confirmations are required for new accounts
- [ ] Rate limiting is configured

## Support

For issues or questions:
1. Check Supabase logs in dashboard
2. Review browser console errors
3. Check `IMPLEMENTATION_STATUS.md` for known issues
4. Refer to Supabase documentation: https://supabase.com/docs
