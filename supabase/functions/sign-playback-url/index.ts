import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  recordingId: string
  path: string // e.g., 'recordings/uuid/part-00000.webm' or 'recordings/uuid/manifest.json'
  expiresIn?: number // seconds, default 3600 (1 hour)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header (may be null for public/anonymous playback)
    const authHeader = req.headers.get('Authorization')

    // Create Supabase client with service role key so storage signing works
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get user from JWT (may be null if using anon header)
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    // Parse request body
    const body: RequestBody = await req.json()
    const { recordingId, path, expiresIn = 3600 } = body

    if (!recordingId || !path) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate that the recording exists and determine access policy
    const { data: recording, error: recordingError } = await supabaseClient
      .from('recordings')
      .select('id, org_id, uploader_user_id')
      .eq('id', recordingId)
      .single()

    if (recordingError || !recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Access rules:
    // 1) If recording is anonymous (no uploader_user_id), allow without org membership
    // 2) Otherwise require authenticated user who is a member of the org
    if (recording.uploader_user_id !== null) {
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: membership, error: membershipError } = await supabaseClient
        .from('memberships')
        .select('id')
        .eq('org_id', recording.org_id)
        .eq('user_id', user.id)
        .single()

      if (membershipError || !membership) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Support both old paths ('recordings/<id>/...') and new paths ('<id>/...')
    const normalizedPath = path.startsWith('recordings/')
      ? path.replace(/^recordings\//, '')
      : path

    // Validate the path is within the recording folder
    if (!normalizedPath.startsWith(`${recordingId}/`)) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate signed URL
    const { data: signedUrlData, error: signedUrlError } =
      await supabaseClient.storage
        .from('recordings')
        .createSignedUrl(normalizedPath, expiresIn)

    if (signedUrlError || !signedUrlData) {
      console.error('Error creating signed URL:', signedUrlError)
      return new Response(
        JSON.stringify({ error: 'Failed to create signed URL' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Return signed URL
    return new Response(
      JSON.stringify({
        signedUrl: signedUrlData.signedUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in sign-playback-url:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
