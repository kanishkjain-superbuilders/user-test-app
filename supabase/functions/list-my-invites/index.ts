import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization')!

    // Create client with service role for database access
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user from JWT token
    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get pending invites for the user's email - simple query, no joins
    const { data: invites, error: invitesError } = await supabase
      .from('invites')
      .select('*')
      .eq('email', user.email)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    if (invitesError) {
      throw invitesError
    }

    // Get organization details separately
    const orgIds = [...new Set(invites?.map((i) => i.org_id) || [])]
    const { data: orgs } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)

    // Map organizations to invites
    const invitesWithOrgs = (invites || []).map((invite) => ({
      ...invite,
      organization: orgs?.find((o) => o.id === invite.org_id) || null,
    }))

    return new Response(JSON.stringify({ invites: invitesWithOrgs }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error fetching invites:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
