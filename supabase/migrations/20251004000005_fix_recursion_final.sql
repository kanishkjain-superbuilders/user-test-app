-- Final fix for infinite recursion - use a completely different approach
-- Drop all existing policies to start fresh

DROP POLICY IF EXISTS "Users can view all organizations" ON organizations;
DROP POLICY IF EXISTS "Users can view orgs they own or are members of" ON organizations;
DROP POLICY IF EXISTS "Users can view orgs they own" ON organizations;
DROP POLICY IF EXISTS "Users can view their own memberships" ON memberships;
DROP POLICY IF EXISTS "Users can view memberships in their orgs" ON memberships;

-- Create a simple, non-recursive policy for organizations
-- Allow everyone to read organizations (we'll filter in app based on memberships)
CREATE POLICY "Anyone can view organizations"
    ON organizations FOR SELECT
    USING (true);

-- Create a simple policy for memberships
-- Users can only see their own memberships
CREATE POLICY "Users can view their own memberships"
    ON memberships FOR SELECT
    USING (user_id = auth.uid());

-- Add policies for managing organizations and memberships
CREATE POLICY "Owners can update their organizations"
    ON organizations FOR UPDATE
    USING (owner_user_id = auth.uid());

CREATE POLICY "Owners can delete their organizations"
    ON organizations FOR DELETE
    USING (owner_user_id = auth.uid());

CREATE POLICY "Org owners can insert memberships"
    ON memberships FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = org_id
            AND organizations.owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Org owners can update memberships"
    ON memberships FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = org_id
            AND organizations.owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Org owners can delete memberships"
    ON memberships FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM organizations
            WHERE organizations.id = org_id
            AND organizations.owner_user_id = auth.uid()
        )
    );