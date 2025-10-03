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
    const { searchTerm, orgId } = await req.json()

    if (!searchTerm || searchTerm.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Search term must be at least 2 characters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Verify user is member of the organization
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Not a member of this organization' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Only admins can search for users
    if (membership.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only administrators can search for users' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Search for users by email
    const {
      data: { users },
      error: searchError,
    } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 10,
    })

    if (searchError) {
      throw searchError
    }

    // Filter users by search term
    const filteredUsers = users
      .filter((u) => u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
      .map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      }))

    return new Response(JSON.stringify({ users: filteredUsers }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error searching users:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
