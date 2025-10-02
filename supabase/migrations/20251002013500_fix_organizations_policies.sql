-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view orgs they're members of" ON organizations;

-- Create fixed policy without checking memberships table (avoiding circular reference)
-- Users can view organizations where they are the owner
-- Members will be able to view orgs through a separate query or via the memberships table
CREATE POLICY "Users can view orgs they own"
    ON organizations FOR SELECT
    USING (owner_user_id = auth.uid());
