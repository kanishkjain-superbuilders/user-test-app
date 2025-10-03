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

    // Create service client for database access
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

    // Parse request body
    const { inviteId } = await req.json()

    if (!inviteId) {
      return new Response(JSON.stringify({ error: 'Invite ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the invite
    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('id', inviteId)
      .eq('email', user.email)
      .is('accepted_at', null)
      .single()

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: 'Invite not found or already accepted' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if user is already a member
    const { data: existingMembership } = await supabase
      .from('memberships')
      .select('id')
      .eq('org_id', invite.org_id)
      .eq('user_id', user.id)
      .single()

    if (existingMembership) {
      // Mark invite as accepted anyway
      await supabase
        .from('invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', inviteId)

      return new Response(
        JSON.stringify({
          error: 'You are already a member of this organization',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Start a transaction by creating membership and updating invite
    // Create membership
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .insert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
      })
      .select()
      .single()

    if (membershipError) {
      throw membershipError
    }

    // Mark invite as accepted
    const { error: updateError } = await supabase
      .from('invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inviteId)

    if (updateError) {
      // Try to rollback by deleting the membership
      await supabase.from('memberships').delete().eq('id', membership.id)

      throw updateError
    }

    return new Response(
      JSON.stringify({
        success: true,
        membership,
        message: 'Successfully joined the organization',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error accepting invite:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
