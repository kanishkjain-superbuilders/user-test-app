-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view memberships in their orgs" ON memberships;
DROP POLICY IF EXISTS "Org admins can manage memberships" ON memberships;

-- Create fixed policies without infinite recursion
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
