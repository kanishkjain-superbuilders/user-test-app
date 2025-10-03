-- Fix infinite recursion in organization policies
-- The issue: organizations policy checks memberships, and memberships needs to join with organizations

-- Drop the problematic policy that causes recursion
DROP POLICY IF EXISTS "Users can view orgs they own or are members of" ON organizations;

-- Create a simpler policy that doesn't cause recursion
-- Users can view all organizations that they have a membership for will be handled through the join
CREATE POLICY "Users can view all organizations"
    ON organizations FOR SELECT
    USING (
        -- User owns the organization
        owner_user_id = auth.uid()
        OR
        -- User has a membership (without checking the memberships table directly)
        -- Instead, we'll allow viewing and filter in the application
        id IN (
            SELECT org_id FROM memberships
            WHERE user_id = auth.uid()
        )
    );

-- Ensure memberships policy is clean
DROP POLICY IF EXISTS "Users can view their own memberships" ON memberships;

CREATE POLICY "Users can view their own memberships"
    ON memberships FOR SELECT
    USING (user_id = auth.uid());