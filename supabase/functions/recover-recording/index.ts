import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  recordingId: string
  sessionId?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create an admin client (bypasses RLS)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { ...corsHeaders },
        },
      }
    )

    const body: RequestBody = await req.json()
    const { recordingId, sessionId } = body

    if (!recordingId) {
      return new Response(JSON.stringify({ error: 'Missing recordingId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if manifest already exists
    const manifestPath = `${recordingId}/manifest.json`
    const { data: existingManifest } = await adminClient.storage
      .from('recordings')
      .download(manifestPath)

    if (existingManifest) {
      console.log('Manifest already exists, skipping recovery')
      return new Response(
        JSON.stringify({ message: 'Manifest already exists' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get recording and session info
    const { data: recording } = await adminClient
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single()

    if (!recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get session info if sessionId provided
    let sessionStarted = null
    if (sessionId) {
      const { data: session } = await adminClient
        .from('live_sessions')
        .select('started_at')
        .eq('id', sessionId)
        .single()

      if (session) {
        sessionStarted = session.started_at
      }
    }

    // Count uploaded chunks
    const { data: files } = await adminClient.storage
      .from('recordings')
      .list(recordingId, {
        search: 'part-',
      })

    const chunkCount =
      files?.filter((f) => f.name.startsWith('part-'))?.length || 0

    // Calculate duration
    let duration = chunkCount * 5000 // Default: 5 seconds per chunk

    // If we have session start time, use actual elapsed time
    if (sessionStarted) {
      const startTime = new Date(sessionStarted).getTime()
      const endTime = Date.now()
      duration = endTime - startTime
    }

    // Create recovery manifest
    const manifest = {
      version: '1.0',
      recordingId,
      mimeType: 'video/webm',
      codecs: 'vp9,opus',
      totalParts: chunkCount,
      totalBytes: 0, // Can't determine in recovery
      duration,
      width: 1920,
      height: 1080,
      createdAt: new Date().toISOString(),
      recovered: true,
      recoveryReason: 'session_timeout',
      recoveredAt: new Date().toISOString(),
    }

    // Upload recovery manifest to storage
    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    })

    const { error: uploadError } = await adminClient.storage
      .from('recordings')
      .upload(manifestPath, manifestBlob, {
        contentType: 'application/json',
        upsert: false, // Don't overwrite if exists
      })

    if (uploadError && !uploadError.message?.includes('already exists')) {
      console.error('Error uploading recovery manifest:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to upload recovery manifest' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Update recording status
    await adminClient
      .from('recordings')
      .update({
        status: 'recovered',
        duration_ms: duration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordingId)

    console.log(`Recovery manifest created for recording ${recordingId}`)

    return new Response(
      JSON.stringify({
        message: 'Recovery successful',
        manifest,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Recovery error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
