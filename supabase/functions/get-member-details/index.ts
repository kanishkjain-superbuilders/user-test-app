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
    const { userIds, orgId } = await req.json()

    if (!orgId || !userIds || !Array.isArray(userIds)) {
      return new Response(
        JSON.stringify({ error: 'Organization ID and user IDs are required' }),
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

    // Get user details for all provided user IDs
    const userDetails = await Promise.all(
      userIds.map(async (userId: string) => {
        try {
          const { data, error } = await supabase.auth.admin.getUserById(userId)
          if (error || !data.user) {
            return {
              id: userId,
              email: `User ${userId.slice(0, 8)}...`,
              created_at: new Date().toISOString(),
            }
          }
          return {
            id: data.user.id,
            email: data.user.email || `User ${userId.slice(0, 8)}...`,
            created_at: data.user.created_at,
          }
        } catch {
          return {
            id: userId,
            email: `User ${userId.slice(0, 8)}...`,
            created_at: new Date().toISOString(),
          }
        }
      })
    )

    return new Response(JSON.stringify({ users: userDetails }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error getting member details:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
