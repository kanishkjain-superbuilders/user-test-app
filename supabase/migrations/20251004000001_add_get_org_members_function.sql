-- Create a function to get organization members with email addresses
CREATE OR REPLACE FUNCTION get_org_members(org_uuid UUID)
RETURNS TABLE (
    id UUID,
    org_id UUID,
    user_id UUID,
    role TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    user_email TEXT
)
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the current user is a member of the organization
    IF NOT EXISTS (
        SELECT 1 FROM memberships
        WHERE memberships.org_id = org_uuid
        AND memberships.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized to view members of this organization';
    END IF;

    RETURN QUERY
    SELECT
        m.id,
        m.org_id,
        m.user_id,
        m.role,
        m.created_at,
        m.updated_at,
        u.email as user_email
    FROM memberships m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.org_id = org_uuid
    ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_org_members(UUID) TO authenticated;