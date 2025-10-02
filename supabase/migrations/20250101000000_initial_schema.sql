-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_organizations_owner ON organizations(owner_user_id);

-- Memberships table
CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, user_id)
);

CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_memberships_org ON memberships(org_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_projects_org ON projects(org_id);

-- Test links table
CREATE TABLE test_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    instructions_md TEXT NOT NULL,
    redirect_url TEXT,
    require_auth BOOLEAN NOT NULL DEFAULT false,
    allowed_emails TEXT[],
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted')),
    record_opts JSONB NOT NULL DEFAULT '{"screen":true,"mic":true,"cam":false,"maxDurationSec":1800}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER test_links_updated_at BEFORE UPDATE ON test_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_test_links_project ON test_links(project_id);
CREATE INDEX idx_test_links_org ON test_links(org_id);
CREATE INDEX idx_test_links_slug ON test_links(slug);
CREATE INDEX idx_test_links_active ON test_links(active);

-- Live sessions table
CREATE TABLE live_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_link_id UUID NOT NULL REFERENCES test_links(id) ON DELETE CASCADE,
    tester_anon_id TEXT,
    status TEXT NOT NULL DEFAULT 'starting' CHECK (status IN ('starting', 'live', 'ended')),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER live_sessions_updated_at BEFORE UPDATE ON live_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_live_sessions_test_link ON live_sessions(test_link_id);
CREATE INDEX idx_live_sessions_status ON live_sessions(status);

-- Live viewers table
CREATE TABLE live_viewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER live_viewers_updated_at BEFORE UPDATE ON live_viewers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_live_viewers_session ON live_viewers(live_session_id);
CREATE INDEX idx_live_viewers_user ON live_viewers(user_id);

-- Recordings table
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_link_id UUID NOT NULL REFERENCES test_links(id) ON DELETE CASCADE,
    live_session_id UUID REFERENCES live_sessions(id) ON DELETE SET NULL,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    uploader_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
    duration_ms INTEGER,
    width INTEGER,
    height INTEGER,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted')),
    object_path TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER recordings_updated_at BEFORE UPDATE ON recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_recordings_test_link ON recordings(test_link_id);
CREATE INDEX idx_recordings_org ON recordings(org_id);
CREATE INDEX idx_recordings_status ON recordings(status);

-- Recording segments table
CREATE TABLE recording_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    part_index INTEGER NOT NULL,
    object_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(recording_id, part_index)
);

CREATE TRIGGER recording_segments_updated_at BEFORE UPDATE ON recording_segments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_recording_segments_recording ON recording_segments(recording_id);
CREATE INDEX idx_recording_segments_part ON recording_segments(recording_id, part_index);

-- Comments table
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
    live_session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT,
    timestamp_ms INTEGER,
    body TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'marker')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (recording_id IS NOT NULL OR live_session_id IS NOT NULL)
);

CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_comments_recording ON comments(recording_id);
CREATE INDEX idx_comments_session ON comments(live_session_id);

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
    recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_events_session ON events(live_session_id);
CREATE INDEX idx_events_recording ON events(recording_id);

-- Invites table
CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    token TEXT NOT NULL UNIQUE,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER invites_updated_at BEFORE UPDATE ON invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_invites_org ON invites(org_id);
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_email ON invites(email);

-- Row Level Security Policies

-- Organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view orgs they're members of"
    ON organizations FOR SELECT
    USING (
        owner_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = organizations.id
            AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Only owners can update their organizations"
    ON organizations FOR UPDATE
    USING (owner_user_id = auth.uid());

CREATE POLICY "Authenticated users can create organizations"
    ON organizations FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

-- Memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view memberships in their orgs"
    ON memberships FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = memberships.org_id
            AND organizations.owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Org owners can manage memberships"
    ON memberships FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = memberships.org_id
            AND organizations.owner_user_id = auth.uid()
        )
    );

-- Projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view projects"
    ON projects FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = projects.org_id
            AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Org admins and editors can manage projects"
    ON projects FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = projects.org_id
            AND memberships.user_id = auth.uid()
            AND memberships.role IN ('admin', 'editor')
        )
    );

-- Test links
ALTER TABLE test_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view test links"
    ON test_links FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = test_links.org_id
            AND memberships.user_id = auth.uid()
        ) OR
        (visibility = 'unlisted' AND active = true)
    );

CREATE POLICY "Org admins and editors can manage test links"
    ON test_links FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = test_links.org_id
            AND memberships.user_id = auth.uid()
            AND memberships.role IN ('admin', 'editor')
        )
    );

-- Live sessions
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view live sessions"
    ON live_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM test_links
            JOIN memberships ON memberships.org_id = test_links.org_id
            WHERE test_links.id = live_sessions.test_link_id
            AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Anyone can create live sessions for active test links"
    ON live_sessions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM test_links
            WHERE test_links.id = live_sessions.test_link_id
            AND test_links.active = true
        )
    );

CREATE POLICY "Org members can update live sessions"
    ON live_sessions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM test_links
            JOIN memberships ON memberships.org_id = test_links.org_id
            WHERE test_links.id = live_sessions.test_link_id
            AND memberships.user_id = auth.uid()
        )
    );

-- Recordings
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view recordings"
    ON recordings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = recordings.org_id
            AND memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Org members can create recordings"
    ON recordings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = recordings.org_id
            AND memberships.user_id = auth.uid()
        ) OR uploader_user_id IS NULL
    );

CREATE POLICY "Org members can update recordings"
    ON recordings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = recordings.org_id
            AND memberships.user_id = auth.uid()
        )
    );

-- Comments, Events, Invites - similar RLS patterns
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recording_segments ENABLE ROW LEVEL SECURITY;

-- Function to auto-create membership when org is created
CREATE OR REPLACE FUNCTION create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO memberships (org_id, user_id, role)
    VALUES (NEW.id, NEW.owner_user_id, 'admin');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_owner_membership_trigger
    AFTER INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION create_owner_membership();
