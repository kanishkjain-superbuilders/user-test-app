-- Create an RPC function that allows anon users to create recordings
-- This bypasses RLS by using SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.create_anon_recording(
    p_test_link_id UUID,
    p_object_path TEXT
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_recording_id UUID;
    v_org_id UUID;
    v_project_id UUID;
    v_is_allowed BOOLEAN;
BEGIN
    -- Check if the test link allows anonymous recordings
    SELECT
        org_id,
        project_id,
        (visibility = 'unlisted' AND active = true)
    INTO v_org_id, v_project_id, v_is_allowed
    FROM test_links
    WHERE id = p_test_link_id;

    -- Raise exception if not allowed
    IF NOT v_is_allowed THEN
        RAISE EXCEPTION 'Test link does not allow anonymous recordings';
    END IF;

    -- Insert the recording
    INSERT INTO recordings (
        test_link_id,
        org_id,
        project_id,
        status,
        object_path,
        uploader_user_id
    ) VALUES (
        p_test_link_id,
        v_org_id,
        v_project_id,
        'uploading',
        p_object_path,
        NULL
    )
    RETURNING id INTO v_recording_id;

    RETURN v_recording_id;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.create_anon_recording(UUID, TEXT) TO anon, authenticated;
