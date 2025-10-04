-- Add DELETE policy for recordings
-- Allow org admins and editors to delete recordings in their organization

CREATE POLICY "Org admins and editors can delete recordings"
    ON recordings FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.org_id = recordings.org_id
            AND memberships.user_id = auth.uid()
            AND memberships.role IN ('admin', 'editor')
        )
    );
