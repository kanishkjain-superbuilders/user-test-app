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
    const { orgId, inviteeEmail, inviteeId, role = 'viewer' } = await req.json()

    if (!orgId || !inviteeEmail) {
      return new Response(
        JSON.stringify({
          error: 'Organization ID and invitee email are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify user is admin of the organization
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only administrators can invite members' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if user is already a member
    if (inviteeId) {
      const { data: existingMembership } = await supabase
        .from('memberships')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', inviteeId)
        .single()

      if (existingMembership) {
        return new Response(
          JSON.stringify({
            error: 'User is already a member of this organization',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Check if invite already exists
    const { data: existingInvite } = await supabase
      .from('invites')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', inviteeEmail)
      .is('accepted_at', null)
      .single()

    if (existingInvite) {
      return new Response(
        JSON.stringify({
          error: 'An invitation already exists for this email',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Create the invite with a token (internal use only, no email sent)
    const token = crypto.randomUUID()

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .insert({
        org_id: orgId,
        email: inviteeEmail,
        role,
        token,
        // Note: We're not using the email field for actual email sending
        // The user will see pending invites when they log in
      })
      .select()
      .single()

    if (inviteError) {
      throw inviteError
    }

    return new Response(
      JSON.stringify({
        success: true,
        invite,
        message: 'Invitation created. User will see it when they log in.',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error creating invite:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
