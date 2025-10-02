# User Testing Platform

A lightweight platform to run product tests by sharing a link. Testers can record their screen, microphone, and camera while viewers watch live sessions and review recordings later.

## Tech Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn/ui + Zustand
- **Backend**: Supabase (Auth, Postgres + RLS, Realtime, Storage, Edge Functions)
- **Recording**: MediaRecorder API with chunked WebM uploads
- **Live Streaming**: WebRTC mesh (max 5 concurrent viewers)

## Features

- 🎥 Screen + mic + camera recording
- 📡 Live session viewing with WebRTC
- 💬 Real-time comments and markers
- 🔒 Privacy controls (private/unlisted)
- 👥 Organizations and team collaboration
- 🎯 Test link creation with custom instructions
- 📊 Session playback with MSE player

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a new Supabase project at https://supabase.com
2. Run the database migration:
   ```bash
   # Using Supabase CLI
   supabase db push

   # Or manually execute the SQL in supabase/migrations/20250101000000_initial_schema.sql
   ```

3. Create Storage buckets:
   - `recordings` (private)
   - `thumbnails` (private)

4. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```

### 3. Configure Environment Variables

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_APP_URL=http://localhost:5173
```

### 4. Run Development Server

```bash
npm run dev
```

## Project Structure

```
src/
├── lib/
│   ├── supabase.ts             # Supabase client
│   ├── database.types.ts       # Generated types
│   ├── utils.ts                # Utility functions
│   ├── recording-utils.ts      # Recording utilities ⭐
│   └── upload-db.ts            # IndexedDB wrapper ⭐
├── store/
│   ├── auth.ts                 # Auth & org state
│   ├── project.ts              # Projects & test links
│   ├── live.ts                 # WebRTC & realtime
│   └── recording.ts            # Recording state
├── hooks/
│   ├── useRecordingManager.ts  # MediaRecorder hook ⭐
│   └── useUploadManager.ts     # Upload queue hook ⭐
├── pages/
│   ├── Login.tsx
│   ├── Signup.tsx
│   ├── Dashboard.tsx
│   ├── ProjectDetail.tsx
│   ├── TestLinkForm.tsx
│   ├── TesterFlow.tsx          # Enhanced with recording ⭐
│   ├── LiveViewer.tsx
│   ├── RecordingPlayer.tsx
│   └── AcceptInvite.tsx
├── components/
│   ├── ui/                     # shadcn/ui components
│   └── RecordingControlBar.tsx # Floating control bar ⭐
└── App.tsx                     # Router setup

supabase/
├── migrations/                 # Database schema
│   ├── 20250101000000_initial_schema.sql
│   ├── 20251002013424_fix_membership_policies.sql
│   ├── 20251002013500_fix_organizations_policies.sql
│   └── 20251001000000_add_recording_manifest_fields.sql ⭐
└── functions/                  # Edge Functions
    ├── issue-upload-url/       # Signed upload URLs ⭐
    ├── finalize-recording/     # Recording finalization ⭐
    └── README.md               # Deployment guide ⭐
```

## Database Schema

The platform uses 11 tables:
- `organizations` - Organization accounts
- `memberships` - User-org relationships with roles
- `projects` - Project containers
- `test_links` - Shareable test links
- `live_sessions` - Active recording sessions
- `live_viewers` - Viewers in live sessions
- `recordings` - Recorded sessions
- `recording_segments` - Video chunks
- `comments` - Comments and timeline markers
- `events` - Session event log
- `invites` - Team invitations

All tables enforce Row Level Security (RLS) for org-level data isolation.

## Key Workflows

### Creating a Test Link
1. Admin creates a project in their org
2. Creates a test link with:
   - Instructions (markdown)
   - Redirect URL (optional)
   - Recording options (screen/mic/cam)
   - Privacy settings (private/unlisted)
3. Shares the `/t/:slug` link

### Tester Flow
1. Opens test link
2. Reads instructions
3. Grants screen/mic/cam permissions
4. Gets redirected to target app (optional)
5. Records with floating control bar
6. Chunks upload to Supabase Storage

### Live Viewing
1. Org member joins live session
2. WebRTC mesh connects broadcaster to viewers
3. Real-time comments via Supabase Realtime
4. Capped at 5 concurrent viewers (V1)

### Recording Playback
1. Client-side chunked recording finalized
2. MSE player loads WebM segments
3. Timeline with markers and comments
4. Downloadable (if permitted)

## Supabase Edge Functions

Implemented functions in `supabase/functions/`:
- ✅ `issue-upload-url` - Generate signed PUT URLs for chunk uploads
- ✅ `finalize-recording` - Process completed recording with manifest upload

Planned functions:
- `create-invite` - Send team invitations
- `accept-invite` - Convert invite to membership
- `start-live-session` - Create session with viewer cap
- `sign-playback-url` - Generate signed GET URLs

See `supabase/functions/README.md` for deployment instructions.

## Development Roadmap

- [x] Phase 1: Foundation & setup
- [x] Phase 2: Auth & organizations
- [x] Phase 2.5: UI Components & Core Features
- [x] Phase 3: Recording infrastructure ⭐ **NEW**
- [ ] Phase 4: Playback system
- [ ] Phase 5: Live streaming (WebRTC)
- [ ] Phase 6: Privacy & sharing
- [ ] Phase 7: Polish & observability

**Current Progress: ~70%** (See `IMPLEMENTATION_STATUS.md` for details)

## Current Implementation Status

### ✅ Phase 1-3 Completed
- Project scaffolding (Vite + React + TypeScript)
- Tailwind CSS v4 + shadcn/ui component library
- React Router with all routes
- Zustand stores (auth, project, live, recording)
- Complete database schema with RLS policies
- Authentication (Login/Signup)
- Dashboard with org/project management
- Test link creation and management
- Tester flow (public page)
- **MediaRecorder API with chunked recording** ⭐
- **Recording control bar UI** ⭐
- **IndexedDB upload queue with retry logic** ⭐
- **Supabase Storage integration** ⭐
- **Edge Functions for upload/finalize** ⭐

### 📋 Next Up
- MSE-based player for recordings
- WebRTC live streaming
- Comments system
- Remaining Edge Functions

## Browser Support

- Chrome/Edge 90+ (recommended)
- Firefox 90+
- Desktop only (mobile Safari lacks screen capture)

## Security

- Strict RLS on all tables
- Signed URLs for Storage access
- Org-scoped data isolation
- CSP headers for XSS protection
- No server-side secrets in client

## License

MIT
