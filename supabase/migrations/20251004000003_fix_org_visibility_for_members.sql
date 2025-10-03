-- Fix organization visibility for members
-- Users should be able to see organizations they are members of

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view orgs they own" ON organizations;

-- Create a new policy that allows users to view organizations they own OR are members of
CREATE POLICY "Users can view orgs they own or are members of"
    ON organizations FOR SELECT
    USING (
        owner_user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = organizations.id
            AND memberships.user_id = auth.uid()
        )
    );

-- Ensure the memberships policies are correct
DROP POLICY IF EXISTS "Users can view memberships in their orgs" ON memberships;

-- Users can view their own memberships
CREATE POLICY "Users can view their own memberships"
    ON memberships FOR SELECT
    USING (user_id = auth.uid());

-- Make sure invites table has proper policies too
DROP POLICY IF EXISTS "Users can view invites for their orgs" ON invites;
DROP POLICY IF EXISTS "Users can view invites sent to them" ON invites;

-- Users can view invites sent to their email
CREATE POLICY "Users can view invites sent to them"
    ON invites FOR SELECT
    USING (email = auth.jwt()->>'email');

-- Org owners/admins can view invites for their orgs
CREATE POLICY "Org admins can view invites for their orgs"
    ON invites FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = invites.org_id
            AND memberships.user_id = auth.uid()
            AND memberships.role = 'admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = invites.org_id
            AND organizations.owner_user_id = auth.uid()
        )
    );