import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface RecordingManifest {
  recordingId: string
  mimeType: string
  codecs: string
  totalParts: number
  totalBytes: number
  duration: number
  width: number
  height: number
  createdAt: string
}

interface RequestBody {
  recordingId: string
  manifest: RecordingManifest
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Create Supabase client with service role for internal operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get user from JWT (may be null for anonymous users)
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    // Parse request body
    const body: RequestBody = await req.json()
    const { recordingId, manifest } = body

    if (!recordingId || !manifest) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Validate that the recording exists
    const { data: recording, error: recordingError } = await supabaseClient
      .from('recordings')
      .select('id, org_id, test_link_id, uploader_user_id')
      .eq('id', recordingId)
      .single()

    if (recordingError || !recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check authorization:
    // 1. If recording has uploader_user_id null, it's an anonymous recording (allowed)
    // 2. If user is authenticated, check if they have access to the org
    if (recording.uploader_user_id !== null) {
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check if user has access to this org
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

    // Upload manifest to storage
    // Path relative to bucket
    const manifestPath = `${recordingId}/manifest.json`
    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    })

    const { error: uploadError } = await supabaseClient.storage
      .from('recordings')
      .upload(manifestPath, manifestBlob, {
        contentType: 'application/json',
        upsert: true,
      })

    if (uploadError) {
      console.error('Error uploading manifest:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to upload manifest' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Update recording with manifest data
    const { error: updateError } = await supabaseClient
      .from('recordings')
      .update({
        total_parts: manifest.totalParts,
        total_bytes: manifest.totalBytes,
        duration_sec: manifest.duration,
        width: manifest.width,
        height: manifest.height,
        mime_type: manifest.mimeType,
        codecs: manifest.codecs,
        manifest_url: manifestPath,
        status: 'completed',
      })
      .eq('id', recordingId)

    if (updateError) {
      console.error('Error updating recording:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update recording' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Create recording_segments entries for each part
    const segments = []
    for (let i = 0; i < manifest.totalParts; i++) {
      segments.push({
        recording_id: recordingId,
        part_index: i,
        storage_path: `${recordingId}/part-${i.toString().padStart(5, '0')}.webm`,
        mime_type: manifest.mimeType,
      })
    }

    if (segments.length > 0) {
      const { error: segmentsError } = await supabaseClient
        .from('recording_segments')
        .insert(segments)

      if (segmentsError) {
        console.error('Error creating segments:', segmentsError)
        // Don't fail the request if segments can't be created
        // They can be recreated from the manifest later
      }
    }

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        recordingId,
        manifestUrl: manifestPath,
        totalParts: manifest.totalParts,
        duration: manifest.duration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in finalize-recording:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
